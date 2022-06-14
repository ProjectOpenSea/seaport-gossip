import { expect } from 'chai'

import { node } from '../dist/index.js'

describe('Node', () => {
  it('should start and stop successfully', async () =>  {
    expect(node.isStarted()).to.be.false
    await node.start()
    expect(node.isStarted()).to.be.true
    await node.stop()
    expect(node.isStarted()).to.be.false
  })
})