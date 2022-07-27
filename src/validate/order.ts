import { ethers } from 'ethers'

import IERC1155 from '../contract-interfaces/ERC1155.json' assert { type: 'json' }
import IERC20 from '../contract-interfaces/ERC20.json' assert { type: 'json' }
import IERC721 from '../contract-interfaces/ERC721.json' assert { type: 'json' }
import ISeaport from '../contract-interfaces/Seaport.json' assert { type: 'json' }
import { ItemType } from '../types.js'
import { isOrderWithItems, orderHash, orderToJSON } from '../util/index.js'

import type {
  Address,
  ItemJSON,
  OrderJSON,
  OrderStatus,
  OrderWithItems,
} from '../types.js'
import type { PrismaClient } from '@prisma/client'
import type { BigNumber } from 'ethers'

interface OrderValidationOpts {
  prisma: PrismaClient
  seaportAddress: Address
  web3Provider: ethers.providers.Provider | string
}

export class OrderValidator {
  private prisma: PrismaClient
  private seaport: ethers.Contract
  private provider: ethers.providers.Provider

  constructor(opts: OrderValidationOpts) {
    if (opts.web3Provider === '')
      throw new Error('Please define web3Provider opt for order validation')

    this.prisma = opts.prisma
    this.seaport = new ethers.Contract(opts.seaportAddress, ISeaport)
    this.provider =
      typeof opts.web3Provider === 'string'
        ? new ethers.providers.JsonRpcProvider(opts.web3Provider)
        : opts.web3Provider
  }

  public async validate(
    order: OrderJSON | OrderWithItems,
    fulfiller?: Address,
    updateRecordInDB = false
  ) {
    if (isOrderWithItems(order)) order = orderToJSON(order)

    const hash = orderHash(order)

    let isValid = !this.isExpired(order)

    if (isValid) {
      isValid = await this.isCancelled(hash)
    }

    if (isValid) {
      isValid = await this._isFillable(order, fulfiller)
    }

    if (isValid) {
      // TODO add next validation step here
    }

    if (updateRecordInDB) {
      await this.prisma.orderMetadata.update({
        where: { orderHash: hash },
        data: { isValid },
      })
    }

    return true
    // return isValid
  }

  /**
   * Checks live quantities for offer and consideration items.
   */
  private async _isFillable(order: OrderJSON, fulfiller?: Address) {
    let isFillable = true

    for (const offer of order.offer) {
      isFillable = await this._hasSufficientAmount(order.offerer, offer, order)
      if (!isFillable) break
    }

    if (!isFillable || fulfiller === undefined) return isFillable

    for (const consideration of order.consideration) {
      isFillable = await this._hasSufficientAmount(
        fulfiller,
        consideration,
        order
      )
      if (!isFillable) break
    }

    return isFillable
  }

  public isExpired(order: OrderJSON) {
    return order.endTime > Math.floor(new Date().getTime() / 1000)
  }

  public async isCancelled(hash: string) {
    return false /* eslint-disable no-unreachable */
    const status: OrderStatus = await this.seaport.getOrderStatus(hash)
    return status[1]
  }

  public async isFullyFulfilled(hash: string) {
    return false
    const status: OrderStatus = await this.seaport.getOrderStatus(hash)
    const [totalFilled, totalSize] = status.slice(2) as [BigNumber, BigNumber]
    return totalFilled.eq(totalSize)
  }

  /**
   * Checks if order is restricted and zone is EOA, then the order is likely an auction.
   * In the future we can have a whitelist of "auction zones" as they are created.
   */
  public async isAuction(order: OrderJSON) {
    if (order.orderType > 1 && !(await this._isContract(order.zone))) {
      return true
    }
    return false
  }

  private async _isContract(address: Address) {
    return true
    const code = await this.provider.getCode(address)
    return code.length > 2 // '0x'
  }

  private async _isValidatedOnChain(hash: string) {
    return false
    const status: OrderStatus = await this.seaport.getOrderStatus(hash)
    const [isValidated] = status
    return isValidated
  }

  /**
   * If the start and end prices differ, the current price will be interpolated on a linear basis.
   */
  private _currentAmount(
    startAmount: string,
    endAmount: string,
    startTime: number,
    endTime: number
  ) {
    if (startAmount === endAmount) return ethers.BigNumber.from(startAmount)
    const duration = endTime - startTime
    const elapsed = Math.floor(new Date().getTime() / 1000) - startTime
    const remaining = duration - elapsed
    return ethers.BigNumber.from(startAmount)
      .mul(remaining)
      .add(ethers.BigNumber.from(endAmount).mul(elapsed))
      .div(duration)
  }

  private async _hasSufficientAmount(
    address: Address,
    item: ItemJSON,
    order: OrderJSON
  ) {
    const { itemType, token, startAmount, endAmount, identifierOrCriteria } =
      item
    const { startTime, endTime } = order
    switch (itemType) {
      case ItemType.NATIVE: {
        const amount = this._currentAmount(
          startAmount,
          endAmount,
          startTime,
          endTime
        )
        const balance = await this.provider.getBalance(address)
        return balance.gte(amount)
      }
      case ItemType.ERC20: {
        const amount = this._currentAmount(
          startAmount,
          endAmount,
          startTime,
          endTime
        )
        const contract = this._getContract(token, ItemType.ERC20)
        const balance = await contract.balanceOf(address)
        return balance.gte(amount)
      }
      case ItemType.ERC721: {
        const contract = this._getContract(token, ItemType.ERC721)
        const owner = await contract.ownerOf(identifierOrCriteria)
        return owner === address
      }
      case ItemType.ERC1155: {
        const amount = this._currentAmount(
          startAmount,
          endAmount,
          startTime,
          endTime
        )
        const contract = this._getContract(token, ItemType.ERC1155)
        const balance = await contract.balanceOf(address, identifierOrCriteria)
        return ethers.BigNumber.from(balance).gte(amount)
      }
      case ItemType.ERC721_WITH_CRITERIA: {
        const contract = this._getContract(token, ItemType.ERC721)
        const items = await this._itemsFromCriteria(
          contract,
          identifierOrCriteria
        )
        for (const _item of items) {
          const owner = await contract.ownerOf(_item)
          if (owner === address) return true
        }
        return false
      }
      case ItemType.ERC1155_WITH_CRITERIA: {
        const amount = this._currentAmount(
          startAmount,
          endAmount,
          startTime,
          endTime
        )
        const contract = this._getContract(token, ItemType.ERC1155)
        const items = await this._itemsFromCriteria(
          contract,
          identifierOrCriteria
        )
        for (const _item of items) {
          const balance = await contract.balanceOf(address, _item)
          if (ethers.BigNumber.from(balance).gte(amount)) return true
        }
        return false
      }
      default:
        throw new Error('unknown itemType')
    }
  }

  private async _itemsFromCriteria(
    _contract: ethers.Contract,
    _criteria: string
  ) {
    // TODO implement
    return []
  }

  private _getContract(address: Address, itemType: ItemType) {
    let abi
    switch (itemType) {
      case ItemType.ERC20:
        abi = IERC20
        break
      case ItemType.ERC721:
        abi = IERC721
        break
      case ItemType.ERC1155:
        abi = IERC1155
        break
      default:
        throw new Error('unknown itemType')
    }
    return new ethers.Contract(address, abi, this.provider)
  }
}
