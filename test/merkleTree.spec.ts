import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'

import {
  MerkleTree,
} from '../dist/util/merkleTree.js'

chai.use(chaiAsPromised)

describe('MerkleTree', () => {
  it('should calculate the criteria merkle root as expected', async () => {
    const tokenIds = ['0', '2', '1']
    const tree = new MerkleTree(tokenIds)

    // ensure correct root
    expect(tree.root()).to.eq(
      '0x53b3f895048e2d2c6f6ee23e9ff7298ede6df7bac908008750e9858ed8fa727a'
    )
  })

  it('should return 0 for empty root', async () => {
    const tree = new MerkleTree([])
    expect(tree.getRoot()).to.equal(0)
  })

  it('should provide valid merkle proofs', async () => {
    const tokenIds = ['6', '2', '0', '1', '3', '4']
    const tree = new MerkleTree(tokenIds)

    // ensure correct order
    expect(tree.tokenIds).to.deep.eq([0n, 1n, 2n, 3n, 4n, 6n])

    // valid tokenIds
    const proofTokenId0 = await tree.getProof('0')
    const proofTokenId1 = await tree.getProof('1')
    const proofTokenId2 = await tree.getProof('2')
    const proofTokenId6 = await tree.getProof('6')

    expect(proofTokenId0).to.not.deep.eq(proofTokenId1)
    expect(proofTokenId1).to.not.deep.eq(proofTokenId2)
    expect(proofTokenId2).to.not.deep.eq(proofTokenId6)

    // verify proofs
    expect(await tree.verifyProof('0', proofTokenId0)).to.eq(true)
    expect(await tree.verifyProof('1', proofTokenId0)).to.eq(false)

    expect(await tree.verifyProof('6', proofTokenId6)).to.eq(true)
    expect(await tree.verifyProof('6', proofTokenId2)).to.eq(false)

    // invalid tokenIds
    await expect(tree.createProof('5')).to.be.rejected
    await expect(tree.createProof('99n')).to.be.rejected
    await expect(tree.createProof(1000000000000000001n)).to.be.rejected
  })
})
