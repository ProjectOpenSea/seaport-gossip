import { EventType, OpenSeaStreamClient } from '@opensea/stream-js'
import { BigNumber } from 'ethers'
import fetch from 'node-fetch'
import { WebSocket } from 'ws'

import { RateLimit, short } from '../util/helpers.js'

import type { SeaportGossipNode } from '../node.js'
import type { Address, ItemType, OrderJSON, OrderType } from '../util/types.js'
import type {
  BaseStreamMessage,
  ItemListedEventPayload,
  ItemReceivedBidEventPayload,
  ItemReceivedOfferEventPayload,
} from '@opensea/stream-js'
import type { RequestInit } from 'node-fetch'
import type winston from 'winston'

enum OpenSeaOrderType {
  LISTINGS,
  OFFERS,
}

interface IngestorOpts {
  node: SeaportGossipNode
  logger: winston.Logger
}

interface OpenSeaOfferItem {
  itemType: ItemType
  token: string
  identifierOrCriteria: string
  startAmount: string
  endAmount: string
}

interface OpenSeaConsiderationItem extends OpenSeaOfferItem {
  recipient: string
}

/* eslint-disable @typescript-eslint/naming-convention */
interface OpenSeaOrder {
  created_date: string
  closing_date: string
  listing_time: number
  expiration_time: number
  order_hash: string
  protocol_data: {
    parameters: {
      offerer: string
      offer: OpenSeaOfferItem[]
      consideration: OpenSeaConsiderationItem[]
      startTime: string
      endTime: string
      orderType: OrderType
      zone: string
      zoneHash: string
      salt: string
      conduitKey: string
      totalOriginalConsiderationItems: number
      counter: number
    }
    signature: string
  }
}

export class OpenSeaOrderIngestor {
  private node: SeaportGossipNode
  private logger: winston.Logger
  private client: OpenSeaStreamClient

  private running = false

  private OPENSEA_API_KEY: string
  private CONTRACT_ENDPOINT = 'https://api.opensea.io/api/v1/asset_contract/'
  private ORDERS_ENDPOINT = 'https://api.opensea.io/v2/orders/ethereum/seaport/'
  private LISTINGS_ENDPOINT = `${this.ORDERS_ENDPOINT}listings`
  private OFFERS_ENDPOINT = `${this.ORDERS_ENDPOINT}offers`

  /* Configure a limit of maximum 5 requests / second */
  private abortController = new AbortController()
  private limit = RateLimit(5, { signal: this.abortController.signal })

  constructor(opts: IngestorOpts) {
    this.node = opts.node
    this.logger = opts.logger
    this.OPENSEA_API_KEY = (this.node as any).opts.openSeaAPIKey
    this.client = new OpenSeaStreamClient({
      token: this.OPENSEA_API_KEY,
      connectOptions: {
        transport: WebSocket,
      },
    })
  }

  public async start() {
    this.logger.info('OpenSea Ingestor: Starting...')
    this.running = true
    const collectionAddresses = (this.node as any).opts.collectionAddresses
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
    const [chain, collectionAddress, tokenId] =
      event.payload.item.nft_id.split('/')
    if (chain !== 'ethereum') return
    const orderHash = event.payload.order_hash
    let log = `OpenSea Ingestor: New event ${
      event.event_type
    } for collection ${short(collectionAddress)}, order hash: ${short(
      orderHash
    )}`
    const orderType =
      event.event_type === EventType.ITEM_LISTED
        ? OpenSeaOrderType.LISTINGS
        : OpenSeaOrderType.OFFERS
    const order = await this._getOrder(
      collectionAddress,
      tokenId,
      orderHash,
      orderType
    )
    if (order === undefined) return
    const added = await this.node.addOrders([order])
    if (added === 1) {
      log += '. Added valid order to db.'
    } else {
      log += '. Order not added to db.'
    }
    this.logger.info(log)
  }

  private async _getOrder(
    address: Address,
    tokenId: string,
    orderHash: string,
    type: OpenSeaOrderType
  ) {
    const params = new URLSearchParams({
      asset_contract_address: address,
      token_ids: tokenId,
      order_by: 'created_date',
      order_direction: 'desc',
    })
    const base =
      type === OpenSeaOrderType.LISTINGS
        ? this.LISTINGS_ENDPOINT
        : this.OFFERS_ENDPOINT
    await this.limit()
    try {
      const response = await this._fetch(`${base}?${params.toString()}`)
      const data: any = await response.json()
      if (data.orders === undefined || data.orders.length === 0)
        return undefined
      const orders = data.orders as OpenSeaOrder[]
      const order = orders.find((o) => o.order_hash === orderHash)
      if (order === undefined) return undefined
      return this._orderToOrderJSON(order)
    } catch (error: any) {
      this.logger.error(
        `Error fetching order from OpenSea: ${error.message ?? error}`
      )
    }
  }

  private _orderToOrderJSON(order: OpenSeaOrder): OrderJSON {
    const { parameters, signature } = order.protocol_data
    delete (parameters as any).totalOriginalConsiderationItems
    return {
      ...parameters,
      startTime: Number(parameters.startTime),
      endTime: Number(parameters.endTime),
      salt: BigNumber.from(parameters.salt).toString(),
      signature,
      chainId: '1',
    }
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
      this.logger.error(
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
        'X-API-KEY': this.OPENSEA_API_KEY,
        ...opts.headers,
      },
    })
  }

  public stop() {
    if (!this.running) return
    this.logger.info('OpenSea Ingestor: Stopping...')
    this.client.disconnect()
    this.abortController.abort()
    this.running = false
  }
}
