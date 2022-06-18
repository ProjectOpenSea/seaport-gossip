import type { OrderWithItems, OrderJSON } from '../types.js'

/**
 * Returns the order hash from the order components.
 */
export const orderHash = async (_order: OrderJSON) => {
  // TODO implement
  return '0x0000000000000000000000000000000000000000000000000000000000000000'
}

/**
 * Prisma {@link OrderWithItems} model to {@link OrderJSON}
 */
export const orderToJSON = (order: OrderWithItems): OrderJSON => {
  for (const item of [...order.offer, ...order.consideration]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (item as any).id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (item as any).orderHash
  }
  const additionalRecipients = order.additionalRecipients !== null ? order.additionalRecipients.split(',') : undefined
  return {
    ...order,
    additionalRecipients
  }
}

/**
 * Returns whether the address is a valid ethereum address.
 */
export const isValidAddress = (address: string) => {
  return address[0] === '0' && address[1] === 'x' && address.length === 42
}