import { ethers } from 'ethers'

import ISeaport from '../contract-abi/Seaport.json' assert { type: 'json' }
import { short } from '../index.js'
import { publishEvent } from '../util/gossipsub.js'
import { emptyOrderJSON } from '../util/serialize.js'
import { ItemType, OrderEvent, SeaportEvent } from '../util/types.js'

import type { SeaportGossipNode } from '../node.js'
import type {
  Address,
  GossipsubEvent,
  ReceivedItem,
  SpentItem,
} from '../util/types.js'
import type { OrderValidator } from '../validate/order.js'
import type { GossipSub } from '@chainsafe/libp2p-gossipsub'
import type { PrismaClient } from '@prisma/client'
import type winston from 'winston'

interface SeaportListenersOpts {
  node: SeaportGossipNode
  prisma: PrismaClient
  gossipsub: GossipSub
  provider: ethers.providers.JsonRpcProvider
  validator: OrderValidator
  logger: winston.Logger
}

export class SeaportListener {
  private node: SeaportGossipNode
  private prisma: PrismaClient
  private gossipsub: GossipSub
  private provider: ethers.providers.JsonRpcProvider
  private validator: OrderValidator
  private logger: winston.Logger
  private seaport: ethers.Contract

  private running = false

  constructor(opts: SeaportListenersOpts) {
    this.node = opts.node
    this.prisma = opts.prisma
    this.gossipsub = opts.gossipsub
    this.validator = opts.validator
    this.provider = opts.provider
    this.logger = opts.logger
    this.seaport = new ethers.Contract(
      (this.node as any).opts.seaportAddress,
      ISeaport,
      this.provider
    )
  }

  /**
   * Subscribe to the Seaport contract for emitted order events.
   */
  public start() {
    if (this.running) return

    this.seaport.on(
      SeaportEvent.ORDER_FULFILLED,
      async (orderHash, offerer, zone, recipient, offer, consideration) => {
        await this._onFulfilledEvent(
          orderHash,
          offerer,
          zone,
          recipient,
          offer,
          consideration
        )
      }
    )

    this.seaport.on(
      SeaportEvent.ORDER_CANCELLED,
      async (orderHash, offerer, zone) => {
        await this._onCancelledEvent(orderHash, offerer, zone)
      }
    )

    this.seaport.on(
      SeaportEvent.ORDER_VALIDATED,
      async (orderHash, offerer, zone) => {
        await this._onValidatedEvent(orderHash, offerer, zone)
      }
    )

    this.seaport.on(
      SeaportEvent.COUNTER_INCREMENTED,
      async (newCounter, offerer) => {
        await this._onCounterIncrementedEvent(newCounter.toNumber(), offerer)
      }
    )

    this.logger.info(
      `Subscribed to events from the Seaport contract (${short(
        this.seaport.address
      )})`
    )
    this.running = true
    return true
  }

