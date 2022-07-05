import { BigNumber, utils as ethersUtils } from 'ethers'

import type {
  ConsiderationItem,
  ConsiderationItemJSON,
  OfferItem,
  OfferItemJSON,
  OrderJSON,
  OrderWithItems,
} from '../types.js'

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
const toConsiderationHash = (
  considerationItem: ConsiderationItemJSON
) => {
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
    .map((considerationItem) =>
      toConsiderationHash(considerationItem).slice(2)
    )
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
export const considerationItemToJSON = (item: ConsiderationItem): ConsiderationItemJSON => ({
  itemType: item.itemType,
  token: item.token,
  identifierOrCriteria: item.identifierOrCriteria,
  startAmount: item.startAmount.toString(),
  endAmount: item.endAmount.toString(),
  recipient: item.recipient
})

/**
 * Formats a OfferItemJSON to Prisma equivalent.
 */
export const offerItemJSONToPrisma = (item: OfferItemJSON)  => ({
  itemType: item.itemType,
  token: item.token,
  identifierOrCriteria: item.identifierOrCriteria,
  startAmount: BigInt(item.startAmount),
  endAmount: BigInt(item.endAmount),
})

/**
 * Formats a ConsiderationItemJSON to Prisma equivalent.
 */
export const considerationItemJSONToPrisma = (item: ConsiderationItemJSON)  => ({
  itemType: item.itemType,
  token: item.token,
  identifierOrCriteria: item.identifierOrCriteria,
  startAmount: BigInt(item.startAmount),
  endAmount: BigInt(item.endAmount),
  recipient: item.recipient
})

/**
 * Prisma {@link OrderWithItems} model to {@link OrderJSON}
 */
export const orderToJSON = (order: OrderWithItems): OrderJSON => {
  const formattedOfferItems = order.offer.map((o) => offerItemToJSON(o))
  const formattedConsiderationItems = order.consideration.map((o) => considerationItemToJSON(o))

  const additionalRecipients =
    order.additionalRecipients !== null
      ? order.additionalRecipients.split(',')
      : undefined

  return {
    ...order,
    offer: formattedOfferItems,
    consideration: formattedConsiderationItems,
    additionalRecipients,
    numerator: order.numerator?.toString(),
    denominator: order.denominator?.toString()
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
    consideration: { create: order.consideration.map((c) => considerationItemJSONToPrisma(c)) },
    additionalRecipients,
    numerator: typeof order.numerator === 'string' ? BigInt(order.numerator) : undefined,
    denominator: typeof order.denominator === 'string' ? BigInt(order.denominator) : undefined,
  }
}

/**
 * Returns whether the address is a valid ethereum address.
 */
export const isValidAddress = (address: string) => {
  return address[0] === '0' && address[1] === 'x' && address.length === 42
}

export const instanceOfOrder = (order: OrderJSON): order is OrderJSON => {
  const keys = Object.keys(order)

  // Order must have 13 (basic) or 15 (advanced) properties
  if (keys.length !== 13 && keys.length !== 15) return false

  // Order must have only expected fields
  if (keys.some((field) => !(field in order))) return false

  return true
}
