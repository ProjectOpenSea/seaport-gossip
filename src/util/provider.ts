import { ethers } from 'ethers'

import type { SeaportGossipMetrics } from './metrics.js'
import type { Networkish } from '@ethersproject/networks'
import type { ConnectionInfo } from '@ethersproject/web'

export class ProviderWithMetrics extends ethers.providers
  .StaticJsonRpcProvider {
  private jsonRpcRequests: { [id: string]: number } = {}

  constructor(
    url?: ConnectionInfo | string,
    network?: Networkish,
    metrics?: SeaportGossipMetrics
  ) {
    super(url, network)

    if (metrics !== undefined) {
      this.on('block', (blockNumber) => {
        metrics.chainHeight.set(blockNumber)
      })

      this.on('debug', ({ action, request, error }) => {
        const { id, method } = request
        if (action === 'request') {
          this.jsonRpcRequests[id] = Date.now()
          metrics.ethProviderRequests.inc({ method })
        } else if (action === 'response') {
          const start = this.jsonRpcRequests[id]
          if (start !== undefined) {
            const duration = Date.now() - start
            const errorMessage = error?.message.split(' (')[0] ?? undefined
            metrics.ethProviderResponseTimeMilliseconds.observe(duration)
            metrics.ethProviderResponses.inc({
              method,
              error: errorMessage,
            })
            delete this.jsonRpcRequests[id]
          }
        }
      })
    }
  }
}
