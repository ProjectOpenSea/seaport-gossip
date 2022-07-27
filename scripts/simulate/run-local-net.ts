/**
 * This script does the following:
 * 1. Starts 3 nodes, connected A -> B -> C
 * 2. Adds orders to node A
 * 3. Watch nodes B and C receive, validate, and re-gossip
 * 4. Adds invalid order to node C
 * 5. Watch Node B validate and discard, not gossiping to Node A and decreasing peer score for node C
 */

import { createEd25519PeerId } from '@libp2p/peer-id-factory'
import process from 'node:process'
import { setTimeout } from 'timers/promises'

import { SeaportGossipNode } from '../../dist/node.js'
import { Color } from '../../dist/util/log.js'
import invalidBasicOrders from '../../test/testdata/orders/basic-invalid.json' assert { type: 'json' }
import validBasicOrders from '../../test/testdata/orders/basic-valid.json' assert { type: 'json' }
import { MockProvider } from '../../test/util/provider.js'

import type { SeaportGossipNodeOpts } from '../../dist/node.js'

const opts: SeaportGossipNodeOpts = {
  web3Provider: new MockProvider('mainnet'),
  minPeers: 1,
  maxPeers: 1,
  logLevel: 'info',
  logColor: Color.FG_YELLOW,
}

const node1PeerId = await createEd25519PeerId()
const node2PeerId = await createEd25519PeerId()
const node3PeerId = await createEd25519PeerId()

const node1 = new SeaportGossipNode({
  ...opts,
  peerId: node1PeerId,
  port: 8998,
  graphqlPort: 4000,
})
const node2 = new SeaportGossipNode({
  ...opts,
  peerId: node2PeerId,
  port: 8997,
  graphqlPort: 4001,
  bootnodes: [`/ip4/0.0.0.0/tcp/8998/ws/p2p/${node1PeerId.toString()}`],
  logColor: Color.FG_CYAN,
})
const node3 = new SeaportGossipNode({
  ...opts,
  peerId: node3PeerId,
  port: 8996,
  graphqlPort: 4002,
  bootnodes: [`/ip4/0.0.0.0/tcp/8997/ws/p2p/${node2PeerId.toString()}`],
  logColor: Color.FG_MAGENTA,
})

const stop = async () => {
  for (const node of [node1, node2, node3]) {
    void node.stop()
  }
  process.exit(0)
}

process.on('SIGTERM', stop)
process.on('SIGINT', stop)

for (const node of [node1, node2, node3]) {
  await node.start()
}

await node1.addOrders(validBasicOrders)

await setTimeout(1000)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
await node3.addOrders(invalidBasicOrders as any)
