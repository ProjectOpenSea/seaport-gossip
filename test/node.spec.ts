import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'

import { ErrorInvalidAddress } from '../dist/errors.js'
import { SeaportGossipNode } from '../dist/index.js'
import { OrderEvent } from '../dist/types.js'

import invalidBasicOrders from './testdata/orders/basic-invalid.json' assert { type: 'json' }
import validBasicOrders from './testdata/orders/basic-valid.json' assert { type: 'json' }
import { MockProvider } from './util.js'

chai.use(chaiAsPromised)

describe('SeaportGossipNode', () => {
  const opts = { web3Provider: new MockProvider('mainnet') }

  it('should start and stop successfully', async () =>  {
    const node = new SeaportGossipNode(opts)
    expect(node.running).to.be.false
    expect(node.libp2p).to.be.undefined

    await node.start()
    expect(node.running).to.be.true
    expect(node.libp2p.isStarted()).to.be.true
    
    await node.stop()
    expect(node.running).to.be.false
    expect(node.libp2p.isStarted()).to.be.false
  })

  it('should add and get orders', async () =>  {
    const node = new SeaportGossipNode(opts)
    const numValid = await node.addOrders(validBasicOrders)
    expect(numValid).to.eq(4)

    const orders = await node.getOrders('0x3F53082981815Ed8142384EDB1311025cA750Ef1')
    expect(orders.length).to.eq(1)

    await expect(node.getOrders('0xinvalid')).to.eventually.be.rejectedWith(ErrorInvalidAddress)
    await node.stop()
  })

  it('should not add invalid orders', async () =>  {
    const node = new SeaportGossipNode(opts)
    const numValid = await node.addOrders(invalidBasicOrders)
    expect(numValid).to.eq(4)

    const orders = await node.getOrders('0x3F53082981815Ed8142384EDB1311025cA750Ef1')
    expect(orders.length).to.eq(1)
    await node.stop()
  })

  it('should subscribe to events', async () =>  {
    const node = new SeaportGossipNode(opts)
    expect(Object.keys(node.subscriptions).length).to.eq(0)

    let subscribed = await node.subscribe('0xinvalid', [OrderEvent.FULFILLED], (event) => { console.log(`Event received: ${event}`)})
    expect(subscribed).to.be.false
    subscribed = await node.subscribe('0x3F53082981815Ed8142384EDB1311025cA750Ef1', [], (event) => { console.log(`Event received: ${event}`)})
    expect(subscribed).to.be.false

    subscribed = await node.subscribe('0x3F53082981815Ed8142384EDB1311025cA750Ef1', [OrderEvent.FULFILLED], (event) => { console.log(`Event received: ${event}`)})
    expect(subscribed).to.be.true
    expect(Object.keys(node.subscriptions).length).to.eq(1)

    const unsubscribed = await node.unsubscribe('0x3F53082981815Ed8142384EDB1311025cA750Ef1')
    expect(unsubscribed).to.be.true
    expect(Object.keys(node.subscriptions).length).to.eq(0)
    await node.stop()
  })

  it('should return node stats', async () =>  {
    const node = new SeaportGossipNode(opts)
    const stats = await node.stats()
    expect(stats).to.deep.eq({})
    await node.stop()
  })
})