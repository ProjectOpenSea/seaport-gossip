import type { SeaportGossipNode } from '../../dist/node.js'
import type { PrismaClient } from '@prisma/client'

/**
 * Truncates all rows from Prisma tables
 */
export const truncateTables = async (node: SeaportGossipNode) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: PrismaClient = (node as any).prisma

  const tables = await prisma.$queryRaw<
    Array<{ name: string }>
  >`SELECT name FROM sqlite_schema WHERE type='table'`

  for (const { name } of tables) {
    if (name === '_prisma_migrations') continue
    try {
      await prisma.$executeRawUnsafe(`DELETE FROM "${name}";`)
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
export const simulateOrderFulfillment = async (
  prisma: PrismaClient,
  orderHash: string,
  price = '1000000'
) => {
  return prisma.orderMetadata.update({
    where: { orderHash },
    data: { lastFulfilledAt: new Date(), lastFulfilledPrice: price },
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
  const mostRecentlyValidatedBlockNumber = (
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
 * Sets order metadata isAuction value
 */
export const setOrderAsAuction = async (
  prisma: PrismaClient,
  orderHash: string,
  isAuction: boolean
) => {
  return prisma.orderMetadata.update({
    where: { orderHash },
    data: { isAuction },
  })
}

/**
 * Gets order metadata isAuction value
 */
export const orderIsAuction = async (
  prisma: PrismaClient,
  orderHash: string,
) => {
  const metadata = await prisma.orderMetadata.findFirst({
    where: { orderHash },
  })
  if (metadata === null) throw new Error('order metadata not found')
  return metadata.isAuction === true
}
