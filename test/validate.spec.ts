import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'

import { SeaportGossipNode } from '../dist/index.js'
import { orderJSONToChecksummedAddresses } from '../dist/util/helpers.js'

import invalidBasicOrders from './testdata/orders/basic-invalid.json' assert { type: 'json' }
import validBasicOrders from './testdata/orders/basic-valid.json' assert { type: 'json' }
import { MockProvider } from './util/provider.js'

chai.use(chaiAsPromised)

describe('Validate', () => {
  let node: SeaportGossipNode

  const opts = {
    logLevel: 'info',
  }

  before(() => {
    node = new SeaportGossipNode({
      web3Provider: process.env.WEB3_PROVIDER ?? new MockProvider('mainnet'),
      ...opts,
    })
  })

  it('should validate a valid order', async () => {
    const validOrder = orderJSONToChecksummedAddresses(validBasicOrders[0])
    const [isValid] = await (node as any).validator.validate(validOrder)
    expect(isValid).to.be.true
  }).timeout(5000)

  it('should return invalid for an invalid order', async () => {
    const invalidOrder = orderJSONToChecksummedAddresses(invalidBasicOrders[0])
    const [isValid] = await (node as any).validator.validate(invalidOrder)
    expect(isValid).to.be.false
  }).timeout(5000)
})
