import { Trie } from '@ethereumjs/trie'
import { toBufferBE } from 'bigint-buffer'

import type { Proof } from '@ethereumjs/trie'

export class Criteria {
  public initialized = false
  public tokenIds: bigint[]
  private trie: Trie

  private constructor(tokenIds: bigint[]) {
    this.tokenIds = tokenIds
    this.trie = new Trie()
  }

  public static async create(tokenIds: bigint[]) {
    tokenIds = tokenIds.sort() // sort asc
    const criteria = new this(tokenIds)
    // Add tokenIds to trie
    for (const id of tokenIds) {
      await criteria.trie.put(criteria._key(id), Buffer.from('1', 'hex'))
    }
    criteria.initialized = true
    return criteria
  }

  public root() {
    if (!this.initialized)
      throw new Error('trie uninitialized, please await create')

    return `0x${this.trie.root.toString('hex')}`
  }

  public async createProof(tokenIds: bigint[]) {
    if (!this.initialized)
      throw new Error('trie uninitialized, please await create')

    const proofs: Proof[] = []
    for (const id of tokenIds) {
      const proof = await Trie.createProof(this.trie, this._key(id))
      proofs.push(proof)
    }
    return proofs
  }

  public async verifyProof(tokenId: bigint, proof: Proof) {
    try {
      await Trie.verifyProof(this.trie.root, this._key(tokenId), proof)
      return true
    } catch {
      return false
    }
  }

  /**
   * Returns a formatted key for a given tokenId.
   */
  private _key(tokenId: bigint) {
    return toBufferBE(tokenId, 128)
  }
}
