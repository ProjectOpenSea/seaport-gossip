import { ethers } from 'ethers'

import { short } from '../index.js'
import { emptyOrderJSON } from '../util/serialize.js'
import { ItemType, OrderEvent, SeaportEvent } from '../util/types.js'

import type { SeaportGossipNode } from '../node.js'
import type { Address, ReceivedItem, SpentItem } from '../util/types.js'

interface SeaportListenersOpts {
  node: SeaportGossipNode
}

export class SeaportListener {
  private node: SeaportGossipNode

  private running = false

  constructor(opts: SeaportListenersOpts) {
    this.node = opts.node
  }

  /**
   * Subscribe to the Seaport contract for emitted order events.
   */
  public start() {
    if (this.running) return

    this.node.seaport.on(
      SeaportEvent.ORDER_FULFILLED,
      async (orderHash, _offerer, _zone, _recipient, offer, consideration) => {
        await this._onFulfilledEvent(orderHash, offer, consideration)
      }
    )

    this.node.seaport.on(
      SeaportEvent.ORDER_CANCELLED,
      async (orderHash, offerer, zone) => {
        await this._onCancelledEvent(orderHash, offerer, zone)
      }
    )

    this.node.seaport.on(
      SeaportEvent.ORDER_VALIDATED,
      async (orderHash, offerer, zone) => {
        await this._onValidatedEvent(orderHash, offerer, zone)
      }
    )

    this.node.seaport.on(
      SeaportEvent.COUNTER_INCREMENTED,
      async (newCounter, offerer) => {
        await this._onCounterIncrementedEvent(newCounter.toNumber(), offerer)
      }
    )

    this.node.logger.info(
      `Subscribed to events from the Seaport contract (${short(
        this.node.seaport.address
      )})`
    )
    this.running = true
    return true
  }

  /**
   * Handle OrderFulfilled event from the Seaport contract.
   */
  public async _onFulfilledEvent(
    orderHash: string,
    offer: SpentItem[],
    consideration: ReceivedItem[],
    publishGossipsubEvent = true,
    incrementMetrics = true
  ) {
    const order = await this.node.getOrderByHash(orderHash)
    if (order === null) return
    this.node.logger.info(
      `Received OrderFulfilled event for order hash ${short(orderHash)}`
    )
    const block = await this.node.provider.getBlock('latest')
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
      await this.node.prisma.orderMetadata.update({
        where: { orderHash },
        data: { ...details, isFullyFulfilled: true, isValid: false },
      })
    } else {
      // Advanced order, update last fulfillment
      const isFullyFulfilled = await this.node.validator.isFullyFulfilled(
        orderHash
      )
      await this.node.prisma.orderMetadata.update({
        where: { orderHash },
        data: {
          ...details,
          isFullyFulfilled,
          lastFulfilledPrice,
          isValid: isFullyFulfilled ? false : true,
        },
      })
    }

    if (publishGossipsubEvent) {
      order.offer = offer.map((o) => ({
        itemType: o.itemType,
        token: o.token,
        identifierOrCriteria: o.identifier,
        startAmount: o.amount,
        endAmount: o.amount,
      }))
      order.consideration = consideration.map((c) => ({
        itemType: c.itemType,
        token: c.token,
        identifierOrCriteria: c.identifier,
        startAmount: c.amount,
        endAmount: c.amount,
        recipient: c.recipient,
      }))
      const event = {
        event: OrderEvent.FULFILLED,
        orderHash,
        order,
        blockNumber: block.number.toString(),
        blockHash: block.hash,
      }
      await this.node.publishEvent(event)
    }
    if (incrementMetrics) {
      this.node.metrics?.seaportEvents.inc({
        event: OrderEvent[OrderEvent.FULFILLED].toLowerCase(),
      })
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
    this.node.logger.info(
      `Received OrderCancelled event for order hash ${short(orderHash)}`
    )
    const block = await this.node.provider.getBlock('latest')
    await this.node.prisma.orderMetadata.update({
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
    await this.node.publishEvent(event)
    this.node.metrics?.seaportEvents.inc({
      event: OrderEvent[OrderEvent.CANCELLED].toLowerCase(),
    })
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
    this.node.logger.info(
      `Received OrderValidated event for order hash ${short(orderHash)}`
    )
    const [isValid, _, lastValidatedBlockHash, lastValidatedBlockNumber] =
      await this.node.validator.validate(order)
    await this.node.prisma.orderMetadata.update({
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
    await this.node.publishEvent(event)
    this.node.metrics?.seaportEvents.inc({
      event: OrderEvent[OrderEvent.VALIDATED].toLowerCase(),
    })
  }

  /**
   * Handle CounterIncremented event from the Seaport contract.
   */
  public async _onCounterIncrementedEvent(
    newCounter: number,
    offerer: Address,
    publishGossipsubEvent = true,
    incrementMetrics = true
  ) {
    const orders = await this.node.prisma.order.findMany({
      where: { offerer, counter: { lt: newCounter } },
      include: { offer: true },
    })
    this.node.logger.info(
      `Received CounterIncremented event for offerer ${short(
        offerer
      )}, cancelling ${orders.length} order${
        orders.length === 1 ? '' : 's'
      } below new counter of ${newCounter}`
    )
    const block = await this.node.provider.getBlock('latest')
    for (const order of orders) {
      await this.node.prisma.orderMetadata.update({
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
      await this.node.publishEvent(event)
    }
    if (incrementMetrics) {
      this.node.metrics?.seaportEvents.inc({
        event: OrderEvent[OrderEvent.COUNTER_INCREMENTED].toLowerCase(),
      })
    }
  }

  /**
   * Unsubscribe from events from the Seaport contract.
   */
  public stop() {
    if (!this.running) return
    this.node.seaport.removeAllListeners()
    this.node.logger.info(`Unsubscribed from events from the Seaport contract`)
    this.running = false
  }
}
