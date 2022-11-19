import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { BigNumber } from 'ethers'

import { SeaportGossipNode } from '../dist/index.js'
import { deriveOrderHash } from '../dist/util/order.js'

import validBasicOrders from './testdata/orders/basic-valid.json' assert { type: 'json' }
import { truncateTables } from './util/db.js'
import { MockProvider } from './util/provider.js'

chai.use(chaiAsPromised)

describe('Listener', () => {
  const validOrder = validBasicOrders[0]
  const opts = {
    web3Provider: new MockProvider('mainnet') as any,
    ingestOpenSeaOrders: true,
    collectionAddresses: [],
    logLevel: 'warn',
  }

  const node = new SeaportGossipNode(opts)

  beforeEach(async () => {
    await node.start()
  })

  afterEach(async () => {
    await truncateTables(node)
    await node.stop()
  })

  it('should handle events from Seaport', async function () {
    const order = {
      ...validOrder,
      salt: BigNumber.from(validOrder.salt).toString(),
    }
    const orderHash = deriveOrderHash(order)
    await node.addOrders([order])

    const getOrderMetadata = async () =>
      (node as any).prisma.orderMetadata.findFirst({
        where: { orderHash },
      })

    // COUNTER_INCREMENTED
    let metadata = await getOrderMetadata()
    expect(metadata.isValid).to.be.true
    await (node as any).seaportListener._onCounterIncrementedEvent(
      1,
      order.offerer,
      true
    )
    metadata = await getOrderMetadata()
    expect(metadata.isValid).to.be.false

    const setOrderToValid = async () =>
      (node as any).prisma.orderMetadata.update({
        where: { orderHash },
        data: { isValid: true },
      })

    await setOrderToValid()

    // FULFILLED
    metadata = await getOrderMetadata()
    expect(metadata.isValid).to.be.true
    expect(metadata.isFullyFulfilled).to.be.false
    expect(metadata.lastFulfilledAt).to.be.null
    expect(metadata.lastFulfilledPrice).to.be.null
    await (node as any).seaportListener._onFulfilledEvent(
      orderHash,
      order.offer,
      order.consideration
    )
    metadata = await getOrderMetadata()
    expect(metadata.isFullyFulfilled).to.be.true
    expect(metadata.lastFulfilledAt).to.eq('1337')
    expect(metadata.lastFulfilledPrice).to.not.be.null
    expect(metadata.isValid).to.be.false

    await setOrderToValid()

    // CANCELLED
    metadata = await getOrderMetadata()
    expect(metadata.isValid).to.be.true
    await (node as any).seaportListener._onCancelledEvent(
      orderHash,
      order.offerer,
      order.zone
    )
    metadata = await getOrderMetadata()
    expect(metadata.isValid).to.be.false

    // VALIDATED
    metadata = await getOrderMetadata()
    expect(metadata.isValid).to.be.false
    await (node as any).seaportListener._onValidatedEvent(
      orderHash,
      order.offerer,
      order.zone
    )
    metadata = await getOrderMetadata()
    expect(metadata.isValid).to.be.true
  })
})
