import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'

import { SeaportGossipNode } from '../src/index.js'

import { MockProvider } from './util/provider.js'

chai.use(chaiAsPromised)

describe('SeaportGossipNode', () => {
  const opts = {
    web3Provider: new MockProvider('mainnet') as any,
    logLevel: 'warn',
  }
  const node = new SeaportGossipNode(opts)

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
})
