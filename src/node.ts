// import { GossipSub } from '@chainsafe/libp2p-gossipsub'
import { Noise } from '@chainsafe/libp2p-noise'
import { Bootstrap } from '@libp2p/bootstrap'
// import { KadDHT } from '@libp2p/kad-dht'
import { Mplex } from '@libp2p/mplex'
import { WebSockets } from '@libp2p/websockets'
import { PrismaClient } from '@prisma/client'
import { createLibp2p } from 'libp2p'

import { DEFAULT_SEAPORT_ADDRESS } from './constants.js'
import { server } from './db/index.js'
import { ErrorInvalidAddress, ErrorOrderNotFound } from './errors.js'
import { OrderEvent, OrderFilter, OrderSort } from './types.js'
import {
  instanceOfOrder,
  isValidAddress,
  orderHash,
  orderJSONToPrisma,
  orderToJSON,
} from './util/index.js'
import { OrderValidator } from './validate/index.js'

import type { Address, OrderFilterOpts, OrderJSON , OrderWithItems } from './types.js'
import type { ConnectionManagerEvents } from '@libp2p/interfaces/connection-manager'
import type { PeerId } from '@libp2p/interfaces/peer-id'
import type { Prisma } from '@prisma/client'
import type { ethers } from 'ethers'
import type { Libp2p, Libp2pEvents } from 'libp2p'

interface SeaportGossipNodeOpts {
  /**
   * Ethereum JSON-RPC url for order validation, or a custom {@link ethers} provider.
   * This can also be a url specified via environment variable `WEB3_PROVIDER`.
   * The ethereum chain ID this node will use will be requested from this provider via `eth_chainId`.
   */
  web3Provider?: string | ethers.providers.Provider

  /**
   * The peer ID to use for this node.
   * Default: randomly generated
   */
  peerId?: PeerId | null

  /**
   * Collections to start watching on start.
   * Default: none
   */
  collectionAddresses?: Address[]

  /**
   * Default set of events to subscribe per collection.
   * Default: all events
   */
  collectionEvents?: OrderEvent[]

  /**
   * Maximum number of orders to keep in the database. Approx 1KB per order.
   * Default: 100_000 (~100MB)
   */
  maxOrders?: number

  /**
   * Maximum number of orders per offerer to keep in the database,
   * to help mitigate spam and abuse. When limit is reached, new orders
   * are ignored until known orders expire via endTime. Limit does not
   * apply to locally submitted transactions, but keep in mind receiving
   * nodes may choose to ignore if their own limits are reached. Healthy
   * order submission includes short endTimes and use of criteria.
   * Default: 100
   **/
  maxOrdersPerOfferer?: number

  /**
   * Maximum days in advance to keep an order until its startTime.
   * Default: 14 days
   */
  maxOrderStartTime?: number

  /**
   * Maximum days to keep an order until its endTime.
   * Default: 180 days
   */
  maxOrderEndTime?: number

  /**
   * Maximum days to keep an order after it has been fulfilled or cancelled.
   * Default: 7 days
   */
  maxOrderHistory?: number

  /**
   * Maximum RPC requests to make per day validating orders.
   * If the 24 hour limit has not been hit then requests are granted
   * on a per-second basis.
   * Default: 25,000 requests
   */
  maxRPCRequestsPerDay?: number

  /**
   * Optional custom Seaport address. Default: Seaport v1.1 address
   * This can also be an address specified via environment variable `SEAPORT_ADDRESS`
   */
  seaportAddress?: Address

  /**
   * Enable metrics by passing a Prometheus IP and port (e.g. `127.0.0.1:9090`)
   * Default: disabled
   */
  metricsAddress?: string | null
}

