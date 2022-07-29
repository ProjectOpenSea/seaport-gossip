/**
 * This script does the following:
 * 1. Starts 3 nodes, connected A -> B -> C
 * 2. Adds valid orders to node A
 * 3. Watch nodes B receive, validate, and re-gossip to node C
 * 4. Adds invalid order to node C
 * 5. Watch node B validate and discard, not gossiping to Node A and decreasing peer score for node C
 */

import { createEd25519PeerId } from '@libp2p/peer-id-factory'
import { Multiaddr } from '@multiformats/multiaddr'
import process from 'node:process'
import { setTimeout } from 'timers/promises'

import { SeaportGossipNode } from '../../dist/node.js'
import { Color } from '../../dist/util/log.js'
// import invalidBasicOrders from '../../test/testdata/orders/basic-invalid.json' assert { type: 'json' }
import validBasicOrders from '../../test/testdata/orders/basic-valid.json' assert { type: 'json' }
import { truncateTables } from '../../test/util/db.js'
import { MockProvider } from '../../test/util/provider.js'

import type { SeaportGossipNodeOpts } from '../../dist/node.js'
import type { PeerId } from '@libp2p/interfaces/peer-id'

const opts: SeaportGossipNodeOpts = {
  web3Provider: new MockProvider('mainnet'),
  collectionAddresses: [
    '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    // '0x3F53082981815Ed8142384EDB1311025cA750Ef1',
    '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d',
  ],
}

const node1PeerId = await createEd25519PeerId()
const node1Multiaddr = new Multiaddr('/ip4/0.0.0.0/tcp/8998/ws')
const node1Bootnode: [PeerId, Multiaddr[]] = [node1PeerId, [node1Multiaddr]]

const node2PeerId = await createEd25519PeerId()
const node2Multiaddr = new Multiaddr('/ip4/0.0.0.0/tcp/8997/ws')
const node2Bootnode: [PeerId, Multiaddr[]] = [node2PeerId, [node2Multiaddr]]

const node3PeerId = await createEd25519PeerId()
const node3Multiaddr = new Multiaddr('/ip4/0.0.0.0/tcp/8996/ws')
const _node3Bootnode = [node3PeerId, [node3Multiaddr]]

const denyDialPeer = (denyPeerId: PeerId) => (incomingPeerId: PeerId) => {
  if (denyPeerId === incomingPeerId) return true
  return false
}

const node1 = new SeaportGossipNode({
  ...opts,
  peerId: node1PeerId,
  port: 8998,
  graphqlPort: 4000,
  logColor: Color.FG_YELLOW,
  customLibp2pConfig: {
    connectionGater: {
      denyDialPeer: denyDialPeer(node3PeerId),
    },
  },
})
const node2 = new SeaportGossipNode({
  ...opts,
  datadir: './datadirs/datadir2',
  peerId: node2PeerId,
  port: 8997,
  graphqlPort: 4001,
  bootnodes: [node1Bootnode],
  logColor: Color.FG_CYAN,
})
const node3 = new SeaportGossipNode({
  ...opts,
  datadir: './datadirs/datadir3',
  peerId: node3PeerId,
  port: 8996,
  graphqlPort: 4002,
  bootnodes: [node2Bootnode],
  logColor: Color.FG_MAGENTA,
  customLibp2pConfig: {
    connectionGater: {
      denyDialPeer: denyDialPeer(node1PeerId),
    },
  },
})

const nodes = [node1, node2, node3]

for (const node of nodes) {
  await node.start()
  // Ensure clean db
  await truncateTables(node)
}

let stopping = false
const stop = async () => {
  if (stopping) return
  stopping = true
  await Promise.all(nodes.map((node) => node.stop()))
  process.exit(0)
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)

await setTimeout(1000)

await node1.addOrders([validBasicOrders[0]])

await setTimeout(1000)

await node3.addOrders([validBasicOrders[1]])

/*
const invalidOrder = invalidBasicOrders[0]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
await node3.addOrders([invalidOrder] as any)

// Force gossip invalid order to connected peer
// eslint-disable-next-line @typescript-eslint/no-explicit-any
await (node3 as any)._publishOrder(invalidOrder)
*/
