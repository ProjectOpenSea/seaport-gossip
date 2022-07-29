import { GossipSub } from '@chainsafe/libp2p-gossipsub'
import { MessageAcceptance } from '@chainsafe/libp2p-gossipsub/types'
import { Noise } from '@chainsafe/libp2p-noise'
import { KadDHT } from '@libp2p/kad-dht'
import { Mplex } from '@libp2p/mplex'
import { WebSockets } from '@libp2p/websockets'
import { PrismaClient } from '@prisma/client'
import { createLibp2p } from 'libp2p'

import { DEFAULT_SEAPORT_ADDRESS } from './constants.js'
import { startGraphqlServer } from './db/index.js'
import {
  ErrorInvalidAddress,
  ErrorNodeNotRunning,
  ErrorOrderNotFound,
} from './errors.js'
import { addOrder, formatGetOrdersOpts, queryOrders } from './query/order.js'
import {
  isValidAddress,
  orderHash,
  orderJSONToUint8Array,
  orderToJSON,
  short,
  uint8ArrayToOrderJSON,
  zeroAddress,
} from './util/index.js'
import { Color, createWinstonLogger } from './util/log.js'
import { OrderValidator } from './validate/index.js'

import type { GetOrdersOpts } from './query/order.js'
import type { Address, OrderJSON } from './types.js'
import type { GossipsubMessage } from '@chainsafe/libp2p-gossipsub'
import type { ConnectionManagerEvents } from '@libp2p/interfaces/connection-manager'
import type { PeerId } from '@libp2p/interfaces/peer-id'
import type { PeerInfo } from '@libp2p/interfaces/peer-info'
import type { Multiaddr } from '@multiformats/multiaddr'
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
   * Path to the datadir to use (dev.db must be located inside)
   * Default in dev: ./datadirs/datadir
   * Default in prod: TBD, probably datadir within OS-specific app config folder
   */
  datadir?: string

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
   * Default: OpenSea rendezvous server
   */
  bootnodes?: Array<[PeerId, Multiaddr[]]>

  /**
   * Minimum p2p connections.
   * Will dial for more peers if connections falls below this number.
   * Default: 5
   */
  minConnections?: number

  /**
   * Maximum p2p connections.
   * Will prune connections if exceeds this number.
   * Default: 15
   */
  maxConnections?: number

  /**
   * Collections to watch on start.
   * Use 'all' to subscribe to all topics.
   * Default: none
   */
  collectionAddresses?: Address[]

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

  /**
   * If the node should start in client or server mode
   * Default: true
   */
  clientMode?: boolean

  /**
   * For custom libp2p behavior, this object is passed
   * to the libp2p create options.
   * Default: none
   */
  customLibp2pConfig?: object
}

/**
 * Default options for initializing a node when unspecified in {@link SeaportGossipNodeOpts}.
 */
const defaultOpts = {
  web3Provider: process.env.WEB3_PROVIDER ?? '',
  datadir: './datadirs/datadir',
  peerId: null,
  hostname: '0.0.0.0',
  port: 8998,
  graphqlPort: 4000,
  bootnodes: [],
  minConnections: 5,
  maxConnections: 15,
  collectionAddresses: [],
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
  clientMode: true,
  customLibp2pConfig: {},
}

/**
 * SeaportGossipNode is a p2p client for sharing Seaport orders.
 */
export class SeaportGossipNode {
  public libp2p!: Libp2p
  public running = false

  private opts: Required<SeaportGossipNodeOpts>
  private gossipsub!: GossipSub
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
    this.prisma = new PrismaClient({
      datasources: { db: { url: `file:../${this.opts.datadir}/dev.db` } },
    })
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

    const seaportDHT = new KadDHT({
      protocolPrefix: '/seaport',
      clientMode: this.opts.clientMode,
    })

