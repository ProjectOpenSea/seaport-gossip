import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'

import { ErrorInvalidAddress } from '../dist/errors.js'
import { SeaportGossipNode } from '../dist/index.js'
import { OrderEvent, OrderSort } from '../dist/types.js'

import invalidBasicOrders from './testdata/orders/basic-invalid.json' assert { type: 'json' }
import validBasicOrders from './testdata/orders/basic-valid.json' assert { type: 'json' }
import { MockProvider, truncateTables } from './util.js'

import type { GetOrdersOpts } from '../dist/node.js'

chai.use(chaiAsPromised)

describe('SeaportGossipNode', () => {
  const opts = { web3Provider: new MockProvider('mainnet') }
  const node = new SeaportGossipNode(opts)

  beforeEach(async () => {
    await truncateTables(node)
  })

  it('should start and stop successfully', async () => {
    expect(node.running).to.be.false
    expect(node.libp2p).to.be.undefined

    await node.start()
    expect(node.running).to.be.true
    expect(node.libp2p.isStarted()).to.be.true

    await node.stop()
    expect(node.running).to.be.false
    expect(node.libp2p.isStarted()).to.be.false
  })

  it('should add and get orders', async () => {
    const numValid = await node.addOrders(validBasicOrders)
    expect(numValid).to.eq(4)

    const orders = await node.getOrders(
      '0x3F53082981815Ed8142384EDB1311025cA750Ef1'
    )
    expect(orders.length).to.eq(4)

    await expect(node.getOrders('0xinvalid')).to.eventually.be.rejectedWith(
      ErrorInvalidAddress
    )
    expect((await node.getOrders(`0x${'0'.repeat(40)}`)).length).to.eq(0)

    await node.stop()
  })

  it('should not add invalid orders', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const numValid = await node.addOrders(invalidBasicOrders as any)
    expect(numValid).to.eq(0)

    const orders = await node.getOrders(
      '0x3F53082981815Ed8142384EDB1311025cA750Ef1'
    )
    expect(orders.length).to.eq(0)
    await node.stop()
  })

  it('should subscribe to events', async () => {
    expect(Object.keys(node.subscriptions).length).to.eq(0)

    let subscribed = await node.subscribe(
      '0xinvalid',
      [OrderEvent.FULFILLED],
      (event) => {
        console.log(`Event received: ${event}`)
      }
    )
    expect(subscribed).to.be.false
    subscribed = await node.subscribe(
      '0x3F53082981815Ed8142384EDB1311025cA750Ef1',
      [],
      (event) => {
        console.log(`Event received: ${event}`)
      }
    )
    expect(subscribed).to.be.false

    subscribed = await node.subscribe(
      '0x3F53082981815Ed8142384EDB1311025cA750Ef1',
      [OrderEvent.FULFILLED],
      (event) => {
        console.log(`Event received: ${event}`)
      }
    )
    expect(subscribed).to.be.true
    expect(Object.keys(node.subscriptions).length).to.eq(1)

    const unsubscribed = await node.unsubscribe(
      '0x3F53082981815Ed8142384EDB1311025cA750Ef1'
    )
    expect(unsubscribed).to.be.true
    expect(Object.keys(node.subscriptions).length).to.eq(0)
    await node.stop()
  })

  it('should return node stats', async () => {
    const stats = await node.stats()
    expect(stats).to.deep.eq({})
    await node.stop()
  })

  it('should get orders with count and offset options', async () => {
    await node.addOrders(validBasicOrders)

    const contractAddr = '0x3F53082981815Ed8142384EDB1311025cA750Ef1'

    const getOpts = { count: 3, offset: 0 }
    const orders = await node.getOrders(contractAddr, getOpts)

    const offsetGetOpts = { count: 2, offset: 1 }
    const offsetOrders = await node.getOrders(contractAddr, offsetGetOpts)

    expect(orders.slice(1)).to.deep.eq(offsetOrders)
    await node.stop()
  })

  it('should get orders with sort and filter options', async () => {
    await node.addOrders(validBasicOrders)

    const contractAddr = '0x3F53082981815Ed8142384EDB1311025cA750Ef1'

    /* Test sort options */

    // Default sort: NEWEST
    let getOpts: GetOrdersOpts = {}
    const defaultSortOrders = await node.getOrders(contractAddr, getOpts)
    expect(defaultSortOrders[0].hash).to.eq('0x9d2ef6d11611f29f8a5a41c400558b5e343d7bb1a15ebf0bd023471d5a8d4282')

    getOpts = { sort: OrderSort.NEWEST }
    let orders = await node.getOrders(contractAddr, getOpts)
    expect(orders[0].hash).to.eq('0x9d2ef6d11611f29f8a5a41c400558b5e343d7bb1a15ebf0bd023471d5a8d4282')
    expect(orders).to.deep.eq(defaultSortOrders)

    /*
    getOpts = { sort: OrderSort.OLDEST }
    orders = await node.getOrders(contractAddr, getOpts)
    expect(orders[0].hash).to.eq('')

    getOpts = { sort: OrderSort.ENDING_SOON }
    orders = await node.getOrders(contractAddr, getOpts)
    expect(orders[0].hash).to.eq('')

    getOpts = { sort: OrderSort.PRICE_ASC }
    orders = await node.getOrders(contractAddr, getOpts)
    expect(orders[0].hash).to.eq('')

    getOpts = { sort: OrderSort.PRICE_DESC }
    orders = await node.getOrders(contractAddr, getOpts)
    expect(orders[0].hash).to.eq('')

    getOpts = { sort: OrderSort.RECENTLY_FULFILLED }
    orders = await node.getOrders(contractAddr, getOpts)
    expect(orders[0].hash).to.eq('')

    getOpts = { sort: OrderSort.RECENTLY_VALIDATED }
    orders = await node.getOrders(contractAddr, getOpts)
    expect(orders[0].hash).to.eq('')

    getOpts = { sort: OrderSort.HIGHEST_LAST_SALE }
    orders = await node.getOrders(contractAddr, getOpts)
    expect(orders[0].hash).to.eq('')
    */

    /* Test filter options */

    // Default filter: none
    getOpts = { filter: {} }
    orders = await node.getOrders(contractAddr, getOpts)
    expect(orders[0].hash).to.eq('0x9d2ef6d11611f29f8a5a41c400558b5e343d7bb1a15ebf0bd023471d5a8d4282')
    expect(orders).to.deep.eq(defaultSortOrders)

    /*
    getOpts = { filter: { [OrderFilter.OFFERER_ADDRESS]: '0xabc' } }
    orders = await node.getOrders(contractAddr, getOpts)
    expect(orders[0].hash).to.eq('')

    getOpts = {
      filter: { [OrderFilter.TOKEN_IDS]: [0, 15, 25].map((n) => BigInt(n)) },
    }
    orders = await node.getOrders(contractAddr, getOpts)
    expect(orders[0].hash).to.eq('')

    getOpts = { filter: { [OrderFilter.BUY_NOW]: undefined } }
    orders = await node.getOrders(contractAddr, getOpts)
    expect(orders[0].hash).to.eq('')

    getOpts = {
      filter: {
        [OrderFilter.OFFERER_ADDRESS]: '0xabc',
        [OrderFilter.BUY_NOW]: undefined,
      },
    }
    orders = await node.getOrders(contractAddr, getOpts)
    expect(orders[0].hash).to.eq('')

    getOpts = {
      filter: {
        [OrderFilter.OFFERER_ADDRESS]: '0xabc',
        [OrderFilter.ON_AUCTION]: undefined,
      },
    }
    orders = await node.getOrders(contractAddr, getOpts)
    expect(orders[0].hash).to.eq('')

    getOpts = { filter: { [OrderFilter.SINGLE_ITEM]: undefined } }
    orders = await node.getOrders(contractAddr, getOpts)
    expect(orders[0].hash).to.eq('')

    getOpts = { filter: { [OrderFilter.BUNDLES]: undefined } }
    orders = await node.getOrders(contractAddr, getOpts)
    expect(orders[0].hash).to.eq('')

    const wethAddress = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
    getOpts = { filter: { [OrderFilter.CURRENCY]: wethAddress } }
    orders = await node.getOrders(contractAddr, getOpts)
    expect(orders[0].hash).to.eq('')

    getOpts = {
      filter: {
        [OrderFilter.CURRENCY]: wethAddress,
        [OrderFilter.BUY_NOW]: undefined,
      },
    }
    orders = await node.getOrders(contractAddr, getOpts)
    expect(orders[0].hash).to.eq('')
    */

    /* Test sort and filter options together */

    /*
    getOpts = {
      sort: OrderSort.OLDEST,
      filter: {
        [OrderFilter.OFFERER_ADDRESS]: '0xabc',
        [OrderFilter.BUY_NOW]: undefined,
      },
    }
    orders = await node.getOrders(contractAddr, getOpts)
    expect(orders[0].hash).to.eq('')

    getOpts = { sort: OrderSort.PRICE_DESC, filter: { [OrderFilter.CURRENCY]: wethAddress } }
    orders = await node.getOrders(contractAddr, getOpts)
    expect(orders[0].hash).to.eq('')
    */

    await node.stop()
  })
})
