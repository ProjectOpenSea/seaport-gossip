import { ethers } from 'ethers'

import { orderJSONToPrisma } from '../util/convert.js'
import { ErrorTokenIdNumberTooLarge } from '../util/errors.js'
import {
  orderJSONToChecksummedAddresses,
  timestampNow,
} from '../util/helpers.js'
import {
  compareOrdersByCurrentPrice,
  deriveOrderHash,
  isOrderJSON,
  orderHashesFor,
} from '../util/order.js'
import { AuctionType, OrderFilter, OrderSort, Side } from '../util/types.js'

import type { SeaportGossipNode } from '../node.js'
import type {
  Address,
  OrderFilterOpts,
  OrderJSON,
  OrderWithItems,
} from '../util/types.js'
import type { OrderMetadata, Prisma, PrismaClient } from '@prisma/client'

export interface GetOrdersOpts {
  /** Whether to return BUY or SELL offers. Default: SELL */
  side?: Side

  /** Number of results to return. Default: 50 (~50KB). Maximum: 1000 (~1MB) */
  count?: number

  /** Result offset for pagination. Default: 0 */
  offset?: number

  /** Sort option. Default: Newest */
  sort?: OrderSort

  /** Filter options. Default: no filtering */
  filter?: OrderFilterOpts

  /** Only return the order count for the query. Ignores count and offset params. */
  onlyCount?: boolean
}

const defaultGetOrdersOpts: Required<GetOrdersOpts> = {
  side: Side.SELL,
  count: 50,
  offset: 0,
  sort: OrderSort.NEWEST,
  filter: {},
  onlyCount: false,
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

  let side
  if (address !== '*') {
    // Checksum the address
    address = ethers.utils.getAddress(address)

    side =
      opts.side === Side.BUY
        ? { consideration: { some: { token: address } } }
        : { offer: { some: { token: address } } }
  }

  let prismaOpts: Prisma.OrderFindManyArgs | Prisma.OrderCountArgs = {
    where: {
      ...side,
      endTime: { gt: timestampNow() + 5 },
    },
  }

  if (!opts.onlyCount) {
    ;(prismaOpts as Prisma.OrderFindManyArgs).include = {
      offer: true,
      consideration: true,
    }
  }

  // Apply count and offset if we are not sorting by price asc or desc,
  // since we will need all rows to calculate and sort by current price.
  if (
    opts.sort !== OrderSort.PRICE_ASC &&
    opts.sort !== OrderSort.PRICE_DESC &&
    opts.onlyCount === false
  ) {
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
      filterArg as any

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
            auctionType: { in: [AuctionType.BASIC, AuctionType.DUTCH] },
          },
        }
        break
      case OrderFilter.ON_AUCTION:
        prismaOpts = {
          ...prismaOpts,
          where: {
            ...prismaOpts.where,
            startTime: { lte: timestampNow() },
            auctionType: { equals: AuctionType.ENGLISH },
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

  let orders
  if (opts.onlyCount) {
    orders = await prisma.order.count({
      ...prismaOpts,
      select: true,
    })
  } else {
    orders = await prisma.order.findMany(prismaOpts as Prisma.OrderFindManyArgs)
  }

  if (
    !opts.onlyCount &&
    (opts.sort === OrderSort.PRICE_ASC || opts.sort === OrderSort.PRICE_DESC)
  ) {
    orders = (orders as OrderWithItems[]).sort(
      compareOrdersByCurrentPrice(opts.side, opts.sort)
    )

    // Apply count and offset
    orders = orders.slice(opts.offset, opts.offset + opts.count)
  }

  return orders
}

/**
 * Adds an order to the db if valid.
 * If the order already exists in the db, updates its metadata to the latest.
 * @param pin pass true if this is a locally submitted order and should be pinned
 * @param validate pass false if the order data is guaranteed to be valid (e.g. coming from OpenSea API)
 */
export const addOrder = async (
  node: SeaportGossipNode,
  order: OrderJSON,
  pin = false,
  validate = true,
  auctionType?: AuctionType
): Promise<[isAdded: boolean, metadata: OrderMetadata]> => {
  if (!isOrderJSON(order)) throw new Error('invalid order format')

  orderJSONToChecksummedAddresses(order)

  let hash: string
  try {
    hash = deriveOrderHash(order)
  } catch (error: any) {
    throw new Error(`Error parsing order hash: ${error.message ?? error}`)
  }

  const orderAlreadyExistsInDB =
    (await node.prisma.order.findFirst({ where: { hash } })) !== null

  const isFullyFulfilled = await node.validator.isFullyFulfilled(hash)

  let isValid
  let isInvalidDueToInsufficientApprovalsOrBalances
  let lastValidatedBlockNumber
  let lastValidatedBlockHash
  if (validate) {
    ;[
      isValid,
      isInvalidDueToInsufficientApprovalsOrBalances, // eslint-disable-line @typescript-eslint/no-unused-vars
      lastValidatedBlockNumber,
      lastValidatedBlockHash,
    ] = await node.validator.validate(order)
  } else {
    const block = await node.provider.getBlock('latest')
    isValid = true
    lastValidatedBlockNumber = block.number.toString()
    lastValidatedBlockHash = block.hash
  }

  const metadata = {
    isFullyFulfilled,
    isPinned: pin,
    isValid,
    lastValidatedBlockNumber,
    lastValidatedBlockHash,
  }

  const prismaOrder = orderJSONToPrisma(order, hash)
  auctionType = auctionType ?? (await node.validator.auctionType(order))

  if (isValid === true || orderAlreadyExistsInDB || pin)
    await node.prisma.order.upsert({
      where: { hash },
      update: { metadata: { update: metadata } },
      create: {
        ...prismaOrder,
        auctionType,
        metadata: {
          create: metadata,
        },
      },
    })

  const orderMetadata = await node.prisma.orderMetadata.findFirst({
    where: { orderHash: hash },
  })

  if (orderMetadata === null) throw new Error('order metadata missing')

  if (!orderAlreadyExistsInDB) {
    node.metrics?.ordersAdded.inc({
      source: pin === true ? 'local' : 'external',
    })
  }

  return [!orderAlreadyExistsInDB, orderMetadata]
}

/**
 * Returns true if order exceeds maxOrders or maxOrdersPerOfferer
 */
export const exceedsMaxOrderLimits = async (
  order: OrderJSON,
  node: SeaportGossipNode
): Promise<boolean> => {
  if (await exceedsMaxOrders(node)) {
    return true
  }
  const orderCountByOfferer = await node.prisma.order.count({
    where: { offerer: order.offerer },
  })
  if (orderCountByOfferer + 1 > node.opts.maxOrdersPerOfferer) {
    node.logger.info(
      `Exceeded max ${node.opts.maxOrdersPerOfferer} orders per offerer for ${order.offerer} in db`
    )
    return true
  }
  return false
}

/**
 * Returns true if past maxOrder limit
 */
export const exceedsMaxOrders = async (
  node: SeaportGossipNode
): Promise<boolean> => {
  const orderCount = await node.prisma.order.count()
  if (orderCount + 1 > node.opts.maxOrders) {
    node.logger.info(`Exceeded max ${node.opts.maxOrders} orders in db`)
    return true
  }
  return false
}
