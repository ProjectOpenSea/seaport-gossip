import { createFromProtobuf } from '@libp2p/peer-id-factory'
import { Order } from '@prisma/client'

import { DEFAULT_SEAPORT_ADDRESS } from './constants.js'
import { parseBootnodes } from './helpers.js'
import { Color } from './log.js'

import type { PeerId } from '@libp2p/interface-peer-id'
import type { Multiaddr } from '@multiformats/multiaddr'
import type { ConsiderationItem, OfferItem } from '@prisma/client'
import type { BigNumber, ethers } from 'ethers'
import type winston from 'winston'

/**
 * Options for initializing a node.
 */
export interface SeaportGossipNodeOpts {
  /**
   * Ethereum JSON-RPC url for order validation, or a custom {@link ethers} provider.
   * This can also be a url specified via environment variable `WEB3_PROVIDER`.
   * The ethereum chain ID this node will use will be requested from this provider via `eth_chainId`.
   */
  web3Provider?: string | ethers.providers.JsonRpcProvider

  /**
   * Path to the datadir to use (dev.db must be located inside)
   * Default in dev: ./datadirs/datadir
   * Default in prod: TBD, probably datadir within OS-specific app config folder
   */
  datadir?: string

  /**
   * The peer ID to use for this node.
   * Default: randomly generated
   */
  peerId?: PeerId | null

  /**
   * The host to use for the websocket connection.
   * Default: 0.0.0.0
   */
  hostname?: string

  /**
   * The port to use for the websocket connection.
   * Default: 8998
   */
  port?: number

  /**
   * The GraphQL port to use.
   * Default: 4000
   */
  graphqlPort?: number

  /**
   * Whether to report metrics to Prometheus
   * Default: false
   */
  metrics?: boolean

  /**
   * The http server port to use for reporting metrics on `/metrics`
   * Default: 8088
   */
  metricsServerPort?: number

  /**
   * Bootnodes to connect to on start.
   * Default: OpenSea rendezvous server for chainId from web3 provider
   */
  bootnodes?: Array<[PeerId, Multiaddr[]]>

  /**
   * Minimum p2p connections.
   * Will dial for more peers if connections falls below this number.
   * Default: 5
   */
  minConnections?: number

  /**
   * Maximum p2p connections.
   * Will prune connections if exceeds this number.
   * Default: 15
   */
  maxConnections?: number

  /**
   * Collections to watch on start.
   * Use 'all' to subscribe to all topics.
   * Default: none
   */
  collectionAddresses?: Address[]

  /**
   * Maximum number of orders to keep in the database. Approx 1KB per order.
   * Default: 100_000 (~100MB)
   */
  maxOrders?: number

  /**
   * Maximum number of orders per offerer to keep in the database,
   * to help mitigate spam and abuse. When limit is reached, new orders
   * are ignored until known orders expire via endTime. Limit does not
   * apply to locally submitted transactions, but keep in mind receiving
   * nodes may choose to ignore if their own limits are reached. Healthy
   * order submission includes short endTimes and use of criteria.
   * Default: 100
   **/
  maxOrdersPerOfferer?: number

  /**
   * Maximum days in advance to keep an order until its startTime.
   * Default: 14 days
   */
  maxOrderStartTime?: number

  /**
   * Maximum days to keep an order until its endTime.
   * Default: 180 days
   */
  maxOrderEndTime?: number

  /**
   * Maximum days to keep an order after it has been fulfilled or cancelled.
   * Default: 7 days
   */
  maxOrderHistory?: number

  /**
   * Maximum RPC requests to make per day validating orders.
   * If the 24 hour limit has not been hit then requests are granted
   * on a per-second basis.
   * Default: 25,000 requests
   */
  maxRPCRequestsPerDay?: number

  /**
   * Optional custom Seaport address. Default: Seaport v1.1 address
   * This can also be an address specified via environment variable `SEAPORT_ADDRESS`
   */
  seaportAddress?: Address

  /**
   * Whether to ingest orders from the OpenSea API.
   * An OpenSea API key must also be provided.
   */
  ingestOpenSeaOrders?: boolean

  /**
   * An OpenSea API key to ingest orders from the OpenSea API
   */
  openSeaAPIKey?: string

  /**
   * Optionally pass a custom {@link winston.Logger}
   */
  logger?: winston.Logger | null

  /**
   * Minimum log level to output
   * Default: info
   */
  logLevel?: string

