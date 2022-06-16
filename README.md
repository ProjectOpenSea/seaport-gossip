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
  - Database: GraphQL, SQLite
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
yarn
```

## Run

### JavaScript / TypeScript

```typescript
import { SeaportGossipNode, OrderEvent } from 'seaport-gossip'

const opts = {
  maxOrders: 100_000,
  maxOrdersPerOfferer: 100
}

const node = new SeaportGossipNode(opts)

const orders = await node.getOrders('0xabc')
console.log(orders)

const newOrders = [{}, {}]
const numValid = await node.addOrders(newOrders)
console.log(`Valid added orders: ${numValid}`)

node.subscribe(
  [OrderEvent.FULFILLED, OrderEvent.CANCELLED],
  '0xabc',
  (event) => console.log(`New event: ${event}`)
)
```

### CLI

`seaport-gossip getOrders [address]`

`seaport-gossip addOrder [order]`

`seaport-gossip subscribe [address] [comma-separated event types]`

`seaport-gossip stats`

## API

### gossip.getOrders(address: string)

### gossip.addOrders(orders: Order[])

### gossip.subscribe(events: OrderEvent[])

### gossip.stats()

For more thorough documentation check out the [API docs][api-docs].

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
        field: offer.startAmount
        kind: GREATER_OR_EQUAL
        value: "150000"
      }
      {
        field: offer.endAmount
        kind: GREATER_OR_EQUAL
        value: "150000"
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