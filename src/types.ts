import { Order } from '@prisma/client'

import type { ConsiderationItem, OfferItem } from '@prisma/client'

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
  }

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
    numerator?: number | null
    denominator?: number | null
    extraData?: string | null
}