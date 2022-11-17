import { GossipSub } from '@chainsafe/libp2p-gossipsub'
import { MessageAcceptance } from '@chainsafe/libp2p-gossipsub/types'
import { Noise } from '@chainsafe/libp2p-noise'
import { KadDHT } from '@libp2p/kad-dht'
import { Mplex } from '@libp2p/mplex'
import { WebSockets } from '@libp2p/websockets'
import { PrismaClient } from '@prisma/client'
import { ethers } from 'ethers'
import { pipe } from 'it-pipe'
import { createLibp2p } from 'libp2p'
import { Uint8ArrayList } from 'uint8arraylist'

import { startGraphqlServer } from './db/index.js'
import { OpenSeaOrderIngestor } from './ingestors/opensea.js'
import { SeaportListener } from './listeners/seaport.js'
import {
  criteriaDecode,
  encodeProtocol,
  getCriteriaEncode,
  getOrderCountEncode,
  getOrderHashesEncode,
  handleProtocol,
  orderCountDecode,
  orderHashesDecode,
  orderHashesEncode,
  ordersDecode,
} from './protocol.js'
import {
  addOrder,
  exceedsMaxOrderLimits,
  formatGetOrdersOpts,
  queryOrders,
} from './query/order.js'
import { orderToJSON } from './util/convert.js'
import {
  ErrorInvalidAddress,
  ErrorInvalidCriteriaHash,
  ErrorInvalidCriteriaItems,
  ErrorNodeNotRunning,
  ErrorOrderNotFound,
} from './util/errors.js'
import { publishEvent } from './util/gossipsub.js'
import { isValidAddress, short } from './util/helpers.js'
import { createWinstonLogger } from './util/log.js'
import { deriveOrderHash } from './util/order.js'
import {
  decodeGossipsubEvent,
  emptyOrderJSON,
  gossipsubMsgIdFn,
} from './util/serialize.js'
import { OrderEvent, seaportGossipNodeDefaultOpts } from './util/types.js'
import { OrderValidator } from './validate/index.js'

