import { ethers } from 'ethers'

import type { SeaportGossipMetrics } from './metrics.js'
import type { Networkish } from '@ethersproject/networks'
import type { ConnectionInfo } from '@ethersproject/web'

export class ProviderWithMetrics extends ethers.providers.JsonRpcProvider {
  private jsonRpcRequests: { [id: string]: number } = {}

  constructor(
    url?: ConnectionInfo | string,
    network?: Networkish,
    metrics?: SeaportGossipMetrics
  ) {
    super(url, network)

    if (metrics !== undefined) {
      this.on('block', (blockNumber) => {
        metrics.chainHeight.set(blockNumber.toString())
      })

      this.on('debug', ({ action, request, error }) => {
        const { id, method, params: rawParams } = request
        const params = JSON.stringify(rawParams)
        if (action === 'request') {
          this.jsonRpcRequests[id] = Date.now()
          metrics.ethProviderRequests.inc({
            method,
            params,
          })
        } else if (action === 'response') {
          const start = this.jsonRpcRequests[id]
          if (start !== undefined) {
            const durationInMilliseconds = Date.now() - start
            metrics.ethProviderResponses.inc({
              method,
              params,
              durationInMilliseconds,
              error: error?.message ?? undefined,
            })
            delete this.jsonRpcRequests[id]
          }
        }
      })
    }
  }
}