    this.gossipsub = new GossipSub({
      allowPublishToZeroPeers: true,
      asyncValidation: true,
      awaitRpcHandler: true,
      awaitRpcMessageHandler: true,
      doPX: !this.opts.clientMode,
      msgIdFn: (msg) =>
        Uint8Array.from(
          Buffer.concat([
            Buffer.from(msg.topic.slice(2), 'hex'),
            Buffer.from(
              orderHash(uint8ArrayToOrderJSON(msg.data)).slice(2),
              'hex'
            ),
          ])
        ),
    })

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
        minConnections: this.opts.minConnections,
        maxConnections: this.opts.maxConnections,
      },
      dht: seaportDHT,
      pubsub: this.gossipsub,
      metrics: {
        enabled: this.opts.metricsAddress !== null,
      },
      ...this.opts.customLibp2pConfig,
    }

    this.libp2p = await createLibp2p(libp2pOpts)

    this._addListeners()
    await this.graphql.start()
    await this.libp2p.start()
    this.running = true

    this.logger.info(
      `Node started with Peer ID: ${this.libp2p.peerId.toString()}`
    )
    this.logger.info(
      `Advertising the following addresses: ${this.libp2p
        .getMultiaddrs()
        .join(', ')}`
    )

    for (const address of this.opts.collectionAddresses) {
      this.subscribe(address)
    }

    for (const [peerId, multiaddrs] of this.opts.bootnodes) {
      await this.connect(peerId, multiaddrs)
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
   * Connect to a node via its {@link PeerId}, and {@link Multiaddr} if known.
   */
  public async connect(peerId: PeerId, multiaddrs: Multiaddr[] = []) {
    this.logger.info(
      `Pinging peer ${short(peerId.toString())} ${
        multiaddrs.length > 0
          ? `via its multiaddrs ${multiaddrs.join(', ')}`
          : ''
      }`
    )
    try {
      let peer: PeerInfo | undefined
      if (multiaddrs.length > 0) {
        await this.libp2p.peerStore.addressBook.set(peerId, multiaddrs)
      } else {
        peer = await this.libp2p.peerRouting.findPeer(peerId)
        if (peer !== undefined) {
          this.logger.info(
            `Found peer ${peer.id.toString()}, multiaddrs are: ${peer.multiaddrs
              .map((ma) => `${ma.toString()}/p2p/${peer?.id.toString()}`)
              .join(', ')}`
          )
        } else {
          this.logger.info(`Unable to find peer ${peerId.toString()}`)
          return
        }
      }
      this.logger.info(
        `Dialing peer ${short(peer?.id.toString() ?? peerId.toString())}`
      )
      await this.libp2p.dial(peerId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      this.logger.error(
        `Error storing or dialing ${peerId.toString()}: ${
          error.message ?? error
        }`
      )
    }
  }

  /**
   * Returns orders from the local db.
   */
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

  /**
   * Returns an order by hash.
   * If the order is not found in the local db, will ask connected peers for it.
   */
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

  /**
   * Re-validate an order by its hash.
   * @throws {@link ErrorOrderNotFound} if the order is not found
   */
  public async validateOrderByHash(hash: string) {
    const order = await this.getOrderByHash(hash)
    if (order === null) throw ErrorOrderNotFound
    return this.validator.validate(order)
  }

  /**
   * Add orders to the node and gossip them to the network.
   * @returns number of new valid orders added
   */
  public async addOrders(orders: OrderJSON[]) {
    if (!this.running) await this.start()
    let numAdded = 0
    let numValid = 0
    for (const order of orders) {
      const [isAdded, isValid] = await addOrder(
        this.prisma,
        this.validator,
        order,
        true
      )
      if (isAdded) numAdded++
      if (isValid) {
        numValid++
        await this._publishOrder(order)
      }
      this.logger.info(
        `Added ${numAdded} new order${
          numAdded === 1 ? '' : 's'
        }, ${numValid} valid`
      )
    }
    return numValid
  }

  /**
   * Gossips a valid order to the network.
   */
  private async _publishOrder(order: OrderJSON) {
    const addresses = [...order.offer, ...order.consideration]
      .map((item) => item.token)
      .filter((address) => address !== zeroAddress)
    const uniqueAddresses = [...new Set(addresses)]
    for (const address of uniqueAddresses) {
      try {
        await this.gossipsub.publish(address, orderJSONToUint8Array(order))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        if (error.message === 'PublishError.Duplicate') return
        this.logger.error(
          `Error publishing topic ${address} for order ${orderHash(order)}: ${
            error.message ?? error
          }`
        )
      }
    }
  }

  /**
   * Subscribe to events for a collection.
   */
  public subscribe(address: Address, _onData?: (data: Uint8Array) => void) {
    if (!this.running) throw ErrorNodeNotRunning
    if (!isValidAddress(address)) return false
    this.gossipsub.addEventListener(
      'gossipsub:message',
      this._handleGossipsubMessage(address, _onData).bind(this)
    )
    this.gossipsub.subscribe(address)
    this.logger.info(`Subscribed to gossipsub for topic ${short(address)}`)
    return true
  }

  /**
   * Handle receiving a gossipsub message
   */
  private _handleGossipsubMessage(
    address: Address,
    _onData?: (data: Uint8Array) => void
  ) {
    return async (event: CustomEvent<GossipsubMessage>) => {
      const { msg, msgId, propagationSource } = event.detail
      const { data, topic } = msg
      if (topic !== address) return
      this.logger.debug(
        `Node received on topic ${topic}: ${Buffer.from(data).toString()}`
      )
      if (_onData !== undefined) _onData(data)

      // Parse and validate order
      let order
      let acceptance
      try {
        order = uint8ArrayToOrderJSON(data)
        const [isAdded, isValid] = await addOrder(
          this.prisma,
          this.validator,
          order
        )
        acceptance = isValid
          ? MessageAcceptance.Accept
          : MessageAcceptance.Reject
        this.logger.info(
          `Received ${isValid ? 'valid' : 'invalid'} order ${short(
            orderHash(order)
          )} from ${short(propagationSource.toString())}, ${
            isAdded ? 'added' : 'not added'
          } to db ${isValid && !isAdded ? ' (already existed)' : ''}`
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        this.logger.error(
          `Error handling pubsub message for order ${
            order !== undefined
              ? `order hash ${orderHash(order)}`
              : `msgId ${msgId}`
          }: ${error.message ?? error}`
        )
        acceptance = MessageAcceptance.Reject
      }
      this.gossipsub.reportMessageValidationResult(
        msgId,
        propagationSource,
        acceptance
      )
    }
  }

  /**
   * Unsubscribe from all events for a collection.
   */
  public unsubscribe(address: Address) {
    if (!this.running) return
    if (!(address in this.gossipsub.getTopics())) {
      this.logger.warn(`No active subscription found for ${address}`)
      return false
    }
    this.gossipsub.unsubscribe(address)
    this.logger.info(`Unsubscribed from gossipsub for topic ${address}`)
    return true
  }

  /**
   * Return current stats for the node.
   */
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

  /**
   * Add libp2p listeners for peer:discovery, peer:connect, peer:disconnect
   */
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

  /**
   * Remove libp2p listeners for peer:discovery, peer:connect, peer:disconnect
   */
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

  /**
   * Emit a log on peer discovery.
   */
  private _onPeerDiscovery(event: Libp2pEvents['peer:discovery']) {
    const peer = event.detail
    this.logger.info(`Discovered peer ${short(peer.id.toString())}`)
  }

  /**
   * Emit a log on peer connect.
   */
  private _onPeerConnect(event: ConnectionManagerEvents['peer:connect']) {
    const connection = event.detail
    this.logger.info(
      `Connected to peer ${short(connection.remotePeer.toString())}`
    )
  }

  /**
   * Emit a log on peer disconnect.
   */
  private _onPeerDisconnect(event: ConnectionManagerEvents['peer:disconnect']) {
    const connection = event.detail
    this.logger.info(
      `Disconnected from peer ${short(connection.remotePeer.toString())}`
    )
  }
}