  /**
   * Custom logger label color
   * Default: Color.FG_WHITE
   */
  logColor?: Color

  /**
   * If the node should start in client or server mode
   * Default: true
   */
  clientMode?: boolean

  /**
   * For custom libp2p behavior, this object is passed
   * to the libp2p create options.
   * Default: none
   */
  customLibp2pConfig?: object

  /**
   * Revalidate stale orders on this interval in seconds.
   * Default: 60 seconds
   */
  revalidateInterval?: number

  /**
   * Revalidate stale orders farther than this block distance.
   * Default: 25 blocks (~5 minutes)
   */
  revalidateBlockDistance?: number

  /**
   * Whether to get all orders for subscribed collections when connecting to new peers.
   * Default: false
   */
  getAllOrdersFromPeers?: boolean

  /**
   * Whether to require orders must include OpenSee as a fee recipient.
   * Default: true
   */
  validateOpenSeaFeeRecipient?: boolean
}

/** Env vars */
const {
  WEB3_PROVIDER,
  OPENSEA_API_KEY,
  SEAPORT_ADDRESS,
  SEAPORT_GOSSIP_BOOTNODES,
  SEAPORT_GOSSIP_COLLECTION_ADDRESSES,
  SEAPORT_GOSSIP_DATADIR,
  SEAPORT_GOSSIP_GET_ALL_ORDERS_FROM_PEERS,
  SEAPORT_GOSSIP_GRAPHQL_PORT,
  SEAPORT_GOSSIP_HOSTNAME,
  SEAPORT_GOSSIP_INGEST_OPENSEA_ORDERS,
  SEAPORT_GOSSIP_LOG_LEVEL,
  SEAPORT_GOSSIP_METRICS,
  SEAPORT_GOSSIP_METRICS_SERVER_PORT,
  SEAPORT_GOSSIP_PEER_ID_PROTOBUF,
  SEAPORT_GOSSIP_PORT,
  SEAPORT_GOSSIP_VALIDATE_OPENSEA_FEE_RECIPIENT,
} = process.env

/**
 * Default options for initializing a node when unspecified in {@link SeaportGossipNodeOpts}.
 */
export const seaportGossipNodeDefaultOpts = {
  web3Provider: WEB3_PROVIDER ?? '',
  datadir: SEAPORT_GOSSIP_DATADIR ?? './datadirs/datadir',
  peerId:
    SEAPORT_GOSSIP_PEER_ID_PROTOBUF !== undefined
      ? await createFromProtobuf(
          Buffer.from(SEAPORT_GOSSIP_PEER_ID_PROTOBUF, 'hex')
        )
      : null,
  hostname: SEAPORT_GOSSIP_HOSTNAME ?? '0.0.0.0',
  port: SEAPORT_GOSSIP_PORT !== undefined ? Number(SEAPORT_GOSSIP_PORT) : 8998,
  graphqlPort:
    SEAPORT_GOSSIP_GRAPHQL_PORT !== undefined
      ? Number(SEAPORT_GOSSIP_GRAPHQL_PORT)
      : 4000,
  metrics: SEAPORT_GOSSIP_METRICS === 'true' ? true : false,
  metricsServerPort:
    SEAPORT_GOSSIP_METRICS_SERVER_PORT !== undefined
      ? Number(SEAPORT_GOSSIP_METRICS_SERVER_PORT)
      : 8088,
  bootnodes:
    SEAPORT_GOSSIP_BOOTNODES !== undefined
      ? parseBootnodes(SEAPORT_GOSSIP_BOOTNODES)
      : [],
  minConnections: 5,
  maxConnections: 15,
  collectionAddresses: SEAPORT_GOSSIP_COLLECTION_ADDRESSES?.split(',') ?? [],
  maxOrders: 100_000,
  maxOrdersPerOfferer: 100,
  maxOrderStartTime: 14,
  maxOrderEndTime: 180,
  maxOrderHistory: 7,
  maxRPCRequestsPerDay: 25_000,
  seaportAddress: SEAPORT_ADDRESS ?? DEFAULT_SEAPORT_ADDRESS,
  ingestOpenSeaOrders:
    SEAPORT_GOSSIP_INGEST_OPENSEA_ORDERS === 'true' ? true : false,
  openSeaAPIKey: OPENSEA_API_KEY ?? '',
  logger: null,
  logLevel: SEAPORT_GOSSIP_LOG_LEVEL ?? 'info',
  logColor: Color.FG_WHITE,
  clientMode: true,
  customLibp2pConfig: {},
  revalidateInterval: 60,
  revalidateBlockDistance: 25,
  getAllOrdersFromPeers:
    SEAPORT_GOSSIP_GET_ALL_ORDERS_FROM_PEERS === 'true' ? true : false,
  validateOpenSeaFeeRecipient:
    SEAPORT_GOSSIP_VALIDATE_OPENSEA_FEE_RECIPIENT === 'false' ? false : true,
}