import type { GetOrdersOpts } from './query/order.js'
import type {
  Address,
  GossipsubEvent,
  OrderJSON,
  OrderWithItems,
  SeaportGossipNodeOpts,
} from './util/types.js'
import type { GossipsubMessage } from '@chainsafe/libp2p-gossipsub'
import type { PeerId } from '@libp2p/interface-peer-id'
import type { PeerInfo } from '@libp2p/interface-peer-info'
import type { Multiaddr } from '@multiformats/multiaddr'
import type { Libp2p, Libp2pEvents } from 'libp2p'
import type winston from 'winston'

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
  private ingestor?: OpenSeaOrderIngestor
  private seaportListener: SeaportListener

  private provider: ethers.providers.JsonRpcProvider

  private nextReqId = 0

  private revalidateInterval?: NodeJS.Timer
  private REVALIDATE_INTERVAL = 60 * 1000 // 60s
  private REVALIDATE_BLOCK_DISTANCE = 25 // 25 blocks (5 min)

  constructor(opts: SeaportGossipNodeOpts = {}) {
    this.opts = Object.freeze({ ...seaportGossipNodeDefaultOpts, ...opts })
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
    this.provider =
      typeof this.opts.web3Provider === 'string'
        ? new ethers.providers.JsonRpcProvider(this.opts.web3Provider)
        : this.opts.web3Provider

    this.validator = new OrderValidator({
      prisma: this.prisma,
      seaportAddress: this.opts.seaportAddress,
      web3Provider: this.provider,
      logger: this.logger,
      validateOpenSeaFeeRecipient: true,
      revalidateBlockDistance: this.REVALIDATE_BLOCK_DISTANCE,
    })
    this.seaportListener = new SeaportListener({
      node: this,
      prisma: this.prisma,
      gossipsub: this.gossipsub,
      provider: this.provider,
      validator: this.validator,
      logger: this.logger,
    })
    if (
      this.opts.ingestOpenSeaOrders === true &&
      this.opts.openSeaAPIKey !== ''
    ) {
      this.ingestor = new OpenSeaOrderIngestor({
        node: this,
        logger: this.logger,
      })
    }
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
      msgIdFn: gossipsubMsgIdFn as any,
    })

    const libp2pOpts = {
      peerId: this.opts.peerId ?? undefined,
      addresses: {
        listen: [`/ip4/${this.opts.hostname}/tcp/${this.opts.port}/ws`],
      },
      transports: [new WebSockets()] as any,
      connectionEncryption: [new Noise()],
      streamMuxers: [new Mplex()] as any,
      connectionManager: {
        autoDial: true,
        minConnections: this.opts.minConnections,
        maxConnections: this.opts.maxConnections,
      },
      dht: seaportDHT,
      pubsub: this.gossipsub as any,
      metrics: {
        enabled: this.opts.metricsAddress !== null,
      },
      ...this.opts.customLibp2pConfig,
    }

    this.libp2p = await createLibp2p(libp2pOpts)

    this._addListeners()
    await this._addProtocols()

    await this.graphql.start()
    await this.libp2p.start()
    this.running = true

    this.logger.info(
      `Node started with Peer ID: ${this.libp2p.peerId.toString()}`
    )
    const displayAddrs = this.libp2p
      .getMultiaddrs()
      .map((a) => `\t\t\t\t${a.toString()}`)
      .join('\n')
    this.logger.info(`Advertising the following addresses:\n${displayAddrs}`)

    for (const address of this.opts.collectionAddresses) {
      this.gossipsubSubscribe(address)
    }

    this.seaportListener.start()
    await this.ingestor?.start()

    this.revalidateInterval = setInterval(async () => {
      await this._validateStaleOrders()
    }, this.REVALIDATE_INTERVAL)

    const orderCount = await this.prisma.order.count()
    this.logger.info(
      `${orderCount} order${orderCount === 1 ? '' : 's'} in database`
    )

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
    clearInterval(this.revalidateInterval)
    this.ingestor?.stop()
    this.seaportListener.stop()
    this._removeListeners()
    await this.libp2p.stop()
    await this.graphql.stop()
    this.running = false
  }

  /** Adds handling the libp2p protocols to the node */
  private async _addProtocols() {
    await this.libp2p.handle(
      '/gossip/1.0.0',
      async ({ stream, connection }) => {
        return pipe(stream.source, async (source) => {
          const data = new Uint8ArrayList()
          for await (const msg of source) {
            data.append(msg)
          }
          try {
            const code = Buffer.from(data.slice(0, 5)).readUint8()
            const message = data.slice(4)
            const returnData = await handleProtocol(
              this,
              this.logger,
              connection.remotePeer,
              code,
              message
            )
            if (returnData !== undefined) {
              await pipe([returnData], stream)
            }
          } catch (error: any) {
            this.logger.error(
              `Error trying to parse incoming request msg: ${
                error.message ?? error
              }`
            )
          }
        })
      }
    )
  }

  private async _getOrdersFromPeer(
    peerId: PeerId,
    address: string,
    opts: Required<GetOrdersOpts>
  ) {
    opts = formatGetOrdersOpts(opts)
    const hashes = await this._getOrdersHashesFromPeer(peerId, address, opts)
    const orders = []
    const hashesToRequest = []
    for (const hash of hashes) {
      const order = await this.getOrderByHash(hash)
      if (order !== null) {
        orders.push(order)
      } else {
        hashesToRequest.push(hash)
      }
    }
    const ordersFromPeer = await this._getOrdersByHashesFromPeer(
      peerId,
      hashesToRequest
    )
    orders.push(...ordersFromPeer)
    return orders
  }

  private async _getOrderCountFromPeer(
    peerId: PeerId,
    address: string,
    opts: Required<GetOrdersOpts>
  ) {
    opts = formatGetOrdersOpts(opts)
    const code = 'GetOrderCount'
    const reqId = this.nextReqId
    this.nextReqId += 1
    const message = getOrderCountEncode(reqId, address, opts)
    const orderCountMessage = await this._dispatchProtocolMessage(
      peerId,
      code,
      reqId,
      message
    )
    return orderCountDecode(orderCountMessage).count
  }

  private async _getOrdersHashesFromPeer(
    peerId: PeerId,
    address: string,
    opts: Required<GetOrdersOpts>
  ) {
    const code = 'GetOrderHashes'
    const reqId = this.nextReqId
    this.nextReqId += 1
    const message = getOrderHashesEncode(reqId, address, opts)
    const ordersMessage = await this._dispatchProtocolMessage(
      peerId,
      code,
      reqId,
      message
    )
    return orderHashesDecode(ordersMessage).hashes
  }

  private async _getOrdersByHashesFromPeer(peerId: PeerId, hashes: string[]) {
    const code = 'GetOrders'
    const reqId = this.nextReqId
    this.nextReqId += 1
    const message = orderHashesEncode(reqId, hashes)
    const ordersMessage = await this._dispatchProtocolMessage(
      peerId,
      code,
      reqId,
      message
    )
    return ordersDecode(ordersMessage).orders
  }

  private async _getCriteriaItemsFromPeer(peerId: PeerId, hash: string) {
    const code = 'GetCriteria'
    const reqId = this.nextReqId
    this.nextReqId += 1
    const message = getCriteriaEncode(reqId, hash)
    const orderCountMessage = await this._dispatchProtocolMessage(
      peerId,
      code,
      reqId,
      message
    )
    return criteriaDecode(orderCountMessage).items
  }

  private async _dispatchProtocolMessage(
    peerId: PeerId,
    code: string,
    reqId: number,
    message: any
  ): Promise<any | undefined> {
    const stream = await this.libp2p.dialProtocol(peerId, ['/gossip/1.0.0'])
    return new Promise<any>((resolve, reject) => {
      setTimeout(
        () =>
          reject(() => {
            this.logger.error(
              `Timeout after 10s of no response for request ${code} (reqId: ${reqId})`
            )
            return undefined
          }),
        10_000
      )
      return pipe([encodeProtocol(code), message], stream, async (source) => {
        const messageData = new Uint8ArrayList()
        for await (const data of source) {
          messageData.append(data)
        }
        resolve(messageData.slice(0))
      })
    })
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
              .map((ma) => `${ma.toString()}/p2p/${peer?.id.toString() ?? ''}`)
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
    if (!this.running) throw ErrorNodeNotRunning
    if (!isValidAddress(address)) throw ErrorInvalidAddress

    const opts = formatGetOrdersOpts(getOpts)
    const orders = (await queryOrders(
      this.prisma,
      address,
      opts
    )) as OrderWithItems[]
    const ordersJSON = orders.map((o) => orderToJSON(o))

    if (opts.validate === false) return ordersJSON

    const validOrders = []
    for (const order of ordersJSON) {
      const [isValid] = await this.validator.validate(order)
      if (isValid) validOrders.push(order)
    }

    return ordersJSON
  }

  /**
   * Returns criteria items from the local db.
   */
  public async getCriteriaItems(hash: string) {
    if (!this.running) throw ErrorNodeNotRunning
    if (hash.length !== 66) throw ErrorInvalidCriteriaHash
    hash = hash.toLowerCase()

    const criteria = await this.prisma.criteria.findFirst({ where: { hash } })
    if (criteria === null) return []
    return criteria.tokenIds.split(',').map((id) => BigInt(id))
  }

  /**
   * Adds criteria items to the local db.
   */
  public async addCriteria(hash: string, items: bigint[]) {
    if (!this.running) throw ErrorNodeNotRunning
    if (hash.length !== 66) throw ErrorInvalidCriteriaHash
    if (items.length === 0) throw ErrorInvalidCriteriaItems
    hash = hash.toLowerCase()

    await this.prisma.criteria.upsert({
      where: {
        hash,
      },
      update: {},
      create: {
        hash,
        tokenIds: items.join(','),
        token: '',
      },
    })
  }

  /**
   * Returns order count from the local db.
   */
  public async getOrderCount(
    address: Address,
    getOpts: GetOrdersOpts = {}
  ): Promise<number> {
    if (!this.running) throw ErrorNodeNotRunning
    if (!isValidAddress(address)) throw ErrorInvalidAddress

    const opts = formatGetOrdersOpts({ ...getOpts, onlyCount: true })
    const orderCount = (await queryOrders(this.prisma, address, opts)) as number
    return orderCount
  }

  /**
   * Returns an order by hash.
   * If the order is not found in the local db, will ask connected peers for it.
   */
  public async getOrderByHash(hash: string) {
    if (!this.running) throw ErrorNodeNotRunning
    const order = await this.prisma.order.findUnique({
      where: { hash },
      include: { offer: true, consideration: true },
    })
    if (order === null) return null
    const orderJSON = orderToJSON(order)
    // TODO try to get from network
    return orderJSON
  }

  /**
   * Validate an order by its hash.
   * @throws {@link ErrorOrderNotFound} if the order is not found
   */
  public async validateOrderByHash(
    hash: string,
    opts: { updateRecordInDB: boolean } = { updateRecordInDB: false }
  ) {
    const order = await this.getOrderByHash(hash)
    if (order === null) throw ErrorOrderNotFound
    return this.validator.validate(order, opts.updateRecordInDB)
  }

  /**
   * Re-validate stale orders and update them in the db.
   */
  public async _validateStaleOrders() {
    const block = await this.provider.getBlock('latest')
    const orderMetadata = await this.prisma.orderMetadata.findMany({
      take: 10,
      where: {
        lastValidatedBlockNumber: {
          lt: `${block.number - this.REVALIDATE_BLOCK_DISTANCE}`,
        },
      },
      orderBy: { lastValidatedBlockNumber: 'asc' },
    })
    if (orderMetadata.length === 0) return
    this.logger.debug(
      `Re-validating ${orderMetadata.length} stale orders, oldest from ${
        block.number - Number(orderMetadata[0].lastValidatedBlockNumber)
      } blocks ago`
    )
    for (const metadata of orderMetadata) {
      const { isValid: isValidBefore, orderHash } = metadata
      const [isValid] = await this.validateOrderByHash(metadata.orderHash, {
        updateRecordInDB: true,
      })
      if (
        (isValid === true && !isValidBefore) ||
        (isValid === false && isValidBefore)
      ) {
        const dbOrder = await this.prisma.order.findFirst({
          where: { hash: orderHash },
          include: {
            offer: true,
            consideration: true,
          },
        })
        const order = dbOrder !== null ? orderToJSON(dbOrder) : emptyOrderJSON
        const event = {
          event:
            isValid === true ? OrderEvent.VALIDATED : OrderEvent.INVALIDATED,
          orderHash,
          order,
          blockNumber: block.number.toString(),
          blockHash: block.hash,
        }
        await this._publishEvent(event)
      }
    }
  }

  /**
   * Add orders to the node and gossip them to the network.
   * @returns number of new valid orders added
   */
  public async addOrders(orders: OrderJSON[]) {
    if (!this.running) throw ErrorNodeNotRunning
    let numAdded = 0
    let numValid = 0
    for (const order of orders) {
      try {
        if (
          await exceedsMaxOrderLimits(
            order,
            this.prisma,
            this.logger,
            this.opts
          )
        )
          return numValid
        const [isAdded, metadata] = await addOrder(
          this.prisma,
          this.validator,
          order,
          true
        )
        const { isValid, lastValidatedBlockNumber, lastValidatedBlockHash } =
          metadata
        if (isAdded === true) numAdded++
        if (metadata.isValid) numValid++
        if (isAdded && isValid) {
          const event = {
            event: OrderEvent.NEW,
            orderHash: deriveOrderHash(order),
            order,
            blockNumber: lastValidatedBlockNumber ?? '0',
            blockHash: lastValidatedBlockHash ?? ethers.constants.HashZero,
          }
          await this._publishEvent(event)
        }
        this.logger.info(
          `Added ${numAdded} new order${
            numAdded === 1 ? '' : 's'
          }, ${numValid} valid`
        )
      } catch (error: any) {
        this.logger.error(`Error adding order: ${error.message ?? error}`)
      }
    }
    return numValid
  }

  /**
   * Gossips an order event to the network.
   */
  private async _publishEvent(event: GossipsubEvent) {
    await publishEvent(event, this.gossipsub, this.logger)
  }

  /**
   * Subscribe to events for a collection.
   */
  public gossipsubSubscribe(
    address: Address,
    _onGossipsubEvent?: (gossipsubEvent: GossipsubEvent) => void
  ) {
    if (!this.running) throw ErrorNodeNotRunning
    if (!isValidAddress(address)) return false
    this.gossipsub.addEventListener(
      'gossipsub:message',
      this._handleGossipsubMessage(address, _onGossipsubEvent).bind(this)
    )
    this.gossipsub.subscribe(address)
    this.logger.info(`Subscribed to gossipsub for collection ${short(address)}`)
    return true
  }

  /**
   * Handle receiving a gossipsub message
   */
  private _handleGossipsubMessage(
    address: Address,
    _onGossipsubEvent?: (gossipsubEvent: GossipsubEvent) => void
  ) {
    return async (gossipsubMessage: CustomEvent<GossipsubMessage>) => {
      const { msg, msgId, propagationSource } = gossipsubMessage.detail
      const { data, topic } = msg

      if (topic !== address) return

      let event
      try {
        event = decodeGossipsubEvent(data)
      } catch (error: any) {
        this.logger.error(
          `Error formatting gossipsub message to event: ${
            error.message ?? error
          }`
        )
      }

      if (event === undefined) {
        this.logger.error('No gossipsubEvent from gossipsub:message')
        return
      }

      this.logger.debug(
        `Received gossipsub on topic ${topic}: ${JSON.stringify(event)}`
      )

      if (_onGossipsubEvent !== undefined) {
        _onGossipsubEvent(event)
      }

      // Parse and validate order
      const { order } = event
      let { event: orderEvent } = event
      let acceptance

      if (orderEvent === OrderEvent.COUNTER_INCREMENTED) {
        // TODO: Accept message if counter is equal to order.counter on blockHash,
        //       otherwise reject
        acceptance = MessageAcceptance.Accept
        await this.seaportListener._onCounterIncrementedEvent(
          order.counter,
          order.offerer,
          false
        )
      } else {
        // Try adding order to db
        try {
          if (
            await exceedsMaxOrderLimits(
              order,
              this.prisma,
              this.logger,
              this.opts
            )
          )
            return
          const [isAdded, metadata] = await addOrder(
            this.prisma,
            this.validator,
            order
          )
          const { isValid } = metadata
          if (
            orderEvent === OrderEvent.INVALIDATED ||
            orderEvent === OrderEvent.CANCELLED
          ) {
            if (isValid === true) {
              // If the order is now valid, check that it was invalid
              // on the INVALIDATED/CANCELLED event for message acceptance
              acceptance = MessageAcceptance.Accept
              // TODO: set to MessageAcceptance.Reject if isValid on gossiped blockHash,
              //       and rebroadcast as OrderEvent.VALIDATED
              orderEvent = OrderEvent.VALIDATED
            } else {
              acceptance = MessageAcceptance.Accept
            }
          } else if (orderEvent === OrderEvent.FULFILLED) {
            // TODO: accept if there was indeed a fulfilled event at the blockHash
            acceptance = MessageAcceptance.Accept
          } else {
            acceptance =
              isValid === true
                ? MessageAcceptance.Accept
                : MessageAcceptance.Reject
          }
          this.logger.info(
            `Received ${isValid === true ? 'valid' : 'invalid'} order ${short(
              deriveOrderHash(order)
            )} from ${short(propagationSource.toString())}, event ${
              OrderEvent[orderEvent]
            }, ${isAdded ? 'added' : 'not added'} to db ${
              isValid === true && !isAdded ? ' (already existed)' : ''
            }`
          )
        } catch (error: any) {
          this.logger.error(
            `Error handling pubsub message for order ${deriveOrderHash(
              order
            )} (msgId ${short(msgId)}): ${error.message ?? error}`
          )
          acceptance = MessageAcceptance.Reject
        }
      }

      this.gossipsub.reportMessageValidationResult(
        msgId,
        propagationSource,
        acceptance
      )

      if (acceptance === MessageAcceptance.Accept) {
        await this._publishEvent(event)
      }
    }
  }

  /**
   * Unsubscribe from all events for a collection.
   */
  public gossipsubUnsubscribe(address: Address) {
    if (!this.running) throw ErrorNodeNotRunning
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
  private _onPeerConnect(event: CustomEvent) {
    const connection = event.detail
    this.logger.info(
      `Connected to peer ${short(connection.remotePeer.toString())}`
    )
  }

  /**
   * Emit a log on peer disconnect.
   */
  private _onPeerDisconnect(event: CustomEvent) {
    const connection = event.detail
    this.logger.info(
      `Disconnected from peer ${short(connection.remotePeer.toString())}`
    )
  }
}
