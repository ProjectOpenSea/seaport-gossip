import { SeaportOrderValidator } from '@opensea/seaport-order-validator'
import { ethers } from 'ethers'

import {
  OPENSEA_FEE_RECIPIENT,
  SHARED_STOREFRONT_LAZY_MINT_ADAPTER,
} from '../util/constants.js'
import { orderToJSON } from '../util/convert.js'
import { deriveOrderHash, isOrderWithItems } from '../util/order.js'
import { AuctionType, OrderType } from '../util/types.js'

import type { SeaportGossipNode } from '../node.js'
import type {
  Address,
  OrderJSON,
  OrderStatus,
  OrderWithItems,
} from '../util/types.js'
import type { ValidationConfigurationStruct } from '@opensea/seaport-order-validator/dist/typechain-types/contracts/lib/SeaportValidator.js'
import type { BigNumber } from 'ethers'

interface OrderValidationOpts {
  node: SeaportGossipNode
}

export class OrderValidator {
  private node: SeaportGossipNode
  private validator: SeaportOrderValidator
  private validationConfiguration: ValidationConfigurationStruct

  constructor(opts: OrderValidationOpts) {
    this.node = opts.node

    this.validator = new SeaportOrderValidator(this.node.provider)
    this.validationConfiguration = {
      primaryFeeRecipient: this.node.opts.validateOpenSeaFeeRecipient
        ? OPENSEA_FEE_RECIPIENT
        : ethers.constants.AddressZero,
      primaryFeeBips: this.node.opts.validateOpenSeaFeeRecipient ? 250 : 0,
      checkCreatorFee: true,
      skipStrictValidation: true,
      shortOrderDuration: 30 * 60, // 30 minutes
      distantOrderExpiration: 60 * 60 * 24 * 7 * 26, // 26 weeks
    }
  }

  /**
   * Validates an order according to the Seaport Order Validator
   * https://github.com/ProjectOpenSea/seaport-order-validator
   */
  public async validate(
    order: OrderJSON | OrderWithItems,
    updateRecordInDB = false
  ): Promise<
    [
      isValid: boolean,
      isInvalidDueToInsufficientApprovalsOrBalances: boolean,
      lastValidatedBlockNumber: string,
      lastValidatedBlockHash: string
    ]
  > {
    if (isOrderWithItems(order)) order = orderToJSON(order)

    const hash = deriveOrderHash(order)

    const lastBlockNumber = await this.node.provider.getBlockNumber()
    const lastBlockHash = (await this.node.provider.getBlock(lastBlockNumber))
      .hash

    const errorsAndWarnings: any =
      await this.validator.isValidOrderWithConfiguration(
        this.validationConfiguration,
        {
          parameters: {
            ...order,
            totalOriginalConsiderationItems: order.consideration.length,
          },
          signature: order.signature,
        }
      )

    // The OpenSea Shared Storefront Lazy Mint adapter doesn't return true
    // for supportsInterface(IERC1155) so we will ignore that specific error.
    if (
      errorsAndWarnings.errors.includes(400) === true &&
      [...order.offer, ...order.consideration].some(
        (item) => item.token === SHARED_STOREFRONT_LAZY_MINT_ADAPTER
      )
    ) {
      errorsAndWarnings.errors = errorsAndWarnings.errors.filter(
        (e: number) => e !== 400
      )
    }

    const isValid = errorsAndWarnings.errors.length === 0
    const isInvalidDueToInsufficientApprovalsOrBalances =
      errorsAndWarnings.errors.every((code: number) =>
        TEMPORARILY_INVALID_VALIDATOR_ISSUE_CODES.includes(code)
      )

    // Convert error and warning codes to readable labels
    errorsAndWarnings.errors = errorsAndWarnings.errors.map(
      (code: number) => VALIDATOR_ISSUE_CODES[code]
    )
    errorsAndWarnings.warnings = errorsAndWarnings.warnings.map(
      (code: number) => VALIDATOR_ISSUE_CODES[code]
    )

    this.node.logger.debug(
      `${errorsAndWarnings.errors.length} errors and ${
        errorsAndWarnings.warnings.length
      } warnings for order ${hash}: ${JSON.stringify(errorsAndWarnings)}`
    )

    if (updateRecordInDB) {
      if (
        errorsAndWarnings.errors.includes('Order fully filled') === true ||
        errorsAndWarnings.errors.includes('Order cancelled') === true ||
        errorsAndWarnings.errors.includes('Order expired') === true
      ) {
        const metadata = await this.node.prisma.orderMetadata.findFirst({
          where: { orderHash: hash },
        })
        if (
          metadata !== null &&
          Number(metadata.lastValidatedBlockNumber) <=
            lastBlockNumber - this.node.opts.revalidateBlockDistance
        ) {
          this.node.logger.debug(
            `Deleting stale order ${hash} for being fully filled, cancelled, or expired`
          )
          await this.node.prisma.order.delete({ where: { hash } })
          this.node.metrics?.ordersDeleted.inc()
        }
      } else {
        await this.node.prisma.orderMetadata.update({
          where: { orderHash: hash },
          data: {
            isValid,
            lastValidatedBlockHash: lastBlockHash,
            lastValidatedBlockNumber: lastBlockNumber.toString(),
          },
        })
      }
    }

    if (isValid) {
      this.node.metrics?.ordersValidated.inc()
    } else {
      this.node.metrics?.ordersInvalidated.inc()
    }
    for (const issue of [
      ...errorsAndWarnings.errors,
      ...errorsAndWarnings.warnings,
    ]) {
      this.node.metrics?.orderValidationErrorsAndWarnings.inc({ issue })
    }

    return [
      isValid,
      isInvalidDueToInsufficientApprovalsOrBalances,
      lastBlockNumber.toString(),
      lastBlockHash,
    ]
  }

