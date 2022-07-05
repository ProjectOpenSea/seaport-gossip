import { ethers } from 'ethers'

import type { SeaportGossipNode } from '../dist/node.js'
import type { PrismaClient } from '@prisma/client'

export class MockProvider extends ethers.providers.BaseProvider {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async perform(method: string, params: any[]) {
    if (method === 'getBlockNumber') {
      return 1337
    }
    return super.perform(method, params)
  }
}

/**
 * Truncates all rows from Prisma tables
 */
export const truncateTables = async (node: SeaportGossipNode) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: PrismaClient = (node as any).prisma

  const tablenames = await prisma.$queryRaw<
    Array<{ name: string }>
  >`SELECT name FROM sqlite_schema WHERE type='table'`

  for (const { name } of tablenames) {
    if (name === '_prisma_migrations') continue
    try {
      await prisma.$executeRawUnsafe(`DELETE FROM "${name}";`)
    } catch (error) {
      console.log({ error })
    }
  }
}
