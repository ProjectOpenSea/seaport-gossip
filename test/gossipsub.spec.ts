import { createEd25519PeerId } from '@libp2p/peer-id-factory'
import { multiaddr } from '@multiformats/multiaddr'
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { setTimeout } from 'timers/promises'

import { SeaportGossipNode } from '../dist/index.js'

// import invalidBasicOrders from './testdata/orders/basic-invalid.json' assert { type: 'json' }
import validBasicOrders from './testdata/orders/basic-valid.json' assert { type: 'json' }
import { truncateTables } from './util/db.js'
import { MockProvider } from './util/provider.js'

import type { PeerId } from '@libp2p/interface-peer-id'
import type { Multiaddr } from '@multiformats/multiaddr'

chai.use(chaiAsPromised)

describe('Gossipsub', () => {
  let node1: SeaportGossipNode
  let node2: SeaportGossipNode

  const validOrder = validBasicOrders[0]

  const opts = {
    web3Provider: new MockProvider('mainnet') as any,
    collectionAddresses: [validOrder.offer[0].token],
    logLevel: 'off',
  }

  beforeEach(async () => {
    const node1PeerId = await createEd25519PeerId()
    const node1Multiaddr = multiaddr('/ip4/0.0.0.0/tcp/8998/ws')
    const node1Bootnode: [PeerId, Multiaddr[]] = [node1PeerId, [node1Multiaddr]]

    const node2PeerId = await createEd25519PeerId()

    node1 = new SeaportGossipNode({
      ...opts,
      peerId: node1PeerId,
      port: 8998,
      graphqlPort: 4000,
    })
    node2 = new SeaportGossipNode({
      ...opts,
      datadir: './datadirs/datadir2',
      peerId: node2PeerId,
      port: 8997,
      graphqlPort: 4001,
      bootnodes: [node1Bootnode],
    })

    for (const node of [node1, node2]) {
      await node.start()
      await truncateTables(node)
    }
  })

  after(async () => {
    for (const node of [node1, node2]) {
      await truncateTables(node)
      await node.stop()
    }
  })

  it('nodes should listen to gossipsub events', async () => {
    await node1.addOrders([validOrder])

    const node1Orders = await node1.getOrders(validOrder.offer[0].token)
    await setTimeout(2000)

    const node2Orders = await node2.getOrders(validOrder.offer[0].token)
    expect(node1Orders).to.deep.eq(node2Orders)
  }).timeout(10000)
})
