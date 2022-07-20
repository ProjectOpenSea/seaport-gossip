# seaport-gossip

![CI][github-actions-badge]

A peer-to-peer network for sharing [Seaport][seaport-repo] orders.

## Table of Contents

- [Overview](#overview)
- [Install](#install)
- [Run](#run)
- [API](#api)
- [GraphQL](#graphql)

## Overview

Seaport Gossip uses [libp2p][libp2p-website] with the following configuration:

- Client
  - Database:
    - Prisma (ORM)
    - GraphQL (query language)
    - SQLite (DB)
  - Metrics: Prometheus / Grafana
- Libp2p
  - Transport: websockets
  - Discovery: bootstrap
  - Content Routing: kad-dht
  - Encryption: NOISE
  - Multiplexing: mplex
  - Pub-Sub: gossipsub

## Install

To add to your project:

```bash
yarn add seaport-gossip
```

or

```bash
npm i --save seaport-gossip
```

To install dependencies for development:

```bash
git clone https://github.com/ProjectOpenSea/seaport-gossip
cd seaport-gossip
yarn && yarn build
```

## Run

### JavaScript / TypeScript

```typescript
import { SeaportGossipNode, OrderEvent, OrderSort } from 'seaport-gossip'

const opts = {
  // A web3 provider allows your node to validate orders
  web3Provider: 'localhost:8550',
  // Default values:
  maxOrders: 100_000, // ~100MB (~1KB per order)
  maxOrdersPerOfferer: 100, // to mitigate order spam
}

const node = new SeaportGossipNode(opts)

const orders = await node.getOrders('0xabc', {
  sort: OrderSort.NEWEST,
  filter: { OrderFilter.BUY_NOW: true },
})
console.log(orders)

const newOrders = [{}, {}]
const numValid = await node.addOrders(newOrders)
console.log(`Valid added orders: ${numValid}`)

node.subscribe('0xabc', [OrderEvent.FULFILLED, OrderEvent.CANCELLED], (event) =>
  console.log(`New event for 0xabc: ${event}`)
)
```

### CLI

Start a node with the GraphQL server enabled:

`seaport-gossip start`

Return orders for a collection:

`seaport-gossip getOrders [address]`

Add an order to the network:

`seaport-gossip addOrder [order]`

Subscribe to events for a collection (runs until stopped with CTRL+C):

`seaport-gossip subscribe [address] [optional comma-separated event types, default: all events]`

Return stats for your node:

`seaport-gossip stats`

## API

### Orders

#### `node.getOrders(address: string, { sort, filter, offset }): Promise<Order[]>`

#### `node.getOrderByHash(hash: string): Promise<Order | null>`

#### `node.validateOrder(hash: string): Promise<boolean>`

#### `node.addOrders(orders: Order[]): Promise<number>`

### Criteria

#### `node.getCriteria(hash: string): Promise<CriteriaTokenIds | null>`

#### `node.addCriteria(tokenIds: bigint[]): Promise<CriteriaHash>`

#### `node.getProofs(criteriaHash: string, tokenIds: bigint[]): Promise<Proof[]>`

### Events

#### `node.subscribe(address: string, events: OrderEvent[], onEvent: (event: OrderEvent) => void): Promise<boolean>`

#### `node.unsubscribe(address: string): Promise<boolean>`

### Miscellaneous

#### `node.stats(): Promise<NodeStats>`

### Docs

For more thorough documentation see the [API docs][api-docs].

## GraphQL

The GraphQL server default starts at http://localhost:4000/graphql

You can query for orders, add new orders, and subscribe to events.

#### Querying orders

```graphql
{
  order(
    hash: "0x38c1b56f95bf168b303e4b62d64f7f475f2ac34124e9678f0bd852f95a4ca377"
  ) {
    chainId
    offer {
      tokenAddress
      startAmount
      endAmount
    }
    consideration {
      tokenAddress
      startAmount
      endAmount
    }
  }
}
```

#### Filtering orders

```graphql
{
  orders(
    filters: [
      {
        field: offer.currentPrice
        kind: GREATER_OR_EQUAL
        value: '10000000000000000'
      }
    ]
  ) {
    hash
    offerer
  }
}
```

#### Adding orders

```graphql
mutation AddOrders {
    addOrders(
        orders: [
            {
                ...
            }
        ]
    ) {
        accepted {
            order {
                hash
            }
            isNew
        }
        rejected {
            hash
            code
            message
        }
    }
}
```

#### Subscribing to events

You can subscribe to order events via a subscription.

```graphql
subscription {
  orderEvents {
    timestamp
    order {
      hash
      offerer
    }
  }
}
```

#### Stats

You can get stats for your node via the `stats` query.

```graphql
{
  stats {
    version
    peerID
    ethChainID
    latestBlock {
      number
      hash
    }
    numPeers
    numOrders
    numOrdersIncludingRemoved
    numOrdersIncludingInvalidated
    startOfCurrentUTCDay
    ethRPCRequestsSentInCurrentUTCDay
    ethRPCRateLimitExpiredRequests
    maxExpirationTime
  }
}
```

[seaport-repo]: https://github.com/ProjectOpenSea/seaport
[api-docs]: ./docs
[libp2p-website]: https://libp2p.io/
[github-actions-badge]: https://github.com/ProjectOpenSea/seaport-gossip/actions/workflows/test.yml/badge.svg?branch=main
