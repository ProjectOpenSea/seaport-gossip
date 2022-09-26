import { BigNumber, utils as ethersUtils } from 'ethers'

import { ItemType, OrderFilter, OrderSort, Side } from './types.js'

import type {
  Address,
  ConsiderationItem,
  ConsiderationItemJSON,
  OfferItem,
  OfferItemJSON,
  OrderJSON,
  OrderWithItems,
} from './types.js'
import type { PrismaClient } from '@prisma/client'

const { keccak256, toUtf8Bytes } = ethersUtils

/** Seaport contract - Type strings */
const typeStrings = {
  offerItem:
    'OfferItem(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount)',
  considerationItem:
    'ConsiderationItem(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount,address recipient)',
  orderComponentsPartial:
    'OrderComponents(address offerer,address zone,OfferItem[] offer,ConsiderationItem[] consideration,uint8 orderType,uint256 startTime,uint256 endTime,bytes32 zoneHash,uint256 salt,bytes32 conduitKey,uint256 counter)',
  order: () =>
    `${typeStrings.orderComponentsPartial}${typeStrings.considerationItem}${typeStrings.offerItem}`,
}

/** Seaport contract - Type hashes */
const typeHashes = {
  offerItem: keccak256(toUtf8Bytes(typeStrings.offerItem)),
  considerationItem: keccak256(toUtf8Bytes(typeStrings.considerationItem)),
  order: keccak256(toUtf8Bytes(typeStrings.order())),
}

/**
 * Calculates the offer component hash from an offer item.
 */
const toOfferHash = (offerItem: OfferItemJSON) => {
  const components = [
    typeHashes.offerItem.slice(2),
    offerItem.itemType.toString().padStart(64, '0'),
    offerItem.token.slice(2).padStart(64, '0'),
    BigNumber.from(offerItem.identifierOrCriteria)
      .toHexString()
      .slice(2)
      .padStart(64, '0'),
    BigNumber.from(offerItem.startAmount)
      .toHexString()
      .slice(2)
      .padStart(64, '0'),
    BigNumber.from(offerItem.endAmount)
      .toHexString()
      .slice(2)
      .padStart(64, '0'),
  ].join('')

  return keccak256(`0x${components}`)
}

/**
 * Calculates the consideration component hash from a consideration item.
 */
const toConsiderationHash = (considerationItem: ConsiderationItemJSON) => {
  const components = [
    typeHashes.considerationItem.slice(2),
    considerationItem.itemType.toString().padStart(64, '0'),
    considerationItem.token.slice(2).padStart(64, '0'),
    BigNumber.from(considerationItem.identifierOrCriteria)
      .toHexString()
      .slice(2)
      .padStart(64, '0'),
    BigNumber.from(considerationItem.startAmount)
      .toHexString()
      .slice(2)
      .padStart(64, '0'),
    BigNumber.from(considerationItem.endAmount)
      .toHexString()
      .slice(2)
      .padStart(64, '0'),
    considerationItem.recipient.slice(2).padStart(64, '0'),
  ].join('')

  return keccak256(`0x${components}`)
}

/**
 * Calculates the order hash from the order components.
 */
export const orderHash = (order: OrderJSON) => {
  const offerComponents = order.offer
    .map((offerItem) => toOfferHash(offerItem))
    .slice(2)
    .join('')
  const offerHash = keccak256(`0x${offerComponents}`)

  const considerationComponents = order.consideration
    .map((considerationItem) => toConsiderationHash(considerationItem).slice(2))
    .join('')
  const considerationHash = keccak256(`0x${considerationComponents}`)

  const orderComponents = [
    typeHashes.order.slice(2),
    order.offerer.slice(2).padStart(64, '0'),
    order.zone.slice(2).padStart(64, '0'),
    offerHash.slice(2),
    considerationHash.slice(2),
    order.orderType.toString().padStart(64, '0'),
    BigNumber.from(order.startTime).toHexString().slice(2).padStart(64, '0'),
    BigNumber.from(order.endTime).toHexString().slice(2).padStart(64, '0'),
    order.zoneHash.slice(2),
    BigNumber.from(order.salt).toHexString().slice(2).padStart(64, '0'),
    order.conduitKey.slice(2).padStart(64, '0'),
    BigNumber.from(order.consideration.length)
      .toHexString()
      .slice(2)
      .padStart(64, '0'),
    BigNumber.from(order.counter).toHexString().slice(2).padStart(64, '0'),
  ].join('')

  const derivedOrderHash = keccak256(`0x${orderComponents}`)
  return derivedOrderHash
}

/**
 * Validates if an order is an instance of {@link OrderJSON}
 */
export const isOrderJSON = (order: OrderJSON): order is OrderJSON => {
  const keys = Object.keys(order)

  // Order must have at least 13 properties for a basic order
  if (keys.length < 13) return false

  // Order must have only expected fields
  if (keys.some((field) => !(field in order))) return false

  return true
}

