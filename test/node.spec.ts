import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'

import { ErrorInvalidAddress } from '../dist/errors.js'
import {
  SeaportGossipNode,
  compareOrdersByCurrentPrice,
  timestampNow,
  zeroAddress,
} from '../dist/index.js'
import { OrderFilter, OrderSort, Side } from '../dist/types.js'

import invalidBasicOrders from './testdata/orders/basic-invalid.json' assert { type: 'json' }
import validBasicOrders from './testdata/orders/basic-valid.json' assert { type: 'json' }
import {
  orderIsAuction,
  randomOrder,
  setOrderAsAuction,
  simulateOrderFulfillment,
  simulateOrderValidation,
  truncateTables,
} from './util/db.js'
import { MockProvider } from './util/provider.js'

import type { GetOrdersOpts } from '../dist/query/order.js'
import type { OrderWithItems } from '../dist/types.js'
import type { PrismaClient } from '@prisma/client'

chai.use(chaiAsPromised)

describe('SeaportGossipNode', () => {
  const opts = { web3Provider: new MockProvider('mainnet'), logLevel: 'warn' }
  const node = new SeaportGossipNode(opts)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: PrismaClient = (node as any).prisma

  before(async () => {
    await truncateTables(node)
  })

  afterEach(async () => {
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
    expect(numValid).to.eq(10)

    /* Side.SELL (default) */
    let orders = await node.getOrders(
      '0x3F53082981815Ed8142384EDB1311025cA750Ef1'
    )
    expect(orders.length).to.eq(1)
    orders = await node.getOrders(
      '0x3F53082981815Ed8142384EDB1311025cA750Ef1',
      { side: Side.SELL }
    )
    expect(orders.length).to.eq(1)
    orders = await node.getOrders('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2')
    expect(orders.length).to.eq(3)

    /* Side.BUY */
    orders = await node.getOrders(
      '0x3F53082981815Ed8142384EDB1311025cA750Ef1',
      { side: Side.BUY }
    )
    expect(orders.length).to.eq(3)
    orders = await node.getOrders(
      '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d',
      { side: Side.BUY }
    )
    expect(orders.length).to.eq(2)

    /* Zero address: orders with ETH token */
    orders = await node.getOrders(zeroAddress, { side: Side.SELL })
    expect(orders.length).to.eq(2)
    orders = await node.getOrders(zeroAddress, { side: Side.BUY })
    expect(orders.length).to.eq(4)

    await expect(node.getOrders('0xinvalid')).to.eventually.be.rejectedWith(
      ErrorInvalidAddress
    )
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

  /*
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
  */

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

    let contractAddr = '0x3F53082981815Ed8142384EDB1311025cA750Ef1'

    for (const side of [Side.BUY, Side.SELL]) {
      /* Test sort options */

      // Default sort: NEWEST
      let getOpts: GetOrdersOpts = { side }
      const ordersDefaultSort = await node.getOrders(contractAddr, getOpts)
      let orderMetadata = await prisma.orderMetadata.findMany({
        where: { OR: ordersDefaultSort.map((o) => ({ orderHash: o.hash })) },
        orderBy: { createdAt: 'desc' },
      })
      expect(ordersDefaultSort.map((o) => o.hash)).to.deep.eq(
        orderMetadata.map((o) => o.orderHash)
      )

      getOpts = { side, sort: OrderSort.NEWEST }
      let orders = await node.getOrders(contractAddr, getOpts)
      expect(orders).to.deep.eq(ordersDefaultSort)

      getOpts = { side, sort: OrderSort.OLDEST }
      orders = await node.getOrders(contractAddr, getOpts)
      orderMetadata = await prisma.orderMetadata.findMany({
        where: { OR: ordersDefaultSort.map((o) => ({ orderHash: o.hash })) },
        orderBy: { createdAt: 'asc' },
      })
      expect(orders.map((o) => o.hash)).to.deep.eq(
        orderMetadata.map((o) => o.orderHash)
      )

      getOpts = { side, sort: OrderSort.ENDING_SOON }
      orders = await node.getOrders(contractAddr, getOpts)
      expect(orders).to.deep.eq(orders.sort((a, b) => b.endTime - a.endTime))

      getOpts = { side, sort: OrderSort.PRICE_ASC }
      orders = await node.getOrders(contractAddr, getOpts)
      expect(orders).to.deep.eq(
        orders.sort(compareOrdersByCurrentPrice(side, OrderSort.PRICE_ASC))
      )

      getOpts = { side, sort: OrderSort.PRICE_DESC }
      orders = await node.getOrders(contractAddr, getOpts)
      expect(orders).to.deep.eq(
        orders.sort(compareOrdersByCurrentPrice(side, OrderSort.PRICE_DESC))
      )

      let order = await randomOrder(prisma)
      await simulateOrderFulfillment(prisma, order.hash, '1000000')
      getOpts = { side, sort: OrderSort.RECENTLY_FULFILLED, count: 1 }
      const itemSide = side === Side.BUY ? 'consideration' : 'offer'
      orders = await node.getOrders(order[itemSide][0].token, getOpts)
      expect(orders).to.deep.eq([order])

      order = await randomOrder(prisma)
      await simulateOrderValidation(prisma, order.hash, true)
      getOpts = { side, sort: OrderSort.RECENTLY_VALIDATED, count: 1 }
      orders = await node.getOrders(order[itemSide][0].token, getOpts)
      expect(orders).to.deep.eq([order])

      order = await randomOrder(prisma)
      await simulateOrderFulfillment(prisma, order.hash, '100000000')
      getOpts = { side, sort: OrderSort.HIGHEST_LAST_SALE, count: 1 }
      orders = await node.getOrders(order[itemSide][0].token, getOpts)
      expect(orders).to.deep.eq([order])

      /* Test filter options */

      // Default filter: none
      getOpts = { side, filter: {} }
      orders = await node.getOrders(contractAddr, getOpts)
      expect(orders).to.deep.eq(ordersDefaultSort)

      // should ignore filter arg of false
      getOpts = { side, filter: { [OrderFilter.SINGLE_ITEM]: false } }
      orders = await node.getOrders(contractAddr, getOpts)
      expect(orders).to.deep.eq(ordersDefaultSort)

      const offererAddr = '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8'
      getOpts = { side, filter: { [OrderFilter.OFFERER_ADDRESS]: offererAddr } }
      orders = await node.getOrders(contractAddr, getOpts)
      expect(orders).to.satisfy((allOrders: OrderWithItems[]) =>
        allOrders.every((o) => o.offerer === offererAddr)
      )

      contractAddr = '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d'
      const tokenId = '75'
      getOpts = {
        side,
        filter: { [OrderFilter.TOKEN_ID]: tokenId },
      }
      orders = await node.getOrders(contractAddr, getOpts)
      expect(orders).to.satisfy((allOrders: OrderWithItems[]) =>
        allOrders.every((o) =>
          o[itemSide].some((item) => item.identifierOrCriteria === tokenId)
        )
      )

      order = await randomOrder(prisma)
      await setOrderAsAuction(prisma, order.hash, false)
      getOpts = { side, filter: { [OrderFilter.BUY_NOW]: true } }
      orders = await node.getOrders(order[itemSide][0].token, getOpts)
      expect(orders).to.satisfy((allOrders: OrderWithItems[]) =>
        allOrders.every(
          async (o) =>
            o.startTime >= timestampNow() &&
            !(await orderIsAuction(prisma, o.hash))
        )
      )

      getOpts = {
        side,
        filter: {
          [OrderFilter.BUY_NOW]: true,
          [OrderFilter.OFFERER_ADDRESS]: order.offerer,
        },
      }
      orders = await node.getOrders(order[itemSide][0].token, getOpts)
      expect(orders).to.satisfy((allOrders: OrderWithItems[]) =>
        allOrders.every(
          async (o) =>
            o.startTime >= timestampNow() &&
            !(await orderIsAuction(prisma, o.hash)) &&
            o.offerer === order.offerer
        )
      )

      await setOrderAsAuction(prisma, order.hash, true)
      getOpts = {
        side,
        filter: {
          [OrderFilter.ON_AUCTION]: true,
        },
      }
      orders = await node.getOrders(order[itemSide][0].token, getOpts)
      expect(orders).to.satisfy((allOrders: OrderWithItems[]) =>
        allOrders.every(
          async (o) =>
            o.startTime >= timestampNow() &&
            (await orderIsAuction(prisma, o.hash))
        )
      )

      getOpts = {
        side,
        filter: {
          [OrderFilter.ON_AUCTION]: true,
          [OrderFilter.OFFERER_ADDRESS]: order.offerer,
        },
      }
      orders = await node.getOrders(order[itemSide][0].token, getOpts)
      expect(orders).to.satisfy((allOrders: OrderWithItems[]) =>
        allOrders.every(
          async (o) =>
            o.startTime >= timestampNow() &&
            (await orderIsAuction(prisma, o.hash)) &&
            o.offerer === order.offerer
        )
      )

      getOpts = { side, filter: { [OrderFilter.SINGLE_ITEM]: true } }
      orders = await node.getOrders(contractAddr, getOpts)
      expect(orders).to.satisfy((allOrders: OrderWithItems[]) =>
        allOrders.every(async (o) => o[itemSide].length === 1)
      )

      getOpts = { side, filter: { [OrderFilter.BUNDLES]: true } }
      orders = await node.getOrders(contractAddr, getOpts)
      expect(orders).to.satisfy((allOrders: OrderWithItems[]) =>
        allOrders.every(async (o) => o[itemSide].length > 1)
      )

      const wethAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
      getOpts = { side, filter: { [OrderFilter.CURRENCY]: wethAddress } }
      orders = await node.getOrders(contractAddr, getOpts)
      expect(orders).to.satisfy((allOrders: OrderWithItems[]) =>
        allOrders.every((o) =>
          o[itemSide].some((item) => item.token === wethAddress)
        )
      )

      getOpts = {
        side,
        filter: {
          [OrderFilter.CURRENCY]: wethAddress,
          [OrderFilter.BUY_NOW]: true,
        },
      }
      orders = await node.getOrders(contractAddr, getOpts)
      expect(orders).to.satisfy((allOrders: OrderWithItems[]) =>
        allOrders.every(
          async (o) =>
            o.startTime >= timestampNow() &&
            !(await orderIsAuction(prisma, o.hash)) &&
            o[itemSide].some((item) => item.token === wethAddress)
        )
      )

      /* Test sort and filter options together */

      getOpts = {
        side,
        sort: OrderSort.ENDING_SOON,
        filter: {
          [OrderFilter.OFFERER_ADDRESS]: order.offerer,
          [OrderFilter.BUY_NOW]: true,
        },
      }
      orders = await node.getOrders(contractAddr, getOpts)
      expect(orders).to.deep.eq(orders.sort((a, b) => b.endTime - a.endTime))
      expect(orders).to.satisfy((allOrders: OrderWithItems[]) =>
        allOrders.every(
          async (o) =>
            o.startTime >= timestampNow() &&
            !(await orderIsAuction(prisma, o.hash)) &&
            o.offerer === order.offerer
        )
      )

      getOpts = {
        side,
        sort: OrderSort.PRICE_DESC,
        filter: { [OrderFilter.CURRENCY]: wethAddress },
      }
      orders = await node.getOrders(contractAddr, getOpts)
      expect(orders).to.deep.eq(
        orders.sort(compareOrdersByCurrentPrice(side, OrderSort.PRICE_DESC))
      )
      expect(orders).to.satisfy((allOrders: OrderWithItems[]) =>
        allOrders.every((o) =>
          o[itemSide].some((item) => item.token === wethAddress)
        )
      )
    }

    await node.stop()
  })
})
