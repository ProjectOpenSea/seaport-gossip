import { Order } from '@prisma/client'

import type { ConsiderationItem, OfferItem } from '@prisma/client'
import type { BigNumber } from 'ethers'

/**
 * Helpers
 */
export type Address = string

export type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;

/**
 * Enums
 */
export enum ItemType {
    ETH,
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
    NEW
  }

export enum OrderSort {
    NEWEST,
    OLDEST,
    ENDING_SOON,
    PRICE_ASC,
    PRICE_DESC,
    RECENTLY_FULFILLED,
    RECENTLY_VALIDATED,
    HIGHEST_LAST_SALE
  }

export enum OrderFilter {
    OFFERER_ADDRESS,
    TOKEN_IDS,
    BUY_NOW,
    ON_AUCTION,
    SINGLE_ITEM,
    BUNDLES,
    CURRENCY,
    HAS_OFFERS
  }

export interface OrderFilterOpts {
    [OrderFilter.OFFERER_ADDRESS]?: Address
    [OrderFilter.TOKEN_IDS]?: bigint[]
    [OrderFilter.BUY_NOW]?: undefined
    [OrderFilter.ON_AUCTION]?: undefined
    [OrderFilter.SINGLE_ITEM]?: undefined
    [OrderFilter.BUNDLES]?: undefined
    [OrderFilter.CURRENCY]?: Address
    [OrderFilter.HAS_OFFERS]?: undefined
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
    offer: OfferItem[];
    consideration: ConsiderationItem[];
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