const defaultOpts = {
  web3Provider: process.env.WEB3_PROVIDER ?? '',
  peerId: null,
  collectionAddresses: [],
  collectionEvents: Object.values(OrderEvent) as OrderEvent[],
  maxOrders: 100_000,
  maxOrdersPerOfferer: 100,
  maxOrderStartTime: 14,
  maxOrderEndTime: 180,
  maxOrderHistory: 7,
  maxRPCRequestsPerDay: 25_000,
  seaportAddress: process.env.SEAPORT_ADDRESS ?? DEFAULT_SEAPORT_ADDRESS,
  metricsAddress: null,
}

export interface GetOrdersOpts {
  /** Re-validate every order before returning. Default: true */
  validate?: boolean

  /** Number of results to return. Default: 50 (\~50KB). Maximum: 1000 (~1MB) */
  count?: number

  /** Result offset for pagination. Default: 0 */
  offset?: number

  /** Sort option. Default: Newest */
  sort?: OrderSort

  /** Filter options. Default: no filtering */
  filter?: OrderFilterOpts
}

const defaultGetOrdersOpts = {
  validate: true,
  count: 50,
  offset: 0,
  sort: OrderSort.NEWEST,
  filter: {},
}

export class SeaportGossipNode {
  public libp2p!: Libp2p
  public running = false
  public subscriptions: { [key: Address]: OrderEvent[] } = {}

  private opts: Required<SeaportGossipNodeOpts>
  private graphql: typeof server
  private prisma: PrismaClient
  private validator: OrderValidator

  constructor(opts: SeaportGossipNodeOpts = {}) {
    this.opts = Object.freeze({ ...defaultOpts, ...opts })
    this.graphql = server
    this.prisma = new PrismaClient()
    this.validator = new OrderValidator({
      prisma: this.prisma,
      seaportAddress: this.opts.seaportAddress,
      web3Provider: this.opts.web3Provider,
    })
  }

  public async start() {
    if (this.running) return
    const libp2pOpts = {
      addresses: {
        listen: ['/ip4/127.0.0.1/tcp/8000/ws'],
      },
      transports: [new WebSockets()],
      connectionEncryption: [new Noise()],
      streamMuxers: [new Mplex()],
      peerDiscovery: [
        new Bootstrap({
          list: [
            // /dnsaddr/bootstrap.seaport.opensea.io/p2p/Qm
            '/dns4/127.0.0.1/tcp/9090/ws/',
          ],
        }),
      ],
      connectionManager: {
        autoDial: true,
      },
    }
    this.libp2p = await createLibp2p(libp2pOpts)
    this._addListeners()
    await this.graphql.start()
    await this.libp2p.start()
    this.running = true
  }

  public async stop() {
    if (!this.running) return
    this._removeListeners()
    await this.libp2p.stop()
    await this.graphql.stop()
    this.running = false
  }