  /**
   * Handle OrderFulfilled event from the Seaport contract.
   */
  private async _onFulfilledEvent(
    orderHash: string,
    offerer: Address,
    zone: Address,
    recipient: Address,
    offer: SpentItem[],
    consideration: ReceivedItem[]
  ) {
    const order = await this.node.getOrderByHash(orderHash)
    if (order === null) return
    this.logger.info(
      `Received OrderFulfilled event for order hash ${short(orderHash)}`
    )
    const block = await this.provider.getBlock('latest')
    const blockDetails = {
      lastValidatedBlockHash: block.hash,
      lastValidatedBlockNumber: block.number.toString(),
      lastFulfilledAt: block.number.toString(),
    }
    if (order.numerator === undefined) {
      // Basic order, mark as fully fulfilled
      await this.prisma.orderMetadata.update({
        where: { orderHash },
        data: { ...blockDetails, isFullyFulfilled: true },
      })
    } else {
      // Advanced order, update last fulfillment
      const isFullyFulfilled = await this.validator.isFullyFulfilled(orderHash)
      const offerOrConsideration = offer.some(
        (o) => o.itemType === ItemType.NATIVE || o.itemType === ItemType.ERC20
      )
        ? offer
        : consideration
      const lastFulfilledPrice = offerOrConsideration
        .reduce(
          (prevValue, o) =>
            o.itemType === ItemType.NATIVE || o.itemType === ItemType.ERC20
              ? prevValue + BigInt(o.amount)
              : prevValue,
          0n
        )
        .toString()
      await this.prisma.orderMetadata.update({
        where: { orderHash },
        data: {
          ...blockDetails,
          isFullyFulfilled,
          lastFulfilledPrice,
        },
      })

      const event = {
        event: OrderEvent.FULFILLED,
        orderHash,
        order,
        blockNumber: block.number.toString(),
        blockHash: block.hash,
      }
      await this._publishEvent(event)
    }
  }
  /**
   * Handle OrderCancelled event from the Seaport contract.
   */
  private async _onCancelledEvent(
    orderHash: string,
    _offerer: Address,
    _zone: Address
  ) {
    const order = await this.node.getOrderByHash(orderHash)
    if (order === null) return
    this.logger.info(
      `Received OrderCancelled event for order hash ${short(orderHash)}`
    )
    const block = await this.provider.getBlock('latest')
    await this.prisma.orderMetadata.update({
      where: { orderHash },
      data: {
        isValid: false,
        lastValidatedBlockHash: block.hash,
        lastValidatedBlockNumber: block.number.toString(),
      },
    })

    const event = {
      event: OrderEvent.CANCELLED,
      orderHash,
      order,
      blockNumber: block.number.toString(),
      blockHash: block.hash,
    }
    await this._publishEvent(event)
  }

  /**
   * Handle OrderValidated event from the Seaport contract.
   */
  private async _onValidatedEvent(
    orderHash: string,
    _offerer: Address,
    _zone: Address
  ) {
    const order = await this.node.getOrderByHash(orderHash)
    if (order === null) return
    this.logger.info(
      `Received OrderValidated event for order hash ${short(orderHash)}`
    )
    const [isValid, _, lastValidatedBlockHash, lastValidatedBlockNumber] =
      await this.validator.validate(order)
    await this.prisma.orderMetadata.update({
      where: { orderHash },
      data: {
        isValid,
        lastValidatedBlockHash,
        lastValidatedBlockNumber,
      },
    })

    const event = {
      event: OrderEvent.VALIDATED,
      orderHash,
      order,
      blockNumber: lastValidatedBlockNumber.toString(),
      blockHash: lastValidatedBlockHash,
    }
    await this._publishEvent(event)
  }

  /**
   * Handle CounterIncremented event from the Seaport contract.
   */
  public async _onCounterIncrementedEvent(
    newCounter: number,
    offerer: Address,
    publishGossipsubEvent = true
  ) {
    const orders = await this.prisma.order.findMany({
      where: { offerer, counter: { lt: newCounter } },
    })
    if (orders.length === 0) return
    this.logger.info(
      `Received CounterIncremented event for offerer ${short(
        offerer
      )}, cancelling ${orders.length} orders below new counter of ${newCounter}`
    )
    const block = await this.provider.getBlock('latest')
    for (const order of orders) {
      await this.prisma.orderMetadata.update({
        where: { orderHash: order.hash },
        data: {
          isValid: false,
          lastValidatedBlockHash: block.hash,
          lastValidatedBlockNumber: block.number.toString(),
        },
      })
    }

    if (publishGossipsubEvent) {
      const event = {
        event: OrderEvent.COUNTER_INCREMENTED,
        offerer,
        orderHash: ethers.constants.HashZero,
        order: { ...emptyOrderJSON, offerer, counter: newCounter },
        blockNumber: block.number.toString(),
        blockHash: block.hash,
      }
      await this._publishEvent(event)
    }
  }

  /**
   * Unsubscribe from events from the Seaport contract.
   */
  public stop() {
    if (!this.running) return
    this.seaport.removeAllListeners()
    this.logger.info(`Unsubscribed from events from the Seaport contract`)
    this.running = false
  }

  /** Convenience handler */
  private async _publishEvent(event: GossipsubEvent) {
    await publishEvent(event, this.gossipsub, this.logger)
  }
}
