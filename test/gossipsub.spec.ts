import { createEd25519PeerId } from '@libp2p/peer-id-factory'
import { multiaddr } from '@multiformats/multiaddr'
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { BigNumber } from 'ethers'
import { setTimeout } from 'timers/promises'

import {
  SeaportGossipNode,
  orderJSONToChecksummedAddresses,
} from '../src/index.js'
import { deriveOrderHash } from '../src/util/order.js'
import { OrderEvent } from '../src/util/types.js'

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
    logLevel: 'warn',
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

  afterEach(async () => {
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
  })

  it('should handle gossip events', async () => {
    // NEW
    const order = {
      ...validOrder,
      salt: BigNumber.from(validOrder.salt).toString(),
    }
    const orderHash = deriveOrderHash(order)
    await node1.addOrders([order])
    await setTimeout(1000)
    expect(await node2.getOrderByHash(orderHash)).to.deep.eq(
      orderJSONToChecksummedAddresses(order)
    )

    const getOrderMetadata = async (node: SeaportGossipNode) =>
      node.prisma.orderMetadata.findFirst({
        where: { orderHash },
      })

    // COUNTER_INCREMENTED
    let metadata = await getOrderMetadata(node2)
    expect(metadata?.isValid).to.be.true
    await (node1 as any).seaportListener._onCounterIncrementedEvent(
      1,
      order.offerer,
      true
    )
    await setTimeout(1000)
    metadata = await getOrderMetadata(node2)
    expect(metadata?.isValid).to.be.false

    const setOrderToValid = async (node: SeaportGossipNode) =>
      node.prisma.orderMetadata.update({
        where: { orderHash },
        data: { isValid: true },
      })

    await setOrderToValid(node1)
    await setOrderToValid(node2)

    // FULFILLED
    metadata = await getOrderMetadata(node2)
    expect(metadata?.isValid).to.be.true
    expect(metadata?.isFullyFulfilled).to.be.false
    expect(metadata?.lastFulfilledAt).to.be.null
    expect(metadata?.lastFulfilledPrice).to.be.null
    await (node1 as any).seaportListener._onFulfilledEvent(
      orderHash,
      order.offer.map((o) => ({
        itemType: o.itemType,
        token: o.token,
        identifier: o.identifierOrCriteria,
        amount: o.startAmount,
      })),
      order.consideration.map((c) => ({
        itemType: c.itemType,
        token: c.token,
        identifier: c.identifierOrCriteria,
        amount: c.startAmount,
        recipient: c.recipient,
      }))
    )
    await setTimeout(1000)
    metadata = await getOrderMetadata(node2)
    expect(metadata?.isFullyFulfilled).to.be.true
    expect(metadata?.lastFulfilledAt).to.eq('1337')
    expect(metadata?.lastFulfilledPrice).to.not.be.null
    expect(metadata?.isValid).to.be.false

    await setOrderToValid(node1)
    await setOrderToValid(node2)

    // CANCELLED
    metadata = await getOrderMetadata(node2)
    expect(metadata?.isValid).to.be.true
    await (node1 as any).seaportListener._onCancelledEvent(
      orderHash,
      order.offerer,
      order.zone
    )
    await setTimeout(1000)
    metadata = await getOrderMetadata(node2)
    expect(metadata?.isValid).to.be.false

    // VALIDATED
    metadata = await getOrderMetadata(node2)
    expect(metadata?.isValid).to.be.false
    let event = {
      event: OrderEvent.VALIDATED,
      orderHash,
      order,
      blockNumber: '1337',
      blockHash: `0x${'2'.repeat(64)}`,
    }
    await node1.publishEvent(event)
    await setTimeout(1000)
    metadata = await getOrderMetadata(node2)
    expect(metadata?.isValid).to.be.true

    // INVALIDATED
    metadata = await getOrderMetadata(node2)
    expect(metadata?.isValid).to.be.true
    event = {
      event: OrderEvent.INVALIDATED,
      orderHash,
      order,
      blockNumber: '1337',
      blockHash: `0x${'2'.repeat(64)}`,
    }
    await node1.publishEvent(event)
    await setTimeout(1000)
    metadata = await getOrderMetadata(node2)
    expect(metadata?.isValid).to.be.false
  }).timeout(10000)
})