  public async getOrders(address: Address, getOpts: GetOrdersOpts = {}) {
    if (!this.running) await this.start()
    if (!isValidAddress(address)) throw ErrorInvalidAddress

    const opts: Required<GetOrdersOpts> = {
      ...defaultGetOrdersOpts,
      ...getOpts,
    }
    if (opts.count > 1000)
      throw new Error('getOrders count cannot exceed 1000 per query')

    let prismaOpts: Prisma.OrderFindManyArgs = {
      take: opts.count,
      skip: opts.offset,
      where: {
        OR: [
          { offer: { some: { token: address } } },
          { consideration: { some: { token: address, } } }
        ]
      },
      include: {
        offer: true,
        consideration: true,
      },
    }

    switch (opts.sort) {
    case OrderSort.NEWEST:
      prismaOpts = { ...prismaOpts, orderBy: { ...prismaOpts.orderBy, metadata: { createdAt: 'desc' } } }
      break
    case OrderSort.OLDEST:
      prismaOpts = { ...prismaOpts, orderBy: { ...prismaOpts.orderBy, metadata: { createdAt: 'asc' } } }
      break
    case OrderSort.ENDING_SOON:
      // endTime < now + 1 minute, sort endTime desc 
      break
    case OrderSort.PRICE_ASC:
      // current_price = (endPrice - startPrice) / (endTime - startTime)
      // current_price asc
      break
    case OrderSort.PRICE_DESC:
      // current_price desc
      break
    case OrderSort.RECENTLY_FULFILLED:
      // fulfilledAt desc
      break
    case OrderSort.RECENTLY_VALIDATED:
      // sort lastValidatedBlockNumber desc and isValidated = true
      break
    case OrderSort.HIGHEST_LAST_SALE:
      // fulfilledPrice desc
      break
    }

    for (const filterArg of Object.entries(opts.filter)) {
      const [filter, arg]: [OrderFilter, string | bigint[] | undefined] =
        filterArg as any // eslint-disable-line @typescript-eslint/no-explicit-any
      switch (filter) {
      case OrderFilter.OFFERER_ADDRESS:
        if (arg === undefined) break
        prismaOpts = {
          ...prismaOpts,
          where: { ...prismaOpts.where, offerer: arg as string },
        }
        break
      case OrderFilter.TOKEN_IDS: {
        /*
        if (arg === undefined) break
        const tokenIds = (arg as bigint[]).map((a) => ({
          identifierOrCriteria: a.toString(),
        }))
        const foundCriteria = this.prisma.criteria.findMany({ include: { tokenIdForCriteria: { where: { OR: (arg as bigint[]).map((a) => ({
          tokenId: a.toString() }) }
        }}})
        const criteria = foundCriteria.map((c) => ({
          identifierOrCriteria: c.hash
        }))
        const OR = [...tokenIds, ...criteria]
        prismaOpts = {
          ...prismaOpts,
          include: {
            ...prismaOpts.include,
            offer: {
              where: {
                OR
              },
            },
          },
        }
        */
        break
      }
      case OrderFilter.BUY_NOW:
        // startTime >= now, endTime < now, isAuction: false
        break
      case OrderFilter.ON_AUCTION:
        // startTime >= now, endTime < now, isAuction: true
        break
      case OrderFilter.SINGLE_ITEM:
        // one consideration item
        break
      case OrderFilter.BUNDLES:
        // more than one consideration item
        break
      case OrderFilter.CURRENCY:
        if (arg === undefined) break
        prismaOpts = {
          ...prismaOpts,
          include: { ...prismaOpts.include, consideration: { where: { token: arg as string } } },
        }
        break
      case OrderFilter.HAS_OFFERS:
        // multiple offer items, single consideration item
        break
      }
    }

    const orders = await this.prisma.order.findMany(prismaOpts)
    if (opts.validate === false) return orders
    const validOrders = []
    for (const order of orders) {
      const valid = await this.validator.validate(orderToJSON(order as OrderWithItems))
      if (valid) validOrders.push(order)
    }
    return validOrders
  }

  public async getOrderByHash(hash: string) {
    if (!this.running) await this.start()
    const order = await this.prisma.order.findUnique({
      where: { hash },
      include: { offer: true, consideration: true },
    })
    if (order !== null) return order
    // TODO try to get from network
    return order
  }

  public async validateOrderByHash(hash: string) {
    const order = await this.getOrderByHash(hash)
    if (order === null) throw ErrorOrderNotFound
    return this.validator.validate(orderToJSON(order))
  }

  public async addOrders(orders: OrderJSON[]) {
    if (!this.running) await this.start()
    let numValid = 0
    for (const order of orders) {
      const isValid = await this._addOrder(order)
      if (isValid) numValid++
    }
    return numValid
  }

  private async _addOrder(order: OrderJSON, isPinned = false) {
    if (!instanceOfOrder(order)) return false

    let hash: string
    try {
      hash = orderHash(order)
    } catch {
      return false
    }

    const isValid = await this.validator.validate(order)
    const isExpired = this.validator.isExpired(order)
    const isCancelled = await this.validator.isCancelled(hash)

    const isAuction = await this.validator.isAuction(order)
    const isFullyFulfilled = await this.validator.isFullyFulfilled(hash)

    const metadata = { isValid, isPinned, isExpired, isCancelled, isAuction, isFullyFulfilled }
    
    const prismaOrder = orderJSONToPrisma(order, hash)

    await this.prisma.order.upsert({
      where: { hash },
      update: { metadata: { update: metadata } },
      create: {
        ...prismaOrder,
        metadata: {
          create: metadata,
        },
      },
    })

    return isValid
  }