/**
 * Helpers
 */

/** 0x-prefixed ethereum address */
export type Address = string

/** UTC timestamp in seconds */
export type Timestamp = string

/** Type helper to make certain keys of an object optional */
export type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>

/**
 * Enums
 */
export enum ItemType {
  NATIVE,
  ERC20,
  ERC721,
  ERC1155,
  ERC721_WITH_CRITERIA,
  ERC1155_WITH_CRITERIA,
}

export enum OrderType {
  FULL_OPEN,
  PARTIAL_OPEN,
  FULL_RESTRICTED,
  PARTIAL_RESTRICTED,
}

export enum OrderEvent {
  FULFILLED,
  CANCELLED,
  VALIDATED,
  INVALIDATED,
  COUNTER_INCREMENTED,
  NEW,
}

export enum OrderSort {
  NEWEST,
  OLDEST,
  ENDING_SOON,
  PRICE_ASC,
  PRICE_DESC,
  RECENTLY_FULFILLED,
  RECENTLY_VALIDATED,
  HIGHEST_LAST_SALE,
}

export enum OrderFilter {
  OFFERER_ADDRESS,
  TOKEN_ID,
  BUY_NOW,
  ON_AUCTION,
  SINGLE_ITEM,
  BUNDLES,
  CURRENCY,
}

export enum Side {
  BUY,
  SELL,
}

export enum SeaportEvent {
  ORDER_FULFILLED = 'OrderFulfilled',
  ORDER_CANCELLED = 'OrderCancelled',
  ORDER_VALIDATED = 'OrderValidated',
  COUNTER_INCREMENTED = 'CounterIncremented',
}

export enum AuctionType {
  BASIC,
  ENGLISH,
  DUTCH,
}

/**
 * Opts for {@link OrderFilter}.
 * Note: any filters omitted or passed with `false` will be ignored.
 */
export interface OrderFilterOpts {
  [OrderFilter.OFFERER_ADDRESS]?: Address
  [OrderFilter.TOKEN_ID]?: number | bigint | string
  [OrderFilter.BUY_NOW]?: boolean
  [OrderFilter.ON_AUCTION]?: boolean
  [OrderFilter.SINGLE_ITEM]?: boolean
  [OrderFilter.BUNDLES]?: boolean
  [OrderFilter.CURRENCY]?: Address
}

export type OrderStatus = [
  isValidated: boolean,
  isCancelled: boolean,
  totalFilled: BigNumber,
  totalSize: BigNumber
]

/**
 * Order types - Prisma models
 */
export { Order, OfferItem, ConsiderationItem }

export type OrderWithItems = Order & {
  offer: OfferItem[]
  consideration: ConsiderationItem[]
}

/**
 * Order types - JSON
 */
export interface OfferItemJSON {
  itemType: ItemType
  token: Address
  identifierOrCriteria: string
  startAmount: string
  endAmount: string
}
export interface ConsiderationItemJSON extends OfferItemJSON {
  recipient: Address
}

export type ItemJSON = OfferItemJSON | ConsiderationItemJSON

export interface SpentItem {
  itemType: ItemType
  token: Address
  identifier: string
  amount: string
}
export interface ReceivedItem extends SpentItem {
  recipient: Address
}
export interface OrderJSON {
  offer: OfferItemJSON[]
  consideration: ConsiderationItemJSON[]
  offerer: Address
  signature: string
  orderType: OrderType
  startTime: number
  endTime: number
  counter: number
  salt: string
  conduitKey: string
  zone: Address
  zoneHash: string
  chainId: string

  // Basic Order
  additionalRecipients?: string[]

  // Advanced Order
  numerator?: string | null
  denominator?: string | null
  extraData?: string | null
}

export interface GossipsubEvent {
  event: OrderEvent
  orderHash: string
  order: OrderJSON
  blockNumber: string
  blockHash: string
}
