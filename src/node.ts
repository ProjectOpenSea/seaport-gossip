// import { GossipSub } from '@chainsafe/libp2p-gossipsub'
import { Noise } from '@chainsafe/libp2p-noise'
// import { Bootstrap } from '@libp2p/bootstrap'
// import { KadDHT } from '@libp2p/kad-dht'
import { Mplex } from '@libp2p/mplex'
import { WebSockets } from '@libp2p/websockets'
import { Multiaddr } from '@multiformats/multiaddr'
import { PrismaClient } from '@prisma/client'
import { createLibp2p } from 'libp2p'

import { DEFAULT_SEAPORT_ADDRESS } from './constants.js'
import { startGraphqlServer } from './db/index.js'
import { ErrorInvalidAddress, ErrorOrderNotFound } from './errors.js'
import { formatGetOrdersOpts, queryOrders } from './query/order.js'
import { OrderEvent } from './types.js'
import {
  isOrderJSON,
  isValidAddress,
  orderHash,
  orderJSONToPrisma,
  orderToJSON,
} from './util/index.js'
import { Color, createWinstonLogger } from './util/log.js'
import { OrderValidator } from './validate/index.js'

import type { GetOrdersOpts } from './query/order.js'
import type { Address, OrderJSON } from './types.js'
import type { ConnectionManagerEvents } from '@libp2p/interfaces/connection-manager'
import type { PeerId } from '@libp2p/interfaces/peer-id'
import type { ethers } from 'ethers'
import type { Libp2p, Libp2pEvents } from 'libp2p'
import type winston from 'winston'

/**
 * Options for initializing a node.
 */
export interface SeaportGossipNodeOpts {
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
   * The host to use for the websocket connection.
   * Default: 0.0.0.0
   */
  hostname?: string

  /**
   * The port to use for the websocket connection.
   * Default: 8998
   */
  port?: number

  /**
   * The GraphQL port to use.
   * Default: 4000
   */
  graphqlPort?: number

  /**
   * Bootnodes to connect to on start.
   * Format: /ip4/hostname/tcp/port/ws
   * Default: OpenSea signaling server
   */
  bootnodes?: string[] | Multiaddr[]

  /**
   * Minimum peers to be connected to.
   * If peers fall below this number, will ask connected peers for more connections.
   * Default: 3
   */
  minPeers?: number

  /**
   * Maximum peers to be connected to.
   * If peers exceed this number, will drop oldest peers.
   * Default: 7
   */
  maxPeers?: number

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

  /**
   * Optionally pass a custom {@link winston.Logger}
   */
  logger?: winston.Logger | null

  /**
   * Minimum log level to output
   * Default: info
   */
  logLevel?: string

  /**
   * Custom logger label color
   * Default: Color.FG_WHITE
   */
  logColor?: Color
}

/**
 * Default options for initializing a node when unspecified in {@link SeaportGossipNodeOpts}.
 */
const defaultOpts = {
  web3Provider: process.env.WEB3_PROVIDER ?? '',
  peerId: null,
  hostname: '0.0.0.0',
  port: 8998,
  graphqlPort: 4000,
  bootnodes: [],
  minPeers: 3,
  maxPeers: 7,
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
  logger: null,
  logLevel: 'info',
  logColor: Color.FG_WHITE,
}

/**
 * Default OpenSea bootstrap signaling servers
 * Format: `[chainId]: dnsaddr`
 */
const _bootstrapPeers = {
  [1]: '/dnsaddr/eth-mainnet.bootstrap.seaport.opensea.io/p2p/Qm...',
  [5]: '/dnsaddr/eth-goerli.bootstrap.seaport.opensea.io/p2p/Qm...',
  [10]: '/dnsaddr/optimism-mainnet.bootstrap.seaport.opensea.io/p2p/Qm...',
  [420]: '/dnsaddr/optimism-goerli.bootstrap.seaport.opensea.io/p2p/Qm...',
  [137]: '/dnsaddr/polygon-mainnet.bootstrap.seaport.opensea.io/p2p/Qm...',
  [80001]: '/dnsaddr/polygon-mumbai.bootstrap.seaport.opensea.io/p2p/Qm...',
}

/**
 * SeaportGossipNode is a p2p client for sharing Seaport orders.
 */
export class SeaportGossipNode {
  public libp2p!: Libp2p
  public running = false
  public subscriptions: { [key: Address]: OrderEvent[] } = {}

  private opts: Required<SeaportGossipNodeOpts>
  private graphql: ReturnType<typeof startGraphqlServer>
  private prisma: PrismaClient
  private validator: OrderValidator
  private logger: winston.Logger

