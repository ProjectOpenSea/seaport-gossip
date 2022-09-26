import { SeaportOrderValidator } from '@opensea/seaport-order-validator'
import { ethers } from 'ethers'

import ISeaport from '../contract-abi/Seaport.json' assert { type: 'json' }
import { OPENSEA_FEE_RECIPIENT } from '../util/constants.js'
import { orderToJSON } from '../util/convert.js'
import { isOrderWithItems, orderHash } from '../util/order.js'

import type {
  Address,
  OrderJSON,
  OrderStatus,
  OrderWithItems,
} from '../util/types.js'
import type { ValidationConfigurationStruct } from '@opensea/seaport-order-validator/dist/typechain-types/contracts/lib/SeaportValidator.js'
import type { PrismaClient } from '@prisma/client'
import type { BigNumber } from 'ethers'
import type winston from 'winston'

interface OrderValidationOpts {
  prisma: PrismaClient
  seaportAddress: Address
  web3Provider: ethers.providers.Provider | string
  logger: winston.Logger
  validateOpenSeaFeeRecipient: boolean
}

export class OrderValidator {
  private prisma: PrismaClient
  private logger: winston.Logger
  private seaport: ethers.Contract
  private provider: ethers.providers.JsonRpcProvider
  private validator: SeaportOrderValidator
  private validationConfiguration: ValidationConfigurationStruct

  constructor(opts: OrderValidationOpts) {
    if (opts.web3Provider === '')
      throw new Error('Please define web3Provider opt for order validation')

    this.prisma = opts.prisma
    this.logger = opts.logger
    this.provider =
      typeof opts.web3Provider === 'string'
        ? new ethers.providers.JsonRpcProvider(opts.web3Provider)
        : (opts.web3Provider as ethers.providers.JsonRpcProvider)
    this.seaport = new ethers.Contract(
      opts.seaportAddress,
      ISeaport,
      this.provider
    )
    this.validator = new SeaportOrderValidator(this.provider)
    this.validationConfiguration = {
      primaryFeeRecipient: opts.validateOpenSeaFeeRecipient
        ? OPENSEA_FEE_RECIPIENT
        : ethers.constants.AddressZero,
      primaryFeeBips: opts.validateOpenSeaFeeRecipient ? 250 : 0,
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

    const hash = orderHash(order)

    const lastBlockNumber = await this.provider.getBlockNumber()
    const lastBlockHash = (await this.provider.getBlock(lastBlockNumber)).hash

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

    this.logger.debug(
      `${errorsAndWarnings.errors.length} errors and ${
        errorsAndWarnings.warnings.length
      } warnings for order ${hash}: ${JSON.stringify(errorsAndWarnings)}`
    )

    if (updateRecordInDB) {
      await this.prisma.orderMetadata.update({
        where: { orderHash: hash },
        data: { isValid },
      })
    }

    return [
      isValid,
      isInvalidDueToInsufficientApprovalsOrBalances,
      lastBlockNumber.toString(),
      lastBlockHash,
    ]
  }

  public async isFullyFulfilled(hash: string) {
    const status: OrderStatus = await this.seaport.getOrderStatus(hash)
    const [totalFilled, totalSize] = status.slice(2) as [BigNumber, BigNumber]
    return totalFilled.eq(totalSize)
  }

  /**
   * Checks if order is restricted and zone is EOA, then the order is likely an auction.
   * In the future we can have a whitelist of "auction zones" as they are created.
   */
  public async isAuction(order: OrderJSON) {
    const isContract = await this._isContract(order.zone)
    if (order.orderType > 1 && !isContract) {
      return true
    }
    return false
  }

  private async _isContract(address: Address) {
    const code = await this.provider.getCode(address)
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
