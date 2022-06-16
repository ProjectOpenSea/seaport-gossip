import { ItemType, OrderType } from './enums.js'

export type Address = string

export interface OfferItem {
    itemType: ItemType
    token: Address
    identifierOrCriteria: string
    startAmount: string
    endAmount: string
}

export interface ConsiderationItem extends OfferItem {
    recipient: Address
}

export interface Order {
    offer: OfferItem[]
    consideration: ConsiderationItem[]
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
}

export interface BasicOrder extends Order {
    fulfillerConduitKey: string
    additionalRecipients: Address[]
}

export interface AdvancedOrder extends Order {
    fulfillerConduitKey: string
    numerator: number
    denominator: number
    extraData: string
}