  public async subscribe(
    address: Address,
    events: OrderEvent[] = this.opts.collectionEvents,
    _onEvent: (event: OrderEvent) => void
  ) {
    if (!this.running) await this.start()
    if (!isValidAddress(address)) return false
    if (events.length === 0) return false
    this.subscriptions[address] = events
    return true
  }

  public async unsubscribe(address: Address) {
    if (!this.running) return
    if (address in this.subscriptions) {
      delete this.subscriptions[address]
      return true
    }
    return false
  }

  public async stats() {
    return {}
  }

  private async _removeOrder(hash: string) {
    await this.prisma.orderMetadata.update({
      where: { orderHash: hash },
      data: { isRemoved: true },
    })
  }

  private async _deleteOrder(hash: string, keepPinned = true) {
    if (keepPinned) {
      const metadata = await this.prisma.orderMetadata.findUnique({
        where: { orderHash: hash },
      })
      if (metadata === null)
        throw new Error(`Cannot locate order metadata (order hash: ${hash})`)
      if (metadata.isPinned === true) return
    }

    const batch = []
    batch.push(this.prisma.offerItem.deleteMany({ where: { orderHash: hash } }))
    batch.push(
      this.prisma.considerationItem.deleteMany({ where: { orderHash: hash } })
    )
    batch.push(this.prisma.orderMetadata.delete({ where: { orderHash: hash } }))
    batch.push(this.prisma.order.delete({ where: { hash } }))

    await this.prisma.$transaction(batch)
  }

  private _addListeners() {
    this.libp2p.addEventListener('peer:discovery', this._onPeerDiscovery)
    this.libp2p.connectionManager.addEventListener(
      'peer:connect',
      this._onPeerConnect
    )
    this.libp2p.connectionManager.addEventListener(
      'peer:disconnect',
      this._onPeerDisconnect
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.libp2p.addEventListener<any>('start', this._onStart)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.libp2p.addEventListener<any>('stop', this._onStop)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.libp2p.addEventListener<any>('error', this._onError)
  }

  private _removeListeners() {
    this.libp2p.removeEventListener('peer:discovery', this._onPeerDiscovery)
    this.libp2p.connectionManager.removeEventListener(
      'peer:connect',
      this._onPeerConnect
    )
    this.libp2p.connectionManager.removeEventListener(
      'peer:disconnect',
      this._onPeerDisconnect
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.libp2p.removeEventListener<any>('stop', this._onStop)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.libp2p.removeEventListener<any>('start', this._onStart)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.libp2p.removeEventListener<any>('error', this._onError)
  }

  private _onPeerDiscovery(event: Libp2pEvents['peer:discovery']) {
    const peer = event.detail
    console.log(`Discovered: ${peer.id.toB58String()}`)
  }

  private _onPeerConnect(event: ConnectionManagerEvents['peer:connect']) {
    const connection = event.detail
    console.log(`Connected: ${connection.remotePeer.toB58String()}`)
  }

  private _onPeerDisconnect(event: ConnectionManagerEvents['peer:disconnect']) {
    const connection = event.detail
    console.log(`Disconnected: ${connection.remotePeer.toB58String()}`)
  }

  private _onStart() {
    console.log(`Node started. Peer ID: ${this.libp2p.peerId.toString()}`)
    console.log(
      `libp2p is advertising the following addresses: ${this.libp2p
        .getMultiaddrs()
        .join(', ')}`
    )
  }

  private _onStop() {
    console.log('Node stopping...')
  }

  private _onError(err: Error) {
    console.error(`An error occurred: ${err?.message ?? err}`)
  }
}
