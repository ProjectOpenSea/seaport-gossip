import { createEd25519PeerId } from '@libp2p/peer-id-factory'
import { multiaddr } from '@multiformats/multiaddr'
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { setTimeout } from 'timers/promises'

import { SeaportGossipNode } from '../src/index.js'

// import invalidBasicOrders from './testdata/orders/basic-invalid.json' assert { type: 'json' }
import validBasicOrders from './testdata/orders/basic-valid.json' assert { type: 'json' }
import { truncateTables } from './util/db.js'
import { MockProvider } from './util/provider.js'

import type { PeerId } from '@libp2p/interface-peer-id'
import type { Multiaddr } from '@multiformats/multiaddr'

chai.use(chaiAsPromised)

describe('Protocol', () => {
  let node1: SeaportGossipNode
  let node2: SeaportGossipNode

  let node1Bootnode: [PeerId, Multiaddr[]]

  const opts = {
    web3Provider: new MockProvider('mainnet') as any,
    logLevel: 'warn',
  }

  beforeEach(async () => {
    const node1PeerId = await createEd25519PeerId()
    const node1Multiaddr = multiaddr('/ip4/0.0.0.0/tcp/8998/ws')
    node1Bootnode = [node1PeerId, [node1Multiaddr]]

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

  afterEach(async () => {
    for (const node of [node1, node2]) {
      await truncateTables(node)
      await node.stop()
    }
  })

  it('nodes should listen and respond to queries on GetOrders protocol', async () => {
    const validOrder = validBasicOrders[0]
    await node1.addOrders([validOrder])

    const node1Orders = await node1.getOrders(validOrder.offer[0].token)

    await node2.connect(...node1Bootnode)
    const node2Orders = await (node2 as any)._getOrdersFromPeer(
      node1Bootnode[0],
      validOrder.offer[0].token,
      {}
    )

    expect(node1Orders).to.deep.eq(node2Orders)
  })

  it('nodes should listen and respond to queries on GetOrderCount protocol', async () => {
    const validOrder = validBasicOrders[0]
    await node1.addOrders([validOrder])

    await node2.connect(...node1Bootnode)

    const node2OrderCount = await (node2 as any)._getOrderCountFromPeer(
      node1Bootnode[0],
      validOrder.offer[0].token,
      {}
    )
    expect(node2OrderCount).to.eq(1)
  })

  it('nodes should listen and respond to queries on GetCriteria protocol', async () => {
    const hash =
      '0x2A171B5BCD1449348C3E09A5424946B5E6D6F5471221941D585131D673952EE4'
    await node1.addCriteria(hash, [0n, 2n, 10n])

    await node2.connect(...node1Bootnode)

    const node2CriteriaItems = await (node2 as any)._getCriteriaItemsFromPeer(
      node1Bootnode[0],
      hash,
      {}
    )
    expect(node2CriteriaItems).to.deep.eq([0n, 2n, 10n])
  })

  it('node should get all orders from peer on connect', async () => {
    await node1.stop()
    const validOrder = validBasicOrders[0]
    node1 = new SeaportGossipNode({
      ...opts,
      peerId: node1Bootnode[0],
      port: 8998,
      graphqlPort: 4000,
      getAllOrdersFromPeers: true,
      collectionAddresses: [validOrder.offer[0].token],
    })
    await node1.start()

    await node2.addOrders([validOrder])

    await node2.connect(...node1Bootnode)
    await setTimeout(1000)

    const node1OrderCount = await node1.getOrderCount(
      validOrder.offer[0].token,
      {}
    )
    expect(node1OrderCount).to.eq(1)
  })
})
