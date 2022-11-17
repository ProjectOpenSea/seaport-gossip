![Seaport Gossip](img/seaport-gossip-banner.png)

[![Version][version-badge]][version-link]
[![Test CI][ci-badge]][ci-link]
[![License][license-badge]][license-link]
[![Discussions][discussions-badge]][discussions-link]
[![Discord][discord-badge]][discord-link]

# Seaport Gossip

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
  - Metrics _(coming soon)_: Prometheus / Grafana
- Libp2p
  - Transport: websockets
  - Discovery: bootstrap
  - Content Routing: kad-dht
  - Encryption: NOISE
  - Multiplexing: mplex
  - Pub-Sub: gossipsub

## Install

To install:

```bash
git clone https://github.com/ProjectOpenSea/seaport-gossip
cd seaport-gossip
yarn
```

## Run

### CLI

Ensure you set the environment variables:

`source example.env`

Start a node with the GraphQL server enabled:

`seaport-gossip start`

### JavaScript / TypeScript

```typescript
import { SeaportGossipNode, OrderEvent, OrderSort } from 'seaport-gossip'

const opts = {
  // A web3 provider allows your node to validate orders
  web3Provider: 'localhost:8550',
  // Provide the collection addresses you would like to listen to
  collectionAddresses: ["0x942bc2d3e7a589fe5bd4a5c6ef9727dfd82f5c8a"],
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

node.subscribe('0xabc', (event) =>
  console.log(`New event for 0xabc: ${event}`)
)
```

## API

### Node

#### `node.start()`

#### `node.stop()`

#### `node.connect(address: string | Multiaddr)`

### Orders

#### `node.getOrders(address: string, { sort, filter, offset, limit }): Promise<Order[]>`

#### `node.getOrderByHash(hash: string): Promise<Order | null>`

#### `node.validateOrder(hash: string): Promise<boolean>`

#### `node.addOrders(orders: Order[]): Promise<number>`

### Criteria

_Criteria functionality is still under active development_

#### `node.getCriteria(hash: string): Promise<CriteriaTokenIds | null>`

#### `node.addCriteria(tokenIds: bigint[]): Promise<CriteriaHash>`

#### `node.getProofs(criteriaHash: string, tokenIds: bigint[]): Promise<Proof[]>`

### Events

#### `node.subscribe(address: string, events: OrderEvent[], onEvent: (event: OrderEvent) => void): Promise<boolean>`

#### `node.unsubscribe(address: string): Promise<boolean>`

### Miscellaneous

#### `node.stats(): Promise<NodeStats>`

## GraphQL

The GraphQL server default starts at http://localhost:4000/graphql

You can query for orders, _(and soon)_ add new orders and subscribe to events.

#### Querying orders

```graphql
{
  order(
    hash: "0x38c1b56f95bf168b303e4b62d64f7f475f2ac34124e9678f0bd852f95a4ca377"
  ) {
    chainId
    offer {
      token
      identifierOrCriteria
      startAmount
      endAmount
    }
    consideration {
      token
      identifierOrCriteria
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

_To be added to the GraphQL API, for now the API can be used via node.addOrders()_

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
            isValid
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

_To be added to the GraphQL API, for now the API can be used via node.subscribe()_

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

_Coming soon_

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
    startOfCurrentUTCDay
    ethRPCRequestsSentInCurrentUTCDay
    ethRPCRateLimitExpiredRequests
    maxExpirationTime
  }
}
```

[seaport-repo]: https://github.com/ProjectOpenSea/seaport
[libp2p-website]: https://libp2p.io/
[ci-badge]: https://github.com/ProjectOpenSea/seaport-gossip/actions/workflows/test.yml/badge.svg?branch=main
[ci-link]: https://github.com/ProjectOpenSea/seaport-gossip/actions
[version-badge]: https://img.shields.io/github/package-json/v/ProjectOpenSea/seaport-gossip
[version-link]: https://github.com/ProjectOpenSea/seaport-gossip/blob/main/package.json
[coverage-badge]: https://coveralls.io/repos/github/ProjectOpenSea/seaport-gossip/badge.svg?branch=main
[coverage-link]: https://coveralls.io/github/ProjectOpenSea/seaport-gossip?branch=main
[license-badge]: https://img.shields.io/github/license/ProjectOpenSea/seaport-gossip
[license-link]: https://github.com/ProjectOpenSea/seaport-gossip/blob/main/LICENSE
[docs-badge]: https://img.shields.io/badge/Seaport%20Gossip-documentation-informational
[docs-link]: https://github.com/ProjectOpenSea/seaport-gossip/tree/main/docs
[discussions-badge]: https://img.shields.io/badge/Seaport%20Gossip-discussions-blueviolet
[discussions-link]: https://github.com/ProjectOpenSea/seaport-gossip/discussions
[discord-badge]: https://img.shields.io/static/v1?logo=discord&label=discord&message=Join&color=blue
[discord-link]: https://discord.gg/ADXcTXpqry
