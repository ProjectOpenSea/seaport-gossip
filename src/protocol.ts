import { ethers } from 'ethers'

import { short } from './util/helpers.js'
import {
  deriveOrderHash,
  orderSignatureToFixed65Bytes,
  orderSignatureToVariableBytes,
} from './util/order.js'
import { defaultAdvancedOrderValues } from './util/serialize.js'
import {
  CriteriaItems as sszCriteriaItems,
  GetCriteria as sszGetCriteria,
  OrderCount as sszOrderCount,
  OrderHashes as sszOrderHashes,
  OrderQuery as sszOrderQuery,
  Orders as sszOrders,
} from './util/sszTypes.js'

import { bufToPrefixedStr, prefixedStrToBuf } from './index.js'

import type { SeaportGossipNode } from './node.js'
import type { GetOrdersOpts } from './query/order.js'
import type { Address, OrderJSON } from './util/types.js'
import type { PeerId } from '@libp2p/interface-peer-id'
import type winston from 'winston'

/**
 * Utils
 */
export interface OrderQuery {
  reqId: number
  address: Address
  opts: Required<GetOrdersOpts>
}

const encodeOrderQuery = (
  reqId: number,
  address: Address,
  opts: Required<GetOrdersOpts>
): Uint8Array => {
  return sszOrderQuery.serialize({
    reqId,
    address: prefixedStrToBuf(address),
    opts: {
      ...opts,
      filter: [], // todo implement
    },
  })
}

const decodeOrderQuery = (data: Uint8Array): OrderQuery => {
  const orderQuery = sszOrderQuery.deserialize(data)
  const address = ethers.utils.getAddress(bufToPrefixedStr(orderQuery.address))
  return {
    reqId: orderQuery.reqId,
    address,
    opts: {
      ...orderQuery.opts,
      filter: {}, // todo implement
      onlyCount: false,
      validate: false,
    },
  }
}

export const encodeProtocol = (name: string) => {
  const protocol = protocols.find((p) => p.name === name)
  if (protocol === undefined)
    throw new Error(`protocol with name "${name}" not found`)
  const codeBuf = Buffer.alloc(4)
  codeBuf.writeUint8(protocol.code)
  return Uint8Array.from(codeBuf)
}

/**
 * Orders
 */
export const ordersEncode = (
  reqId: number,
  orders: OrderJSON[]
): Uint8Array => {
  const formattedOrders = []
  for (let order of orders) {
    // If signature is 64 bytes, encode it as 65 bytes since
    // ssz strictly requires it to be 65 bytes. We will make
    // it 64 bytes again on decode.
    order.signature = orderSignatureToFixed65Bytes(order.signature)

    // Set defaults for optional values
    order = { ...defaultAdvancedOrderValues, ...order }

    formattedOrders.push(order)
  }

  const ssz = sszOrders.fromJson({ reqId, orders: formattedOrders })
  return sszOrders.serialize(ssz)
}

export const ordersDecode = (data: Uint8Array) => {
  const ssz = sszOrders.deserialize(data)
  const reqId = ssz.reqId
  const orders = ssz.orders as any
  for (const order of orders) {
    order.signature = orderSignatureToVariableBytes(order.signature)

    order.counter = Number(order.counter)

    order.chainId = order.chainId.toString()
    order.numerator = order.numerator.toString()
    order.denominator = order.denominator.toString()
    order.salt = order.salt.toString()

    order.conduitKey = bufToPrefixedStr(order.conduitKey)
    order.signature = bufToPrefixedStr(order.signature)
    order.extraData = bufToPrefixedStr(order.extraData)
    order.zoneHash = bufToPrefixedStr(order.zoneHash)

    order.offerer = ethers.utils.getAddress(bufToPrefixedStr(order.offerer))
    order.zone = ethers.utils.getAddress(bufToPrefixedStr(order.zone))

    for (const item of [...order.offer, ...order.consideration]) {
      item.token = ethers.utils.getAddress(bufToPrefixedStr(item.token))
      item.startAmount = item.startAmount.toString()
      item.endAmount = item.startAmount.toString()
      item.identifierOrCriteria = item.identifierOrCriteria.toString()
    }
    for (const item of order.consideration) {
      item.recipient = ethers.utils.getAddress(bufToPrefixedStr(item.recipient))
    }

    // Delete optional values
    if (order.additionalRecipients.length === 0)
      delete order.additionalRecipients
    if (order.numerator === '0') delete order.numerator
    if (order.denominator === '0') delete order.denominator
    if (order.extraData === ethers.constants.HashZero) delete order.extraData
  }
  return { reqId, orders: orders as OrderJSON[] }
}

/**
 * GetOrderHashes
 */
export const getOrderHashesEncode = (
  reqId: number,
  address: Address,
  opts: Required<GetOrdersOpts>
): Uint8Array => encodeOrderQuery(reqId, address, opts)

export const getOrderHashesDecode = (data: Uint8Array) => decodeOrderQuery(data)

/**
 * OrderHashes
 */
export const orderHashesEncode = (
  reqId: number,
  hashes: string[]
): Uint8Array => {
  return sszOrderHashes.serialize({
    reqId,
    hashes: hashes.map((hash) => prefixedStrToBuf(hash)),
  })
}

export const orderHashesDecode = (data: Uint8Array) => {
  const message = sszOrderHashes.deserialize(data)
  return {
    reqId: message.reqId,
    hashes: message.hashes.map((buf) => bufToPrefixedStr(buf)),
  }
}

/**
 * GetOrderCount
 */
export const getOrderCountEncode = (
  reqId: number,
  address: Address,
  opts: Required<GetOrdersOpts>
): Uint8Array => encodeOrderQuery(reqId, address, opts)

