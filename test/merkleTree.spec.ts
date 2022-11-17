import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'

import { MerkleTree } from '../dist/util/merkleTree.js'

chai.use(chaiAsPromised)

describe('MerkleTree', () => {
  it('should calculate the criteria merkle root as expected', async () => {
    const tokenIds = ['0', '2', '1']
    const tree = new MerkleTree(tokenIds)

    // ensure correct root
    expect(tree.getRoot()).to.eq(
      '0xb007b2401335d84a33963170c232d17fc12fb663e82aa8d77d61d3216dfd94fc'
    )
  })

  it('should return 0 for empty root', async () => {
    const tree = new MerkleTree([])
    expect(tree.getRoot()).to.equal('0')
  })

  it('should provide valid merkle proofs', async () => {
    const tokenIds = ['6', '2', '0', '1', '3', '4']
    const tree = new MerkleTree(tokenIds)

    // valid tokenIds
    const proofTokenId0 = tree.getProof('0')
    const proofTokenId1 = tree.getProof('1')
    const proofTokenId2 = tree.getProof('2')
    const proofTokenId6 = tree.getProof('6')

    expect(proofTokenId0).to.not.deep.eq(proofTokenId1)
    expect(proofTokenId1).to.not.deep.eq(proofTokenId2)
    expect(proofTokenId2).to.not.deep.eq(proofTokenId6)

    // verify proofs
    expect(tree.verifyProof(proofTokenId0, '0')).to.eq(true)
    expect(tree.verifyProof(proofTokenId0, '1')).to.eq(false)

    expect(tree.verifyProof(proofTokenId6, '6')).to.eq(true)
    expect(tree.verifyProof(proofTokenId2, '6')).to.eq(false)

    // invalid tokenIds
    expect(tree.getProof('5')).to.be.empty
    expect(tree.getProof('5')).to.be.empty
    expect(tree.getProof('99')).to.be.empty
    expect(tree.getProof('1000000000000000001')).to.be.empty
  })
})
