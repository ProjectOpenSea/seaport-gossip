import { short, zeroAddress } from './helpers.js'
import { deriveOrderHash } from './order.js'
import { encodeGossipsubEvent } from './serialize.js'

import type { GossipsubEvent } from './types.js'
import type { PubSub } from '@libp2p/interface-pubsub'
import type winston from 'winston'

/**
 * Gossips an order event to the network.
 */
export const publishEvent = async (
  event: GossipsubEvent,
  pubsub: PubSub,
  logger: winston.Logger
) => {
  const { order } = event
  const addresses = [...order.offer, ...order.consideration]
    .map((item) => item.token)
    .filter((address) => address !== zeroAddress)
  const uniqueAddresses = [...new Set(addresses)]
  for (const address of uniqueAddresses) {
    logger.debug(
      `Sending gossipsub message on topic of collection ${short(
        address
      )}: ${JSON.stringify(event)}`
    )
    try {
      const encodedEvent = encodeGossipsubEvent(event)
      await pubsub.publish(address, encodedEvent)
    } catch (error: any) {
      if (error.message === 'PublishError.Duplicate') return
      logger.error(
        `Error publishing on topic of collection ${short(
          address
        )} for order ${deriveOrderHash(order)}: ${error.message ?? error}`
      )
    }
  }
}
