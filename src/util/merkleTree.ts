import { BigNumber } from 'ethers'
import { keccak256 } from 'ethers/lib/utils.js'
import { MerkleTree as MerkleTreeJS } from 'merkletreejs'

const hashIdentifier = (identifier: string) =>
  keccak256(
    Buffer.from(
      BigNumber.from(identifier).toHexString().slice(2).padStart(64, '0'),
      'hex'
    )
  )

/**
 * Simple wrapper over the MerkleTree in merkletreejs.
 * Handles hashing identifiers to be compatible with Seaport.
 */
export class MerkleTree {
  private tree: MerkleTreeJS

  constructor(identifiers: string[]) {
    this.tree = new MerkleTreeJS(identifiers.map(hashIdentifier), keccak256, {
      sort: true,
    })
  }

  public getProof(identifier: string): string[] {
    return this.tree.getHexProof(hashIdentifier(identifier))
  }

  public getRoot() {
    const root = this.tree.getHexRoot()
    return root.length > 2 ? root : '0'
  }

  public verifyProof(
    proof: string[] | Buffer[],
    identifier: string,
    root?: string | Buffer
  ) {
    const targetNode = hashIdentifier(identifier)
    return this.tree.verify(proof, targetNode, root ?? this.tree.getRoot())
  }
}
