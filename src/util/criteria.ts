import { SecureTrie as Trie } from '@ethereumjs/trie'
import { toBufferBE } from 'bigint-buffer'
import { keccak256 } from 'ethers/lib/utils.js'

import type { Proof } from '@ethereumjs/trie'

export const ErrorCriteriaNotInit = new Error(
  'trie uninitialized, please await create'
)

export const ErrorCriteriaTokenIdNotInSet = new Error(
  'token id not in criteria set'
)

export class Criteria {
  private trie: Trie
  public tokenIds: bigint[]
  public initialized = false

  private constructor(tokenIds: bigint[]) {
    this.tokenIds = tokenIds
    this.trie = new Trie()
  }

  public static async create(tokenIds: bigint[]) {
    tokenIds = tokenIds.sort() // sort asc
    const criteria = new this(tokenIds)
    // Add tokenIds to trie
    for (const id of tokenIds) {
      await criteria.trie.put(criteria._key(id), criteria._leaf(id))
    }
    criteria.initialized = true
    return criteria
  }

  public root() {
    if (!this.initialized) throw ErrorCriteriaNotInit
    return `0x${this.trie.root.toString('hex')}`
  }

  public async createProof(tokenId: bigint) {
    if (!this.initialized) throw ErrorCriteriaNotInit
    if (!this.tokenIds.includes(tokenId)) throw ErrorCriteriaTokenIdNotInSet
    return Trie.createProof(this.trie, this._key(tokenId))
  }

  public async verifyProof(tokenId: bigint, proof: Proof) {
    if (!this.initialized) throw ErrorCriteriaNotInit

    try {
      await Trie.verifyProof(this.trie.root, this._key(tokenId), proof)
      return true
    } catch {
      return false
    }
  }

  /**
   * Returns the formatted key for a given tokenId.
   * The SecureTrie ({@link Trie}) hashes the key with keccak256 on input.
   */
  private _key(tokenId: bigint) {
    return toBufferBE(tokenId, 64)
  }

  /**
   * Returns the hashed leaf for a given tokenId.
   */
  private _leaf(tokenId: bigint) {
    const hashedKey = keccak256(this._key(tokenId))
    return Buffer.from(hashedKey.slice(2), 'hex')
  }
}
