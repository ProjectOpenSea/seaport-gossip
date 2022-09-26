import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'

import {
  Criteria,
  ErrorCriteriaNotInit,
  ErrorCriteriaTokenIdNotInSet,
} from '../dist/util/criteria.js'

chai.use(chaiAsPromised)

describe('Criteria', () => {
  it('should calculate the criteria merkle root as expected', async () => {
    const tokenIds = [0n, 2n, 1n]
    const criteria = await Criteria.create(tokenIds)

    // ensure correct order
    expect(criteria.tokenIds).to.deep.eq([0n, 1n, 2n])

    // ensure correct root
    expect(criteria.root()).to.eq(
      '0x53b3f895048e2d2c6f6ee23e9ff7298ede6df7bac908008750e9858ed8fa727a'
    )
  })

  it('should throw error when trie is uninitialized', async () => {
    const tokenIds = [0n, 2n, 1n]
    const criteria = new (Criteria as any)(tokenIds)
    await expect(criteria.createProof(2n)).to.eventually.be.rejectedWith(
      ErrorCriteriaNotInit
    )
  })

  it('should provide valid merkle proofs', async () => {
    const tokenIds = [6n, 2n, 0n, 1n, 3n, 4n]
    const criteria = await Criteria.create(tokenIds)

    // ensure correct order
    expect(criteria.tokenIds).to.deep.eq([0n, 1n, 2n, 3n, 4n, 6n])

    // valid tokenIds
    const proofTokenId0 = await criteria.createProof(0n)
    const proofTokenId1 = await criteria.createProof(1n)
    const proofTokenId2 = await criteria.createProof(2n)
    const proofTokenId6 = await criteria.createProof(6n)

    expect(proofTokenId0).to.not.deep.eq(proofTokenId1)
    expect(proofTokenId1).to.not.deep.eq(proofTokenId2)
    expect(proofTokenId2).to.not.deep.eq(proofTokenId6)

    // verify proofs
    expect(await criteria.verifyProof(0n, proofTokenId0)).to.eq(true)
    expect(await criteria.verifyProof(1n, proofTokenId0)).to.eq(false)

    expect(await criteria.verifyProof(6n, proofTokenId6)).to.eq(true)
    expect(await criteria.verifyProof(6n, proofTokenId2)).to.eq(false)

    // invalid tokenIds
    await expect(criteria.createProof(5n)).to.eventually.be.rejectedWith(
      ErrorCriteriaTokenIdNotInSet
    )
    await expect(criteria.createProof(99n)).to.eventually.be.rejectedWith(
      ErrorCriteriaTokenIdNotInSet
    )
    await expect(
      criteria.createProof(1000000000000000001n)
    ).to.eventually.be.rejectedWith(ErrorCriteriaTokenIdNotInSet)
  })
})
