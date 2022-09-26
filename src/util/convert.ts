import { BigNumber, ethers } from 'ethers'

import type {
  ConsiderationItem,
  ConsiderationItemJSON,
  OfferItem,
  OfferItemJSON,
  OrderJSON,
  OrderWithItems,
} from './types.js'

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
      : []

  delete (order as any).hash

  return {
    ...order,
    offer: formattedOfferItems,
    consideration: formattedConsiderationItems,
    salt: BigNumber.from(order.salt).toString(),
    additionalRecipients,
    numerator: order.numerator?.toString() ?? '0',
    denominator: order.denominator?.toString() ?? '0',
    extraData: order.extraData?.toString() ?? ethers.constants.HashZero,
  }
}

/**
 * {@link OrderJSON} to Prisma {@link OrderWithItems} model
 */
export const orderJSONToPrisma = (order: OrderJSON, hash: string) => {
  const additionalRecipients =
    order.additionalRecipients !== undefined &&
    order.additionalRecipients !== null
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
