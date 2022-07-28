import { BigNumber, utils as ethersUtils } from 'ethers'

import { ItemType, OrderFilter, OrderSort, Side } from '../types.js'

import type {
  Address,
  ConsiderationItem,
  ConsiderationItemJSON,
  OfferItem,
  OfferItemJSON,
  OrderJSON,
  OrderWithItems,
} from '../types.js'
import type { PrismaClient } from '@prisma/client'

const { keccak256, toUtf8Bytes } = ethersUtils

/** The zero address */
export const zeroAddress = `0x${'0'.repeat(40)}`

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
    order.salt.slice(2).padStart(64, '0'),
    order.conduitKey.slice(2).padStart(64, '0'),
    BigNumber.from(order.counter).toHexString().slice(2).padStart(64, '0'),
  ].join('')

  const derivedOrderHash = keccak256(`0x${orderComponents}`)
  return derivedOrderHash
}

/**
 * Formats a Prisma OfferItem to JSON equivalent.
 */
export const offerItemToJSON = (item: OfferItem): OfferItemJSON => ({
  itemType: item.itemType,
  token: item.token,
  identifierOrCriteria: item.identifierOrCriteria,
  startAmount: item.startAmount.toString(),
  endAmount: item.endAmount.toString(),
})

/**
 * Formats a Prisma OfferItem to JSON equivalent.
 */
export const considerationItemToJSON = (
  item: ConsiderationItem
): ConsiderationItemJSON => ({
  itemType: item.itemType,
  token: item.token,
  identifierOrCriteria: item.identifierOrCriteria,
  startAmount: item.startAmount.toString(),
  endAmount: item.endAmount.toString(),
  recipient: item.recipient,
})

/**
 * Formats a OfferItemJSON to Prisma equivalent.
 */
export const offerItemJSONToPrisma = (item: OfferItemJSON) => ({
  itemType: item.itemType,
  token: item.token,
  identifierOrCriteria: item.identifierOrCriteria,
  startAmount: item.startAmount,
  endAmount: item.endAmount,
})

/**
 * Formats a ConsiderationItemJSON to Prisma equivalent.
 */
export const considerationItemJSONToPrisma = (item: ConsiderationItemJSON) => ({
  itemType: item.itemType,
  token: item.token,
  identifierOrCriteria: item.identifierOrCriteria,
  startAmount: item.startAmount,
  endAmount: item.endAmount,
  recipient: item.recipient,
})

/**
 * Prisma {@link OrderWithItems} model to {@link OrderJSON}
 */
export const orderToJSON = (order: OrderWithItems): OrderJSON => {
  const formattedOfferItems = order.offer.map((o) => offerItemToJSON(o))
  const formattedConsiderationItems = order.consideration.map((o) =>
    considerationItemToJSON(o)
  )

  const additionalRecipients =
    order.additionalRecipients !== undefined &&
    order.additionalRecipients !== null
      ? order.additionalRecipients.split(',')
      : undefined

  return {
    ...order,
    offer: formattedOfferItems,
    consideration: formattedConsiderationItems,
    additionalRecipients,
    numerator: order.numerator?.toString(),
    denominator: order.denominator?.toString(),
  }
}

/**
 * {@link OrderJSON} to Prisma {@link OrderWithItems} model
 */
export const orderJSONToPrisma = (order: OrderJSON, hash: string) => {
  const additionalRecipients =
    order.additionalRecipients !== undefined
      ? order.additionalRecipients.join(',')
      : undefined

  return {
    ...order,
    hash,
    offer: { create: order.offer.map((o) => offerItemJSONToPrisma(o)) },
    consideration: {
      create: order.consideration.map((c) => considerationItemJSONToPrisma(c)),
    },
    additionalRecipients,
    numerator: order.numerator,
    denominator: order.denominator,
  }
}

/**
 * Returns whether the address is a valid ethereum address.
 */
export const isValidAddress = (address: string) => {
  return address[0] === '0' && address[1] === 'x' && address.length === 42
}

/**
 * Validates if an order is an instance of {@link OrderJSON}
 */
export const isOrderJSON = (order: OrderJSON): order is OrderJSON => {
  const keys = Object.keys(order)

  // Order must have 13 (basic) or 15 (advanced) properties
  if (keys.length !== 13 && keys.length !== 15) return false

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
 * Returns the current timestamp in resolution of seconds
 */
export const timestampNow = () => Math.round(Date.now() / 1000)

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
  item: OfferItem | ConsiderationItem,
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
 * Returns the max from a list of bigints
 */
export const bigIntMax = (...args: bigint[]) =>
  args.reduce((m, e) => (e > m ? e : m))

/**
 * Returns the min from a list of bigints
 */
export const bigIntMin = (...args: bigint[]) =>
  args.reduce((m, e) => (e < m ? e : m))

/**
 * Returns a set of orders ordered by current price
 */
export const compareOrdersByCurrentPrice = (
  side: Side,
  sort: OrderSort.PRICE_ASC | OrderSort.PRICE_DESC
) => {
  return (a: OrderWithItems, b: OrderWithItems) => {
    let itemA
    let itemB
    if (side === Side.BUY) {
      itemA = a.offer.find(
        (o) => o.itemType === ItemType.NATIVE || o.itemType === ItemType.ERC20
      )
      itemB = b.offer.find(
        (o) => o.itemType === ItemType.NATIVE || o.itemType === ItemType.ERC20
      )
    } else if (side === Side.SELL) {
      itemA = a.consideration.find((c) => c.recipient === a.offerer)
      itemB = b.consideration.find((c) => c.recipient === b.offerer)
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