  public async isFullyFulfilled(hash: string) {
    const status: OrderStatus = await this.node.seaport.getOrderStatus(hash)
    const [totalFilled, totalSize] = status.slice(2) as [BigNumber, BigNumber]
    return !totalFilled.isZero() && totalFilled.eq(totalSize)
  }

  /**
   * Checks if order is restricted and zone is EOA, then the order is likely an english auction.
   */
  public async auctionType(order: OrderJSON): Promise<AuctionType> {
    if (
      order.orderType === OrderType.FULL_RESTRICTED ||
      order.orderType === OrderType.PARTIAL_RESTRICTED
    ) {
      const isContract = await this._isContract(order.zone)
      if (!isContract) return AuctionType.ENGLISH
    }
    if (
      [...order.offer, ...order.consideration].every(
        (c) => c.startAmount === c.endAmount
      )
    ) {
      return AuctionType.BASIC
    } else {
      return AuctionType.DUTCH
    }
  }

  private async _isContract(address: Address) {
    const code = await this.node.provider.getCode(address)
    return code.length > 2 // '0x'
  }
}

/* eslint-disable @typescript-eslint/naming-convention */
const VALIDATOR_ISSUE_CODES: any = {
  100: 'Invalid order format. Ensure offer/consideration follow requirements',
  200: 'ERC20 identifier must be zero',
  201: 'ERC20 invalid token',
  202: 'ERC20 insufficient allowance to conduit',
  203: 'ERC20 insufficient balance',
  300: 'ERC721 amount must be one',
  301: 'ERC721 token is invalid',
  302: 'ERC721 token with identifier does not exist',
  303: 'ERC721 not owner of token',
  304: 'ERC721 conduit not approved',
  305: 'ERC721 offer item using criteria and more than amount of one requires partial fills.',
  400: 'ERC1155 invalid token',
  401: 'ERC1155 conduit not approved',
  402: 'ERC1155 insufficient balance',
  500: 'Consideration amount must not be zero',
  501: 'Consideration recipient must not be null address',
  502: 'Consideration contains extra items',
  503: 'Private sale can not be to self',
  504: 'Zero consideration items',
  505: 'Duplicate consideration items',
  506: 'Private Sale Order. Be careful on fulfillment',
  507: 'Amount velocity is too high. Amount changes over 5% per 30 min if warning and over 50% per 30 min if error',
  508: 'Amount step large. The steps between each step may be more than expected. Offer items are rounded down and consideration items are rounded up.',
  600: 'Zero offer items',
  601: 'Offer amount must not be zero',
  602: 'More than one offer item',
  603: 'Native offer item',
  604: 'Duplicate offer item',
  605: 'Amount velocity is too high. Amount changes over 5% per 30 min if warning and over 50% per 30 min if error',
  606: 'Amount step large. The steps between each step may be more than expected. Offer items are rounded down and consideration items are rounded up.',
  700: 'Primary fee missing',
  701: 'Primary fee item type incorrect',
  702: 'Primary fee token incorrect',
  703: 'Primary fee start amount too low',
  704: 'Primary fee end amount too low',
  705: 'Primary fee recipient incorrect',
  800: 'Order cancelled',
  801: 'Order fully filled',
  900: 'End time is before start time',
  901: 'Order expired',
  902: 'Order expiration in too long (default 26 weeks)',
  903: 'Order not active',
  904: 'Short order duration (default 30 min)',
  1000: 'Conduit key invalid',
  1100: 'Signature invalid',
  1101: 'Signature counter below current counter',
  1102: 'Signature counter more than two greater than current counter',
  1103: 'Signature may be invalid since totalOriginalConsiderationItems is not set correctly',
  1200: 'Creator fee missing',
  1201: 'Creator fee item type incorrect',
  1202: 'Creator fee token incorrect',
  1203: 'Creator fee start amount too low',
  1204: 'Creator fee end amount too low',
  1205: 'Creator fee recipient incorrect',
  1300: 'Native token address must be null address',
  1301: 'Native token identifier must be zero',
  1302: 'Native token insufficient balance',
  1400: 'Zone rejected order. This order must be fulfilled by the zone.',
  1401: 'Zone not set. Order unfulfillable',
  1500: 'Merkle input only has one leaf',
  1501: 'Merkle input not sorted correctly',
}

/**
 * Error codes that mean offerer has insufficient balance and/or approvals,
 * or the zone has rejected the order. These orders may become valid again.
 * All other error codes mean order is permanently invalid.
 */
const TEMPORARILY_INVALID_VALIDATOR_ISSUE_CODES = [
  202, 203, 303, 304, 401, 402, 1400,
]
