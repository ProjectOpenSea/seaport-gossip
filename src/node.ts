// import { GossipSub } from '@chainsafe/libp2p-gossipsub'
import { Noise } from '@chainsafe/libp2p-noise'
import { Bootstrap } from '@libp2p/bootstrap'
// import { KadDHT } from '@libp2p/kad-dht'
import { Mplex } from '@libp2p/mplex'
import { WebSockets } from '@libp2p/websockets'
import { createLibp2p } from 'libp2p'

// Known peers addresses
const bootstrapMultiaddrs = [
  // /dnsaddr/bootstrap.seaport.opensea.io/p2p/Qm
  '/dns4/127.0.0.1/tcp/9090/ws/',
]

const node = await createLibp2p({
  addresses: {
    listen: ['/ip4/127.0.0.1/tcp/8000/ws']
  },
  transports: [new WebSockets()],
  connectionEncryption: [new Noise()],
  streamMuxers: [new Mplex()],
  peerDiscovery: [
    new Bootstrap({
      list: bootstrapMultiaddrs
    })
  ],
  connectionManager: {
    autoDial: true, 
  }
})

node.addEventListener('peer:discovery', (event) => {
  const peer = event.detail
  console.log(`Discovered: ${peer.id.toB58String()}`)
})

node.connectionManager.addEventListener('peer:connect', (event) => {
  const connection = event.detail
  console.log(`Connected: ${connection.remotePeer.toB58String()}`)
})

node.connectionManager.addEventListener('peer:disconnect', (event) => {
  const connection = event.detail
  console.log(`Disconnected: ${connection.remotePeer.toB58String()}`)
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
node.addEventListener<any>('start', () => {
  console.log(`Node started. Peer ID: ${node.peerId.toString()}`)
  console.log(`libp2p is advertising the following addresses: ${node.getMultiaddrs().join(', ')}`)
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
node.addEventListener<any>('stop', () => {
  console.log('Node stopping...')
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
node.addEventListener<any>('error', (err: Error) => {
  console.error(`An error occurred: ${err?.message ?? err}`)
})

export { node }