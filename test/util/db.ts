import type { SeaportGossipNode } from '../../dist/node.js'
import type { AuctionType } from '../../dist/util/types.js'
import type { PrismaClient } from '@prisma/client'

/**
 * Truncates all rows from Prisma tables
 */
export const truncateTables = async (node: SeaportGossipNode) => {
  const tables = await node.prisma.$queryRaw<
    Array<{ name: string }>
  >`SELECT name FROM sqlite_schema WHERE type='table'`

  for (const { name } of tables) {
    if (name === '_prisma_migrations') continue
    try {
      await node.prisma.$executeRawUnsafe(`DELETE FROM "${name}";`)
    } catch (error) {
      console.error({ error })
    }
  }
}

/**
 * Returns a random order from the db
 */
export const randomOrder = async (prisma: PrismaClient) => {
  const ordersCount = await prisma.order.count()
  const skip = Math.floor(Math.random() * ordersCount)
  const order = await prisma.order.findFirst({
    skip,
    include: {
      offer: true,
      consideration: true,
    },
  })
  if (order === null) throw new Error('no orders in db')
  return order
}

/**
 * Sets a recent fulfillment for specified order
 */
let nextFulfilledBlock = 0
export const simulateOrderFulfillment = async (
  prisma: PrismaClient,
  orderHash: string,
  price = '1000000'
) => {
  return prisma.orderMetadata.update({
    where: { orderHash },
    data: {
      lastFulfilledAt: (nextFulfilledBlock++).toString(),
      lastFulfilledPrice: price,
    },
  })
}

/**
 * Sets validation status for specified order
 */
export const simulateOrderValidation = async (
  prisma: PrismaClient,
  orderHash: string,
  isValid: boolean
) => {
  const mostRecentlyValidatedBlockNumber =
    (
      await prisma.orderMetadata.findFirst({
        orderBy: { lastValidatedBlockNumber: 'desc' },
      })
    )?.lastValidatedBlockNumber ?? '0'
  const lastValidatedBlockNumber = (
    BigInt(mostRecentlyValidatedBlockNumber) + 1n
  ).toString()
  return prisma.orderMetadata.update({
    where: { orderHash },
    data: { isValid, lastValidatedBlockNumber },
  })
}

/**
 * Sets order metadata AuctionType value
 */
export const setOrderAuctionType = async (
  prisma: PrismaClient,
  orderHash: string,
  auctionType: AuctionType
) => {
  return prisma.order.update({
    where: { hash: orderHash },
    data: { auctionType },
  })
}
