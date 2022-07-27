import { ErrorTokenIdNumberTooLarge } from '../errors.js'
import { OrderFilter, OrderSort, Side } from '../types.js'
import {
  compareOrdersByCurrentPrice,
  orderHashesFor,
  timestampNow,
} from '../util/helpers.js'

import type { Address, OrderFilterOpts, OrderWithItems } from '../types.js'
import type { Prisma, PrismaClient } from '@prisma/client'

export interface GetOrdersOpts {
  /** Whether to return BUY or SELL offers. Default: SELL */
  side?: Side

  /** Re-validate every order before returning. Default: true */
  validate?: boolean

  /** Number of results to return. Default: 50 (~50KB). Maximum: 1000 (~1MB) */
  count?: number

  /** Result offset for pagination. Default: 0 */
  offset?: number

  /** Sort option. Default: Newest */
  sort?: OrderSort

  /** Filter options. Default: no filtering */
  filter?: OrderFilterOpts
}

const defaultGetOrdersOpts = {
  side: Side.SELL,
  validate: true,
  count: 50,
  offset: 0,
  sort: OrderSort.NEWEST,
  filter: {},
}

export const formatGetOrdersOpts = (
  getOpts: GetOrdersOpts
): Required<GetOrdersOpts> => {
  const opts: Required<GetOrdersOpts> = {
    ...defaultGetOrdersOpts,
    ...getOpts,
  }
  return opts
}

export const queryOrders = async (
  prisma: PrismaClient,
  address: Address,
  opts: Required<GetOrdersOpts>
) => {
  if (opts.count > 1000)
    throw new Error('getOrders count cannot exceed 1000 per query')

  const itemSide = opts.side === Side.BUY ? 'consideration' : 'offer'

  const side =
    opts.side === Side.BUY
      ? { consideration: { some: { token: address } } }
      : { offer: { some: { token: address } } }

  let prismaOpts: Prisma.OrderFindManyArgs = {
    where: {
      ...side,
      endTime: { gt: timestampNow() + 5 },
    },
    include: {
      offer: true,
      consideration: true,
    },
  }

  // Apply count and offset if we are not sorting by price asc or desc,
  // since we will need all rows to calculate and sort by current price.
  if (opts.sort !== OrderSort.PRICE_ASC && opts.sort !== OrderSort.PRICE_DESC) {
    prismaOpts.take = opts.count
    prismaOpts.skip = opts.offset
  }

  switch (opts.sort) {
    case OrderSort.NEWEST:
      prismaOpts = {
        ...prismaOpts,
        orderBy: { metadata: { createdAt: 'desc' } },
      }
      break
    case OrderSort.OLDEST:
      prismaOpts = {
        ...prismaOpts,
        orderBy: { metadata: { createdAt: 'asc' } },
      }
      break
    case OrderSort.ENDING_SOON:
      prismaOpts = {
        ...prismaOpts,
        orderBy: [{ endTime: 'asc' }],
      }
      break
    case OrderSort.PRICE_ASC:
    case OrderSort.PRICE_DESC:
      // sorted in memory below
      break
    case OrderSort.RECENTLY_FULFILLED:
      prismaOpts = {
        ...prismaOpts,
        orderBy: { metadata: { lastFulfilledAt: 'desc' } },
        where: {
          ...prismaOpts.where,
          metadata: { NOT: { lastFulfilledPrice: null } },
        },
      }
      break
    case OrderSort.RECENTLY_VALIDATED:
      prismaOpts = {
        ...prismaOpts,
        orderBy: { metadata: { lastValidatedBlockNumber: 'desc' } },
        where: { ...prismaOpts.where, metadata: { isValid: true } },
      }
      break
    case OrderSort.HIGHEST_LAST_SALE:
      prismaOpts = {
        ...prismaOpts,
        orderBy: { metadata: { lastFulfilledPrice: 'desc' } },
        where: {
          ...prismaOpts.where,
          metadata: { NOT: { lastFulfilledPrice: null } },
        },
      }
      break
  }

  for (const filterArg of Object.entries(opts.filter)) {
    const [filter, arg]: [OrderFilter, string | bigint | boolean] =
      filterArg as any // eslint-disable-line @typescript-eslint/no-explicit-any

    // Skip filter if arg is false or undefined
    if (arg === false || arg === undefined) continue

    switch (+filter) {
      case OrderFilter.OFFERER_ADDRESS: {
        prismaOpts = {
          ...prismaOpts,
          where: { ...prismaOpts.where, offerer: arg as string },
        }
        break
      }
      case OrderFilter.TOKEN_ID: {
        if (typeof arg === 'number' && !Number.isSafeInteger(arg)) {
          throw ErrorTokenIdNumberTooLarge
        }
        const foundCriteria = await prisma.criteria.findMany({
          where: {
            tokenIds: { contains: `,${arg.toString()},` },
            token: address,
          },
        })
        const criteria = foundCriteria.map((c) => c.hash)
        prismaOpts = {
          ...prismaOpts,
          where: {
            ...prismaOpts.where,
            [itemSide]: {
              ...prismaOpts.where?.[itemSide],
              some: {
                ...prismaOpts.where?.[itemSide]?.some,
                identifierOrCriteria: { in: [arg.toString(), ...criteria] },
              },
            },
          },
        }
        break
      }
      case OrderFilter.BUY_NOW:
        prismaOpts = {
          ...prismaOpts,
          where: {
            ...prismaOpts.where,
            startTime: { lte: timestampNow() },
            metadata: { isAuction: false },
          },
        }
        break
      case OrderFilter.ON_AUCTION:
        prismaOpts = {
          ...prismaOpts,
          where: {
            ...prismaOpts.where,
            startTime: { lte: timestampNow() },
            metadata: { isAuction: true },
          },
        }
        break
      case OrderFilter.SINGLE_ITEM: {
        // only one offer or consideration item with itemType > 1
        const orderHashes = await orderHashesFor(
          prisma,
          address,
          opts.side,
          OrderFilter.SINGLE_ITEM
        )
        prismaOpts = {
          ...prismaOpts,
          where: {
            ...prismaOpts.where,
            hash: { in: orderHashes },
          },
        }
        break
      }
      case OrderFilter.BUNDLES: {
        const orderHashes = await orderHashesFor(
          prisma,
          address,
          opts.side,
          OrderFilter.BUNDLES
        )
        prismaOpts = {
          ...prismaOpts,
          where: {
            ...prismaOpts.where,
            hash: { in: orderHashes },
          },
        }
        break
      }
      case OrderFilter.CURRENCY:
        prismaOpts = {
          ...prismaOpts,
          where: {
            ...prismaOpts.where,
            [itemSide]: {
              some: { token: arg as string },
            },
          },
        }
        break
    }
  }

  let orders = (await prisma.order.findMany(
    prismaOpts
  )) as unknown as OrderWithItems[]

  if (opts.sort === OrderSort.PRICE_ASC || opts.sort === OrderSort.PRICE_DESC) {
    orders = orders.sort(compareOrdersByCurrentPrice(opts.side, opts.sort))

    // Apply count and offset
    orders = orders.slice(opts.offset, opts.offset + opts.count)
  }

  return orders
}