export const getOrderCountDecode = (data: Uint8Array) => decodeOrderQuery(data)

/**
 * OrderCount
 */
export const orderCountEncode = (reqId: number, count: number) => {
  const data = sszOrderCount.serialize({ reqId, count })
  return data
}

export const orderCountDecode = (data: Uint8Array) => {
  const message = sszOrderCount.deserialize(data)
  return {
    reqId: message.reqId,
    count: message.count,
  }
}

/**
 * GetCriteria
 */
export const getCriteriaEncode = (reqId: number, hash: string) =>
  sszGetCriteria.serialize({ reqId, hash: prefixedStrToBuf(hash) })

export const getCriteriaDecode = (data: Uint8Array) => {
  const message = sszGetCriteria.deserialize(data)
  return {
    reqId: message.reqId,
    hash: bufToPrefixedStr(message.hash),
  }
}

/**
 * Criteria
 */
export const criteriaEncode = (
  reqId: number,
  hash: string,
  tokenIds: bigint[]
): Uint8Array =>
  sszCriteriaItems.serialize({
    reqId,
    hash: prefixedStrToBuf(hash),
    items: tokenIds,
  })

export const criteriaDecode = (data: Uint8Array) => {
  const message = sszCriteriaItems.deserialize(data)
  return {
    reqId: message.reqId,
    hash: bufToPrefixedStr(message.hash),
    items: message.items,
  }
}

/**
 * Protocol handling
 */
export const handleProtocol = async (
  node: SeaportGossipNode,
  logger: winston.Logger,
  peer: PeerId,
  code: number,
  message: Uint8Array
): Promise<Uint8Array | undefined> => {
  const shortPeerId = short(peer.toString())
  const protocol = protocols.find((p) => p.code === code)
  if (protocol === undefined)
    throw new Error(
      `Received unknown protocol code ${code} from ${shortPeerId}`
    )

  logger.debug(`Received protocol message ${protocol.name} from ${shortPeerId}`)

  switch (protocol.name) {
    case 'GetOrders': {
      const { reqId, hashes } = orderHashesDecode(message)
      const orders = []
      for (const hash of hashes) {
        const order = await node.getOrderByHash(hash)
        if (order !== null) {
          orders.push(order)
        }
      }
      return ordersEncode(reqId, orders)
    }
    case 'Orders': {
      const { reqId, orders } = ordersDecode(message)
      logger.debug(
        `Received ${orders.length} orders from ${shortPeerId} (reqId: ${reqId})`
      )
      return
    }
    case 'GetOrderHashes': {
      const { reqId, address, opts } = getOrderHashesDecode(message)
      logger.debug(
        `Received orders query for address ${address} and opts ${JSON.stringify(
          opts
        )} from ${shortPeerId} (reqId: ${reqId})`
      )
      const orders = await node.getOrders(address, opts)
      const hashes = orders.map((o) => deriveOrderHash(o))
      return orderHashesEncode(reqId, hashes)
    }
    case 'OrderHashes': {
      const { reqId, hashes } = orderHashesDecode(message)
      logger.debug(
        `Received ${hashes.length} order hashes from ${shortPeerId} (reqId: ${reqId})`
      )
      return
    }
    case 'GetOrderCount': {
      const { reqId, address, opts } = getOrderCountDecode(message)
      logger.debug(
        `Received order count query for address ${address} and opts ${JSON.stringify(
          opts
        )} from ${shortPeerId} (reqId: ${reqId})`
      )
      const count = await node.getOrderCount(address, opts)
      return orderCountEncode(reqId, count)
    }
    case 'OrderCount': {
      const { reqId, count } = orderCountDecode(message)
      logger.debug(
        `Received order count ${count} from ${shortPeerId} (reqId: ${reqId})`
      )
      return
    }
    case 'GetCriteria': {
      const { reqId, hash } = getCriteriaDecode(message)
      logger.debug(
        `Received criteria query for hash ${hash} from ${shortPeerId} (reqId: ${reqId})`
      )
      const items = await node.getCriteriaItems(hash)
      return criteriaEncode(reqId, hash, items)
    }
    case 'Criteria': {
      const { reqId, hash, items } = criteriaDecode(message)
      logger.debug(
        `Received criteria ${items.length} items for hash ${hash} from ${shortPeerId} (reqId: ${reqId})`
      )
      return
    }
    default:
      throw new Error(
        `No handler available for ${protocol.name} from ${shortPeerId}`
      )
  }
}

/**
 * Protocols mapping
 */
interface Protocol {
  name: string
  code: number
  encode: (...args: any) => Uint8Array
  decode: (data: Uint8Array) => any
}

export const protocols: Protocol[] = [
  {
    name: 'GetOrders',
    code: 0x01,
    encode: orderHashesEncode,
    decode: orderHashesDecode,
  },
  {
    name: 'Orders',
    code: 0x02,
    encode: ordersEncode,
    decode: ordersDecode,
  },
  {
    name: 'GetOrderHashes',
    code: 0x03,
    encode: getOrderHashesEncode,
    decode: getOrderHashesDecode,
  },
  {
    name: 'OrderHashes',
    code: 0x04,
    encode: orderHashesEncode,
    decode: orderHashesDecode,
  },
  {
    name: 'GetOrderCount',
    code: 0x05,
    encode: getOrderCountEncode,
    decode: getOrderCountDecode,
  },
  {
    name: 'OrderCount',
    code: 0x06,
    encode: orderCountEncode,
    decode: orderCountDecode,
  },
  {
    name: 'GetCriteria',
    code: 0x07,
    encode: getCriteriaEncode,
    decode: getCriteriaDecode,
  },
  {
    name: 'Criteria',
    code: 0x08,
    encode: criteriaEncode,
    decode: criteriaDecode,
  },
]
