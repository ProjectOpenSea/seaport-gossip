import { ethers } from 'ethers'

import ISeaport from '../contract-abi/Seaport.json' assert { type: 'json' }
import { short } from '../index.js'
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
import type { PrismaClient } from '@prisma/client'
import type winston from 'winston'

interface SeaportListenersOpts {
  node: SeaportGossipNode
  prisma: PrismaClient
  provider: ethers.providers.JsonRpcProvider
  validator: OrderValidator
  logger: winston.Logger
}

export class SeaportListener {
  private node: SeaportGossipNode
  private prisma: PrismaClient
  private provider: ethers.providers.JsonRpcProvider
  private validator: OrderValidator
  private logger: winston.Logger
  private seaport: ethers.Contract

  private running = false

  constructor(opts: SeaportListenersOpts) {
    this.node = opts.node
    this.prisma = opts.prisma
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
      async (orderHash, _offerer, _zone, _recipient, offer, consideration) => {
        await this._onFulfilledEvent(orderHash, offer, consideration)
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
    offer: SpentItem[],
    consideration: ReceivedItem[]
  ) {
    const order = await this.node.getOrderByHash(orderHash)
    if (order === null) return
    this.logger.info(
      `Received OrderFulfilled event for order hash ${short(orderHash)}`
    )
    const block = await this.provider.getBlock('latest')
    const offerOrConsideration = offer.some(
      (o) => o.itemType === ItemType.NATIVE || o.itemType === ItemType.ERC20
    )
      ? offer
      : consideration
    const lastFulfilledPrice = offerOrConsideration
      .reduce(
        (prevValue, o) =>
          o.itemType === ItemType.NATIVE || o.itemType === ItemType.ERC20
            ? prevValue + BigInt(o.amount ?? (o as any).startAmount) // TODO fix, if order is coming from gossipsub does not have amount but start/endAmount
            : prevValue,
        0n
      )
      .toString()
    const details = {
      lastValidatedBlockHash: block.hash,
      lastValidatedBlockNumber: block.number.toString(),
      lastFulfilledAt: block.number.toString(),
      lastFulfilledPrice,
    }
    if (order.numerator === undefined) {
      // Basic order, mark as fully fulfilled
      await this.prisma.orderMetadata.update({
        where: { orderHash },
        data: { ...details, isFullyFulfilled: true, isValid: false },
      })
    } else {
      // Advanced order, update last fulfillment
      const isFullyFulfilled = await this.validator.isFullyFulfilled(orderHash)
      await this.prisma.orderMetadata.update({
        where: { orderHash },
        data: {
          ...details,
          isFullyFulfilled,
          lastFulfilledPrice,
          isValid: isFullyFulfilled ? false : true,
        },
      })
    }

    const event = {
      event: OrderEvent.FULFILLED,
      orderHash,
      order,
      blockNumber: block.number.toString(),
      blockHash: block.hash,
    }
    await this._publishEvent(event)
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
      include: { offer: true },
    })
    this.logger.info(
      `Received CounterIncremented event for offerer ${short(
        offerer
      )}, cancelling ${orders.length} order${
        orders.length === 1 ? '' : 's'
      } below new counter of ${newCounter}`
    )
    if (orders.length === 0) return
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
      // Set all offer items to broadcast on every collection address
      const offer = orders.map((o) => o.offer).flat()

      const event = {
        event: OrderEvent.COUNTER_INCREMENTED,
        offerer,
        orderHash: ethers.constants.HashZero,
        order: {
          ...emptyOrderJSON,
          offerer,
          counter: newCounter,
          offer,
        },
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
    await (this.node as any)._publishEvent(event)
  }
}
