// import { GossipSub } from '@chainsafe/libp2p-gossipsub'
import { Noise } from '@chainsafe/libp2p-noise'
import { Bootstrap } from '@libp2p/bootstrap'
// import { KadDHT } from '@libp2p/kad-dht'
import { ConnectionManagerEvents } from '@libp2p/interfaces/connection-manager'
// import { PeerId } from '@libp2p/interfaces/peer-id'
import { Mplex } from '@libp2p/mplex'
import { WebSockets } from '@libp2p/websockets'
import { createLibp2p, Libp2p, Libp2pEvents } from 'libp2p'

import { server } from './db/server.js'
import { OrderEvent } from './enums.js'
import { ErrorInvalidAddress } from './errors.js'
import { Address, Order } from './types.js'
import { isValidAddress } from './util/helpers.js'

interface SeaportGossipNodeOpts {
  /** The peer ID to use for this node. */
  // peerId?: PeerId

  /** Maximum number of orders to keep in the database. Default: 100_000 */
  maxOrders?: number

  /** Maximum number of orders per offerer to keep in the database. Default: 100 */
  maxOrdersPerOfferer?: number
}

const defaultOpts = {
  maxOrders: 100_000,
  maxOrdersPerOfferer: 100
}

export class SeaportGossipNode {
  public libp2p!: Libp2p
  public running = false
  public subscriptions: { [key: Address]: OrderEvent[] } = {}

  private opts: Required<SeaportGossipNodeOpts>
  private graphql: typeof server

  constructor(opts: SeaportGossipNodeOpts = {}) {
    this.opts = { ...defaultOpts, ...opts }
    this.graphql = server
  }

  public async start() {
    if (this.running) return
    const libp2pOpts = {
      addresses: {
        listen: ['/ip4/127.0.0.1/tcp/8000/ws']
      },
      transports: [new WebSockets()],
      connectionEncryption: [new Noise()],
      streamMuxers: [new Mplex()],
      peerDiscovery: [
        new Bootstrap({
          list: [
            // /dnsaddr/bootstrap.seaport.opensea.io/p2p/Qm
            '/dns4/127.0.0.1/tcp/9090/ws/',
          ]
        })
      ],
      connectionManager: {
        autoDial: true, 
      }
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

  public async getOrders(address: Address) {
    if (!this.running) await this.start()
    if (!isValidAddress(address)) throw ErrorInvalidAddress
    return []
  }

  public async addOrders(orders: Order[]) {
    if (!this.running) await this.start()
    let numValid = 0
    for (const _order of orders) {
      numValid++
    }
    return numValid
  }

  public async subscribe(address: Address, events: OrderEvent[], _onEvent: (event: OrderEvent) => void) {
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

  private _addListeners() {
    this.libp2p.addEventListener('peer:discovery', this._onPeerDiscovery)
    this.libp2p.connectionManager.addEventListener('peer:connect', this._onPeerConnect)
    this.libp2p.connectionManager.addEventListener('peer:disconnect', this._onPeerDisconnect)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.libp2p.addEventListener<any>('start', this._onStart)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.libp2p.addEventListener<any>('stop', this._onStop)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.libp2p.addEventListener<any>('error', this._onError)
  }

  private _removeListeners() {
    this.libp2p.removeEventListener('peer:discovery', this._onPeerDiscovery)
    this.libp2p.connectionManager.removeEventListener('peer:connect', this._onPeerConnect)
    this.libp2p.connectionManager.removeEventListener('peer:disconnect', this._onPeerDisconnect)
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
    console.log(`libp2p is advertising the following addresses: ${this.libp2p.getMultiaddrs().join(', ')}`)
  }

  private _onStop() {
    console.log('Node stopping...')
  }

  private _onError(err: Error) {
    console.error(`An error occurred: ${err?.message ?? err}`)
  }
}