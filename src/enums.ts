export enum ItemType {
    ETH,
    ERC20,
    ERC721,
    ERC1155
}

export enum OrderType {
    FULL_OPEN,
    PARTIAL_OPEN,
    FULL_RESTRICTED,
    PARTIAL_RESTRICTED
}

export enum OrderEvent {
    FULFILLED,
    CANCELLED,
    VALIDATED,
    INVALIDATED,
    COUNTER_INCREMENTED,
}