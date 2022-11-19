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
      process.env.WEB3_PROVIDER ?? (new MockProvider('mainnet') as any),
  }

  before(() => {
    node = new SeaportGossipNode(opts)
  })

  it('should validate a valid order', async () => {
    const validOrder = orderJSONToChecksummedAddresses(validBasicOrders[0])
    const [isValid] = await (node as any).validator.validate(validOrder)
    expect(isValid).to.be.true
  })

  it('should return invalid for an invalid order', async () => {
    const invalidOrder = orderJSONToChecksummedAddresses(invalidBasicOrders[0])
    const [isValid] = await (node as any).validator.validate(invalidOrder)
    expect(isValid).to.be.false
  })

  it('should revalidate stale orders', async () => {
    node = new SeaportGossipNode({ ...opts, revalidateInterval: 1 })
    await node.start()
    const order = validBasicOrders[0]
    await node.addOrders([order])
    const orderHash = deriveOrderHash(order)
    const block = await (node as any).provider.getBlock('latest')
    const lastValidatedBlockNumber =
      // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
      (block.number - (node as any).opts.revalidateBlockDistance).toString()
    await (node as any).prisma.orderMetadata.update({
      where: { orderHash },
      data: { lastValidatedBlockNumber },
    })
    await setTimeout(2000)
    const metadata = await (node as any).prisma.orderMetadata.findFirst({
      where: { orderHash },
    })
    expect(Number(metadata.lastValidatedBlockNumber)).to.be.greaterThanOrEqual(
      block.number
    )
    await truncateTables(node)
    await node.stop()
  })
})
