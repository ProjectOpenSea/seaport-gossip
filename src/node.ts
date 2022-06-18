// import { GossipSub } from '@chainsafe/libp2p-gossipsub'
import { Noise } from '@chainsafe/libp2p-noise'
import { Bootstrap } from '@libp2p/bootstrap'
// import { KadDHT } from '@libp2p/kad-dht'
// import { PeerId } from '@libp2p/interfaces/peer-id'
import { Mplex } from '@libp2p/mplex'
import { WebSockets } from '@libp2p/websockets'
import { PrismaClient } from '@prisma/client'
import { createLibp2p } from 'libp2p'

import { server } from './db/index.js'
import { ErrorInvalidAddress } from './errors.js'
import { isValidAddress, orderHash, orderToJSON } from './util/index.js'
import { OrderValidator } from './validate/index.js'

import type { Address, OrderEvent, OrderJSON } from './types.js'
import type { ConnectionManagerEvents } from '@libp2p/interfaces/connection-manager'
import type { ethers } from 'ethers'
import type { Libp2p, Libp2pEvents } from 'libp2p'

interface SeaportGossipNodeOpts {
  /** The peer ID to use for this node. */
  // peerId?: PeerId

  /** Maximum number of orders to keep in the database. Default: 100_000 */
  maxOrders?: number

  /** Maximum number of orders per offerer to keep in the database. Default: 100 */
  maxOrdersPerOfferer?: number

  /**
   * Ethereum JSON-RPC url for order validation, or a custom {@link ethers} provider.
   * This can also be a url specified via environment variable `WEB3_PROVIDER`
   */
  web3Provider?: string | ethers.providers.Provider

  /** Optional custom Seaport address. Default: Seaport v1.1 mainnet address */
  seaportAddress?: Address
}

const defaultOpts = {
  maxOrders: 100_000,
  maxOrdersPerOfferer: 100,
  web3Provider: process.env.WEB3_PROVIDER ?? '',
  seaportAddress:
    process.env.SEAPORT_ADDRESS ?? '0x00000000006c3852cbEf3e08E8dF289169EdE581',
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

  public async getOrders(address: Address, validate = true) {
    if (!this.running) await this.start()
    if (!isValidAddress(address)) throw ErrorInvalidAddress
    const orders = await this.prisma.order.findMany({
      include: { offer: true, consideration: true },
    })
    if (!validate) return orders
    const validOrders = []
    for (const order of orders) {
      const valid = await this.validator.validate(orderToJSON(order))
      if (valid) validOrders.push(order)
    }
    return validOrders
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
    const hash = await orderHash(order)
    const isValid = await this.validator.validate(order)
    const isExpired = this.validator.isExpired(order)
    const isCancelled = await this.validator.isCancelled(hash)
    const metadata = { isValid, isPinned, isExpired, isCancelled }
    const additionalRecipients =
      order.additionalRecipients !== undefined
        ? order.additionalRecipients.join(',')
        : undefined
    await this.prisma.order.upsert({
      where: { hash },
      update: { metadata: { update: metadata } },
      create: {
        ...order,
        hash,
        offer: { create: order.offer},
        consideration: { create: order.consideration},
        additionalRecipients,
        metadata: {
          create: metadata,
        },
      },
    })
    return isValid
  }

  public async subscribe(
    address: Address,
    events: OrderEvent[],
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
      if (metadata.isPinned) return
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