/**
 * Validates if an order is an instance of {@link OrderWithItems}
 */
export const isOrderWithItems = (
  order: OrderJSON | OrderWithItems
): order is OrderWithItems => {
  const keys = Object.keys(order)

  // Order must have 13 (basic) or 15 (advanced) properties
  if (keys.length !== 13 && keys.length !== 15) return false

  // Order must have only expected fields
  if (keys.some((field) => !(field in order))) return false

  // Offer and consideration items should have id field if from DB
  if (!order.offer.some((item) => (item as OfferItem).id === undefined))
    return false
  if (
    !order.consideration.some(
      (item) => (item as ConsiderationItem).id === undefined
    )
  )
    return false

  return true
}

/**
 * Returns the price per token of the specified asset.
 */
export const pricePerERC20Token = (_erc20: Address) => {
  return BigInt(25)
}

/**
 * Returns the price per token of the specified asset.
 */
export const pricePerToken = (asset: ItemType.NATIVE | Address) => {
  if (asset === ItemType.NATIVE) {
    // Return native token (mainnet: ETH) price per dollar
    return BigInt(1100)
  }
  // Get token price from oracle
  return pricePerERC20Token(asset)
}

/**
 * Returns an item's current price
 */
export const currentPrice = (
  item: OfferItemJSON | ConsiderationItemJSON,
  startTime: number,
  endTime: number
) => {
  const { startAmount, endAmount, itemType, token } = item
  const currentAmount =
    (BigInt(endAmount) - BigInt(startAmount)) / BigInt(endTime - startTime)
  if (itemType === ItemType.NATIVE) {
    return currentAmount * pricePerToken(itemType)
  } else if (itemType === ItemType.ERC20) {
    return currentAmount * pricePerERC20Token(token)
  }
  return 0n
}

/**
 * Returns a set of orders ordered by current price
 */
export const compareOrdersByCurrentPrice = (
  side: Side,
  sort: OrderSort.PRICE_ASC | OrderSort.PRICE_DESC
) => {
  return (a: OrderJSON | OrderWithItems, b: OrderJSON | OrderWithItems) => {
    let itemA
    let itemB
    if (side === Side.BUY) {
      itemA =
        a.offer[
          a.offer.findIndex(
            (o) =>
              o.itemType === ItemType.NATIVE || o.itemType === ItemType.ERC20
          )
        ]
      itemB =
        b.offer[
          b.offer.findIndex(
            (o) =>
              o.itemType === ItemType.NATIVE || o.itemType === ItemType.ERC20
          )
        ]
    } else if (side === Side.SELL) {
      itemA =
        a.consideration[
          a.consideration.findIndex((c) => c.recipient === a.offerer)
        ]
      itemB =
        b.consideration[
          b.consideration.findIndex((c) => c.recipient === b.offerer)
        ]
    }
    if (itemA === undefined) return -1
    if (itemB === undefined) return 1
    const currentPriceA = currentPrice(itemA, a.startTime, a.endTime)
    const currentPriceB = currentPrice(itemB, b.startTime, b.endTime)
    if (sort === OrderSort.PRICE_ASC) {
      return currentPriceB - currentPriceA > 0 ? 1 : -1
    } else {
      return currentPriceA - currentPriceB > 0 ? -1 : 1
    }
  }
}

/**
 * Returns order hashes for single or bundle items.
 */
export const orderHashesFor = async (
  prisma: PrismaClient,
  token: Address,
  side: Side,
  filter: OrderFilter.SINGLE_ITEM | OrderFilter.BUNDLES
) => {
  const itemType =
    filter === OrderFilter.SINGLE_ITEM ? { equals: 1 } : { gt: 1 }
  const ordHash =
    filter === OrderFilter.SINGLE_ITEM
      ? { _count: { equals: 1 } }
      : { _count: { gt: 1 } }
  let items
  if (side === Side.BUY) {
    items = await prisma.offerItem.groupBy({
      by: ['orderHash', 'itemType'],
      where: { token },
      having: {
        itemType,
        orderHash: ordHash,
      },
    })
  } else {
    items = await prisma.considerationItem.groupBy({
      by: ['orderHash', 'itemType'],
      where: { token },
      having: {
        itemType,
        orderHash: ordHash,
      },
    })
  }
  return items.map((i) => i.orderHash)
}

/**
 * If the order signature is 64 bytes, encode it as 65 bytes since ssz
 * strictly requires it to be 65 bytes. We will make it 64 bytes again on decode.
 */
export const orderSignatureToFixed65Bytes = (signature: string) => {
  if (signature.length === 130) {
    return `0x00${signature.slice(2)}`
  }
  return signature
}

/**
 * Since ssz strictly requires signature as 65 bytes,
 * if we prefixed 00 to the beginning remove it to preserve the original signature.
 */
export const orderSignatureToVariableBytes = (signature: string) => {
  if (signature.slice(2, 4) === '00') {
    return `0x${signature.slice(4)}`
  }
  return signature
}
