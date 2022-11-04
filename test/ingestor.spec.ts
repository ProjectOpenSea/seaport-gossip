import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { setTimeout } from 'timers/promises'

import { SeaportGossipNode, Side } from '../dist/index.js'

import { truncateTables } from './util/db.js'
import { MockProvider } from './util/provider.js'

chai.use(chaiAsPromised)

describe('Ingestor', () => {
  const WILDCARD_COLLECTION_ADDRESS = '*'
  const opts = {
    web3Provider: new MockProvider('mainnet'),
    logLevel: 'warn',
    ingestOpenSeaOrders: true,
    collectionAddresses: [WILDCARD_COLLECTION_ADDRESS],
  }
  const node = new SeaportGossipNode(opts)

  afterEach(async () => {
    await truncateTables(node)
    await node.stop()
  })

  it('should ingest orders from the OpenSea API', async function () {
    if (process.env.OPENSEA_API_KEY === undefined) {
      console.log('Skipping test due to missing env OPENSEA_API_KEY')
      this.skip()
    }

    await node.start()
    expect(await node.getOrderCount(WILDCARD_COLLECTION_ADDRESS)).to.eq(0)

    // Wait a few seconds to receive some events
    await setTimeout(2500)

    expect(
      await node.getOrderCount(WILDCARD_COLLECTION_ADDRESS, { side: Side.BUY })
    ).to.be.greaterThan(0)
    expect(
      await node.getOrderCount(WILDCARD_COLLECTION_ADDRESS, { side: Side.SELL })
    ).to.be.greaterThan(0)
    ;(node as any).ingestor.stop()
  })
})
