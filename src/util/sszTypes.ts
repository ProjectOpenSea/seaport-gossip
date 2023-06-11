import {
  BooleanType,
  ByteVectorType,
  ContainerType,
  ListBasicType,
  ListCompositeType,
  UintBigintType,
  UintNumberType,
} from '@chainsafe/ssz'

/** Primitives */
export const Boolean = new BooleanType()
export const Byte = new UintNumberType(1)
export const Bytes4 = new ByteVectorType(4)
export const Bytes8 = new ByteVectorType(8)
export const Bytes20 = new ByteVectorType(20)
export const Bytes32 = new ByteVectorType(32)
export const Bytes48 = new ByteVectorType(48)
export const Bytes96 = new ByteVectorType(96)
export const Uint8 = new UintNumberType(1)
export const Uint16 = new UintNumberType(2)
export const Uint32 = new UintNumberType(4)
export const UintNum64 = new UintNumberType(8)
export const UintNumInf64 = new UintNumberType(8, { clipInfinity: true })
export const UintBn64 = new UintBigintType(8)
export const UintBn128 = new UintBigintType(16)
export const UintBn256 = new UintBigintType(32)

export const Root = new ByteVectorType(32)

const OfferItem = new ContainerType({
  itemType: Uint8,
  token: Bytes20,
  identifierOrCriteria: UintBn256,
  startAmount: UintBn256,
  endAmount: UintBn256,
})

const ConsiderationItem = new ContainerType({
  ...OfferItem.fields,
  recipient: Bytes20,
})

export const Order = new ContainerType({
  offer: new ListCompositeType(OfferItem, 100),
  consideration: new ListCompositeType(ConsiderationItem, 100),
  offerer: Bytes20,
  signature: new ByteVectorType(65),
  orderType: Uint8,
  startTime: Uint32,
  endTime: Uint32,
  counter: UintBn256,
  salt: UintBn256,
  conduitKey: Bytes32,
  zone: Bytes20,
  zoneHash: Bytes32,
  chainId: UintBn256,

  // Basic Order
  additionalRecipients: new ListCompositeType(Bytes20, 50),

  // Advanced Order
  numerator: UintBn256,
  denominator: UintBn256,
  extraData: Bytes32,
})

export const Orders = new ContainerType({
  reqId: UintNum64,
  orders: new ListCompositeType(Order, 1000),
})

export const GossipsubEvent = new ContainerType({
  event: Uint8,
  orderHash: Root,
  order: Order,
  blockNumber: UintNum64,
  blockHash: Root,
})

export const OrderFilter = new ContainerType({
  key: Uint8,
  value: Bytes20,
})

export const GetOrdersOpts = new ContainerType({
  side: Uint8,
  count: Uint32,
  offset: Uint32,
  sort: Uint8,
  filter: new ListCompositeType(OrderFilter, 20),
})

export const OrderQuery = new ContainerType({
  reqId: UintNum64,
  address: Bytes20,
  opts: GetOrdersOpts,
})

export const OrderCount = new ContainerType({
  reqId: UintNum64,
  count: UintNum64,
})

export const OrderHashes = new ContainerType({
  reqId: UintNum64,
  hashes: new ListCompositeType(Bytes32, 1_000_000),
})

export const GetCriteria = new ContainerType({
  reqId: UintNum64,
  hash: Bytes32,
})

export const CriteriaItems = new ContainerType({
  reqId: UintNum64,
  hash: Bytes32,
  items: new ListBasicType(UintBn256, 10_000_000),
})
