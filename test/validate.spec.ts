import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { setTimeout } from 'timers/promises'

import { SeaportGossipNode } from '../dist/index.js'
import { orderJSONToChecksummedAddresses } from '../dist/util/helpers.js'
import { deriveOrderHash } from '../dist/util/order.js'

import invalidBasicOrders from './testdata/orders/basic-invalid.json' assert { type: 'json' }
import validBasicOrders from './testdata/orders/basic-valid.json' assert { type: 'json' }
import { truncateTables } from './util/db.js'
import { MockProvider } from './util/provider.js'

chai.use(chaiAsPromised)

describe('Validate', () => {
  let node: SeaportGossipNode

  const opts = {
    logLevel: 'warn',
    web3Provider:
      process.env.WEB3_PROVIDER ?? (new MockProvider('mainnet', true) as any),
  }

  before(() => {
    node = new SeaportGossipNode(opts)
  })

  it('should validate a valid order', async () => {
    const validOrder = orderJSONToChecksummedAddresses(validBasicOrders[0])
    const [isValid] = await node.validator.validate(validOrder)
    expect(isValid).to.be.true
  })

  it('should return invalid for an invalid order', async () => {
    const invalidOrder = orderJSONToChecksummedAddresses(invalidBasicOrders[0])
    const [isValid] = await node.validator.validate(invalidOrder)
    expect(isValid).to.be.false
  })

  it('should revalidate stale orders', async () => {
    node = new SeaportGossipNode({ ...opts, revalidateInterval: 1 })
    await node.start()
    const order = validBasicOrders[0]
    await node.addOrders([order])
    const orderHash = deriveOrderHash(order)
    const block = await node.provider.getBlock('latest')
    const lastValidatedBlockNumber =
      // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
      (block.number - node.opts.revalidateBlockDistance).toString()
    await node.prisma.orderMetadata.update({
      where: { orderHash },
      data: { lastValidatedBlockNumber },
    })
    await setTimeout(2000)
    const metadata = await node.prisma.orderMetadata.findFirst({
      where: { orderHash },
    })
    expect(Number(metadata?.lastValidatedBlockNumber)).to.be.greaterThanOrEqual(
      block.number
    )
    await truncateTables(node)
    await node.stop()
  })

  it('should delete cancelled, fulfilled, and expired orders after revalidateBlockDistance', async () => {
    node = new SeaportGossipNode({
      ...opts,
      web3Provider: new MockProvider('mainnet', true) as any,
      revalidateInterval: 1,
    })
    await node.start()

    // MockProvider hardcoded to return validation data
    // as cancelled, fulfilled, and expired for the below orders.
    const cancelledOrder = validBasicOrders[1]
    const fulfilledOrder = validBasicOrders[2]
    const expiredOrder = validBasicOrders[3]
    const cancelledOrderHash = deriveOrderHash(cancelledOrder)
    const fulfilledOrderHash = deriveOrderHash(fulfilledOrder)
    const expiredOrderHash = deriveOrderHash(expiredOrder)

    await node.addOrders(
      [fulfilledOrder, cancelledOrder, expiredOrder],
      false,
      false
    )
    const block = await node.provider.getBlock('latest')
    const lastValidatedBlockNumber =
      // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
      (block.number - node.opts.revalidateBlockDistance).toString()
    await node.prisma.orderMetadata.updateMany({
      where: {
        orderHash: {
          in: [cancelledOrderHash, fulfilledOrderHash, expiredOrderHash],
        },
      },
      data: { lastValidatedBlockNumber },
    })
    await setTimeout(2000)
    expect(
      await node.prisma.order.findMany({
        where: {
          hash: {
            in: [cancelledOrderHash, fulfilledOrderHash, expiredOrderHash],
          },
        },
      })
    ).to.be.empty
    await truncateTables(node)
    await node.stop()
  })
})
