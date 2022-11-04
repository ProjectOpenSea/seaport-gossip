import { BigNumber } from 'ethers'

import { orderJSONToChecksummedAddresses, prefixedStrToBuf } from './helpers.js'
import {
  deriveOrderHash,
  orderSignatureToFixed65Bytes,
  orderSignatureToVariableBytes,
} from './order.js'
import {
  GossipsubEvent as sszGossipsubEvent,
  Order as sszOrder,
} from './sszTypes.js'

import type { GossipsubEvent, OrderJSON } from './types.js'
import type { ValueOf } from '@chainsafe/ssz'
import type { Message } from '@libp2p/interface-pubsub'

export const gossipsubMsgIdFn = (msg: Message) => {
  const event = sszGossipsubEvent.deserialize(msg.data)
  const order = toOrderJSON(event.order)
  return Uint8Array.from(
    Buffer.concat([
      prefixedStrToBuf(msg.topic),
      prefixedStrToBuf(deriveOrderHash(order)),
    ])
  )
}

const defaultAdvancedOrderValues = {
  additionalRecipients: [],
  denominator: 0,
  numerator: 0,
  extraData:
    '0x0000000000000000000000000000000000000000000000000000000000000000',
}

const defaultAdvancedOrderNativeValues = {
  additionalRecipients: [],
  denominator: 0n,
  numerator: 0n,
  extraData: new Uint8Array(),
}

export const encodeGossipsubEvent = (event: GossipsubEvent) =>
  sszGossipsubEvent.serialize({
    event: event.event,
    order: sszOrder.fromJson({
      ...event.order,
      ...defaultAdvancedOrderValues,
      signature: orderSignatureToFixed65Bytes(event.order.signature),
    }),
    isValid: event.isValid,
    lastValidatedBlockHash: prefixedStrToBuf(event.lastValidatedBlockHash),
    lastValidatedBlockNumber: Number(event.lastValidatedBlockNumber),
  })

const toOrderJSON = (order: ValueOf<typeof sszOrder>): OrderJSON => {
  const json = sszOrder.toJson({
    ...order,
    ...defaultAdvancedOrderNativeValues,
  }) as unknown as OrderJSON

  json.signature = orderSignatureToVariableBytes(json.signature)

  // Use decimal number for salt
  json.salt = BigNumber.from(json.salt).toString()

  // Convert string values to number for prisma
  json.orderType = Number(json.orderType)
  json.startTime = Number(json.startTime)
  json.endTime = Number(json.endTime)
  json.counter = Number(json.counter)
  for (const item of [...json.offer, ...json.consideration]) {
    item.itemType = Number(item.itemType)
  }

  // Convert address values to checksum
  orderJSONToChecksummedAddresses(json)

  // Set default values to undefined
  if (
    json.additionalRecipients?.length === 0 ||
    (json.additionalRecipients?.length === 1 &&
      json.additionalRecipients[0] === '')
  )
    delete json.additionalRecipients
  if (json.numerator === '0') delete json.numerator
  if (json.denominator === '0') delete json.denominator
  if (json.extraData === '0x') delete json.extraData

  return json
}

export const decodeGossipsubEvent = (data: Uint8Array): GossipsubEvent => {
  const event = sszGossipsubEvent.deserialize(data)
  return {
    event: event.event,
    order: toOrderJSON(event.order),
    isValid: event.isValid,
    lastValidatedBlockHash: `0x${Buffer.from(
      event.lastValidatedBlockHash
    ).toString('hex')}`,
    lastValidatedBlockNumber: `0x${event.lastValidatedBlockNumber.toString(
      16
    )}`,
  }
}