  constructor(opts: SeaportGossipNodeOpts = {}) {
    this.opts = Object.freeze({ ...defaultOpts, ...opts })
    this.logger =
      this.opts.logger ??
      createWinstonLogger(
        { level: this.opts.logLevel },
        this.opts.peerId?.toString(),
        this.opts.logColor
      )
    this.graphql = startGraphqlServer({
      port: this.opts.graphqlPort,
      logger: this.logger,
    })
    this.prisma = new PrismaClient()
    this.validator = new OrderValidator({
      prisma: this.prisma,
      seaportAddress: this.opts.seaportAddress,
      web3Provider: this.opts.web3Provider,
    })
  }

  /**
   * Start the node.
   */
  public async start() {
    if (this.running) return

    const libp2pOpts = {
      peerId: this.opts.peerId ?? undefined,
      addresses: {
        listen: [`/ip4/${this.opts.hostname}/tcp/${this.opts.port}/ws`],
      },
      transports: [new WebSockets()],
      connectionEncryption: [new Noise()],
      streamMuxers: [new Mplex()],
      connectionManager: {
        autoDial: true,
      },
    }

    this.libp2p = await createLibp2p(libp2pOpts)

    this._addListeners()
    await this.graphql.start()
    await this.libp2p.start()
    this.running = true

    this.logger.info(`Node started. Peer ID: ${this.libp2p.peerId.toString()}`)
    this.logger.info(
      `Advertising the following addresses: ${this.libp2p
        .getMultiaddrs()
        .join(', ')}`
    )

    for (const bootnode of this.opts.bootnodes) {
      await this.connect(bootnode)
    }
  }

  /**
   * Stop the node.
   */
  public async stop() {
    if (!this.running) return
    this.logger.info('Node stopping...')
    this._removeListeners()
    await this.libp2p.stop()
    await this.graphql.stop()
    this.running = false
  }

  /**
   * Connect to a node via its multiaddr.
   */
  public async connect(address: string | Multiaddr) {
    if (typeof address === 'string') {
      address = new Multiaddr(address)
    }
    this.logger.info(`Pinging remote peer at ${address.toString()}`)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const latency = await this.libp2p.ping(address as any)
      this.logger.info(`Pinged ${address.toString()} in ${latency}ms`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      this.logger.error(
        `Error pinging ${address.toString()}: ${error.message ?? error}`
      )
    }
  }

  public async getOrders(address: Address, getOpts: GetOrdersOpts = {}) {
    if (!this.running) await this.start()
    if (!isValidAddress(address)) throw ErrorInvalidAddress

    const opts = formatGetOrdersOpts(getOpts)
    const orders = await queryOrders(this.prisma, address, opts)

    if (opts.validate === false) return orders

    const validOrders = []
    for (const order of orders) {
      const valid = await this.validator.validate(orderToJSON(order))
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
    return this.validator.validate(order)
  }

  public async addOrders(orders: OrderJSON[]) {
    if (!this.running) await this.start()
    let numValid = 0
    for (const order of orders) {
      const isValid = await this._addOrder(order)
      if (isValid) numValid++
    }
    this.logger.info(`Added ${numValid} valid new orders.`)
    return numValid
  }

  private async _addOrder(order: OrderJSON, isPinned = false) {
    if (!isOrderJSON(order)) return false

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

    const metadata = {
      isValid,
      isPinned,
      isExpired,
      isCancelled,
      isAuction,
      isFullyFulfilled,
    }

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
    this.libp2p.addEventListener(
      'peer:discovery',
      this._onPeerDiscovery.bind(this)
    )
    this.libp2p.connectionManager.addEventListener(
      'peer:connect',
      this._onPeerConnect.bind(this)
    )
    this.libp2p.connectionManager.addEventListener(
      'peer:disconnect',
      this._onPeerDisconnect.bind(this)
    )
  }

  private _removeListeners() {
    this.libp2p.removeEventListener(
      'peer:discovery',
      this._onPeerDiscovery.bind(this)
    )
    this.libp2p.connectionManager.removeEventListener(
      'peer:connect',
      this._onPeerConnect.bind(this)
    )
    this.libp2p.connectionManager.removeEventListener(
      'peer:disconnect',
      this._onPeerDisconnect.bind(this)
    )
  }

  private _onPeerDiscovery(event: Libp2pEvents['peer:discovery']) {
    const peer = event.detail
    this.logger.info(`Discovered Peer ID: ${peer.id.toString()}`)
  }

  private _onPeerConnect(event: ConnectionManagerEvents['peer:connect']) {
    const connection = event.detail
    this.logger.info(
      `Connected to Peer ID: ${connection.remotePeer.toString()}`
    )
  }

  private _onPeerDisconnect(event: ConnectionManagerEvents['peer:disconnect']) {
    const connection = event.detail
    this.logger.info(
      `Disconnected from Peer ID: ${connection.remotePeer.toString()}`
    )
  }
}
