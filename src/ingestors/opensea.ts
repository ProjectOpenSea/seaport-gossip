import { EventType, OpenSeaStreamClient } from '@opensea/stream-js'
import { BigNumber, ethers } from 'ethers'
import fetch from 'node-fetch'
import { WebSocket } from 'ws'

import { addOrder, exceedsMaxOrderLimits } from '../query/order.js'
import { RateLimit, short } from '../util/helpers.js'
import { deriveOrderHash } from '../util/order.js'
import { OrderEvent } from '../util/types.js'

import type { SeaportGossipNode } from '../node.js'
import type { Address, AuctionType, OrderJSON } from '../util/types.js'
import type {
  BaseStreamMessage,
  ItemListedEventPayload,
  ItemReceivedBidEventPayload,
  ItemReceivedOfferEventPayload,
} from '@opensea/stream-js'
import type { RequestInit } from 'node-fetch'

interface IngestorOpts {
  node: SeaportGossipNode
}

export class OpenSeaOrderIngestor {
  private node: SeaportGossipNode
  private client: OpenSeaStreamClient

  private running = false

  private CONTRACT_ENDPOINT = 'https://api.opensea.io/api/v1/asset_contract/'
  private ORDERS_ENDPOINT = 'https://api.opensea.io/v2/orders/ethereum/seaport/'
  private LISTINGS_ENDPOINT = `${this.ORDERS_ENDPOINT}listings`
  private OFFERS_ENDPOINT = `${this.ORDERS_ENDPOINT}offers`

  /* Configure a limit of maximum 5 requests / second */
  private abortController = new AbortController()
  private limit = RateLimit(5, { signal: this.abortController.signal })

  constructor(opts: IngestorOpts) {
    this.node = opts.node
    this.client = new OpenSeaStreamClient({
      token: this.node.opts.openSeaAPIKey,
      connectOptions: {
        transport: WebSocket,
      },
    })
  }

  public async start() {
    this.node.logger.info('OpenSea Ingestor: Starting...')
    this.running = true
    const collectionAddresses = this.node.opts.collectionAddresses
    for (const address of collectionAddresses) {
      const slug = await this._getCollectionSlug(address)
      if (slug === undefined) continue
      this.client.onEvents(
        slug,
        [
          EventType.ITEM_LISTED,
          EventType.ITEM_RECEIVED_OFFER,
          EventType.ITEM_RECEIVED_BID,
          // EventType.COLLECTION_OFFER,
          // EventType.TRAIT_OFFER,
        ],
        async (event: any) => {
          await this._handleEvent(event)
        }
      )
    }
  }

  private async _handleEvent(
    event:
      | BaseStreamMessage<ItemListedEventPayload>
      | BaseStreamMessage<ItemReceivedOfferEventPayload>
      | BaseStreamMessage<ItemReceivedBidEventPayload>
  ) {
    const { payload, event_type: eventType } = event
    const [chain, collectionAddress] = payload.item.nft_id.split('/')
    if (chain !== 'ethereum') return
    const orderHash = payload.order_hash
    const order = await this._orderToOrderJSON((payload as any).protocol_data) // protocol_data is not yet typed in stream-js
    if (order === undefined) return
    if (await exceedsMaxOrderLimits(order, this.node)) return
    const [isAdded, metadata] = await addOrder(
      this.node,
      order,
      false,
      false,
      order.auctionType
    )
    let log = `OpenSea Ingestor: New event ${eventType} for collection ${short(
      collectionAddress
    )}, order hash: ${short(orderHash)}`
    if (isAdded) {
      log += '. Added order to db.'
    } else {
      log += `. Order not added to db (${
        metadata.isValid ? 'valid, already existed' : 'invalid'
      }).`
    }
    this.node.logger.info(log)
    const gossipsubEvent = {
      event: OrderEvent.NEW,
      orderHash: deriveOrderHash(order),
      order,
      blockNumber: metadata.lastValidatedBlockNumber ?? '0',
      blockHash: metadata.lastValidatedBlockHash ?? ethers.constants.HashZero,
    }
    await this.node.publishEvent(gossipsubEvent)
    this.node.metrics?.ordersIngestedOpenSea.inc({
      addedToDB: isAdded ? 'yes' : 'no',
    })
  }

  private async _orderToOrderJSON(
    protocolData: any
  ): Promise<OrderJSON & { auctionType: AuctionType }> {
    const { parameters, signature } = protocolData
    delete (parameters as any).totalOriginalConsiderationItems
    const order = {
      ...parameters,
      startTime: Number(parameters.startTime),
      endTime: Number(parameters.endTime),
      salt: BigNumber.from(parameters.salt).toString(),
      signature,
      chainId: '1',
    }
    order.auctionType = await this.node.validator.auctionType(order)
    return order
  }

  private async _getCollectionSlug(
    address: Address
  ): Promise<string | undefined> {
    try {
      const response = await this._fetch(`${this.CONTRACT_ENDPOINT}${address}`)
      const data: any = await response.json()
      if (data.collection?.slug === undefined)
        throw new Error('slug not present in returned collection metadata')
      return data.collection.slug
    } catch (error: any) {
      this.node.logger.error(
        `Error fetching collection slug for ${address} from OpenSea: ${
          error.message ?? error
        }`
      )
    }
  }

  /**
   * Convenience handler that adds OpenSea API Key to fetch.
   */
  private async _fetch(url: string, opts: RequestInit = {}) {
    return fetch(url, {
      ...opts,
      headers: {
        accept: 'application/json',
        // eslint-disable-next-line @typescript-eslint/naming-convention
        'X-API-KEY': this.node.opts.openSeaAPIKey,
        ...opts.headers,
      },
    })
  }

  public stop() {
    if (!this.running) return
    this.node.logger.info('OpenSea Ingestor: Stopping...')
    this.client.disconnect()
    this.abortController.abort()
    this.running = false
  }
}
