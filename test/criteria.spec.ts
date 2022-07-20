import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'

import { Criteria } from '../dist/util/criteria.js'

chai.use(chaiAsPromised)

describe('Criteria', () => {
  it('should calculate the criteria merkle root as expected', async () =>  {
    const tokenIds = [0, 2, 1].map(n => BigInt(n))
    const criteria = await Criteria.create(tokenIds)

    // ensure correct order
    expect(criteria.tokenIds).to.deep.eq([0, 1, 2].map(n => BigInt(n)))

    // ensure correct root
    expect(criteria.root()).to.eq('0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421')
  })

  it('should provide valid merkle proofs', async () =>  {
    const tokenIds = [6, 2, 0, 1, 3, 4].map(n => BigInt(n))
    const criteria = await Criteria.create(tokenIds)

    // ensure correct order
    expect(criteria.tokenIds).to.deep.eq([0, 1, 2, 3, 4, 6].map(n => BigInt(n)))

    // valid tokenIds
    /*
    expect(await criteria.createProof([0].map(n => BigInt(n)))).to.deep.eq([[]])
    expect(await criteria.createProof([1].map(n => BigInt(n)))).to.deep.eq([[]])
    expect(await criteria.createProof([0, 2].map(n => BigInt(n)))).to.deep.eq([[], []])
    expect(await criteria.createProof([6, 0, 4, 2].map(n => BigInt(n)))).to.deep.eq([[], [], [], []])

    // verify proofs
    const proofTokenId0 = await criteria.createProof([BigInt(0)])
    expect(await criteria.verifyProof(BigInt(0), proofTokenId0[0])).to.eq(true)
    expect(await criteria.verifyProof(BigInt(1), proofTokenId0[0])).to.eq(false)

    // invalid tokenIds
    expect(await criteria.createProof([100].map(n => BigInt(n)))).to.throw('Key not in trie')
    expect(await criteria.createProof([100, 101].map(n => BigInt(n)))).to.throw('Key not in trie')
    expect(await criteria.createProof([2, 100, 101].map(n => BigInt(n)))).to.throw('Key not in trie')
    */
  })
})