import PromClient from 'prom-client'

import type { SeaportGossipNode } from '../node.js'

export type SeaportGossipMetrics = ReturnType<typeof setupMetrics>

export const setupMetrics = (node: SeaportGossipNode) => {
  return {
    ordersValidated: new PromClient.Counter({
      name: 'orders_validated',
      help: 'Number of orders returned as valid',
    }),
    ordersInvalidated: new PromClient.Counter({
      name: 'orders_invalidated',
      help: 'Number of orders returned as invalid',
    }),
    ordersAdded: new PromClient.Counter({
      name: 'orders_added',
      help: 'Number of orders added to the db',
      labelNames: ['source'],
    }),
    ordersDeleted: new PromClient.Counter({
      name: 'orders_deleted',
      help: 'Number of orders removed from the db',
    }),
    ordersStaleRevalidated: new PromClient.Counter({
      name: 'orders_stale_revalidated',
      help: 'Number of stale orders revalidated',
    }),
    ordersIngestedOpenSea: new PromClient.Counter({
      name: 'orders_ingested_opensea',
      help: 'Number of orders ingested from the OpenSea API',
      labelNames: ['addedToDB'],
    }),
    ordersTotalCount: new PromClient.Gauge({
      name: 'orders_total_count',
      help: 'Total number of orders stored in the db',
      async collect() {
        const count = await node.prisma.order.count()
        this.set(count)
      },
    }),
    ordersTotalCountValid: new PromClient.Gauge({
      name: 'orders_total_count_valid',
      help: 'Total number of valid orders stored in the db',
      async collect() {
        const count = await node.prisma.orderMetadata.count({
          where: { isValid: true },
        })
        this.set(count)
      },
    }),
    ordersTotalCountInvalid: new PromClient.Gauge({
      name: 'orders_total_count_invalid',
      help: 'Total number of invalid orders stored in the db',
      async collect() {
        const count = await node.prisma.orderMetadata.count({
          where: { isValid: false },
        })
        this.set(count)
      },
    }),
    ordersSent: new PromClient.Counter({
      name: 'total_orders_sent',
      help: 'Total number of orders sent through wire protocol messages',
      labelNames: ['peerId'],
    }),
    ordersReceived: new PromClient.Counter({
      name: 'total_orders_received',
      help: 'Total number of orders received through wire protocol message',
      labelNames: ['peerId'],
    }),
    ordersRequested: new PromClient.Counter({
      name: 'total_orders_requested',
      help: 'Total number of orders requested through wire protocol message',
      labelNames: ['peerId'],
    }),
    wireMessagesTotal: new PromClient.Counter({
      name: 'wire_messages_total',
      help: 'Total number of wire protocol messages sent',
      labelNames: ['name', 'peerId'],
    }),
    orderQueriesReceived: new PromClient.Counter({
      name: 'total_order_queries_received',
      help: 'Total number of order queries received through wire protocol message',
      labelNames: ['peerId'],
    }),
    orderHashesSent: new PromClient.Counter({
      name: 'total_order_hashes_sent',
      help: 'Total number of order hashes sent through wire protocol messages',
      labelNames: ['peerId'],
    }),
    orderHashesReceived: new PromClient.Counter({
      name: 'total_order_hashes_received',
      help: 'Total number of order hashes received through wire protocol message',
      labelNames: ['peerId'],
    }),
    nodeStatsQueriesSent: new PromClient.Counter({
      name: 'total_node_stats_queries_sent',
      help: 'Total number of node stats queries sent through wire protocol message',
      labelNames: ['peerId'],
    }),
    nodeStatsQueriesReceived: new PromClient.Counter({
      name: 'total_node_stats_queries_received',
      help: 'Total number of node stats queries received through wire protocol message',
      labelNames: ['peerId'],
    }),
    orderValidationErrorsAndWarnings: new PromClient.Counter({
      name: 'order_errors_and_warnings',
      help: 'Order validation errors and warnings returned',
      labelNames: ['issue'],
    }),
    seaportEvents: new PromClient.Counter({
      name: 'seaport_events',
      help: 'Seaport events observed',
      labelNames: ['event'],
    }),
    chainHeight: new PromClient.Gauge({
      name: 'chain_height',
      help: 'The current height of the canonical chain',
    }),
    ethProviderRequests: new PromClient.Counter({
      name: 'eth_provider_requests',
      help: 'Ethereum provider requests made',
      labelNames: ['method'],
    }),
    ethProviderResponses: new PromClient.Counter({
      name: 'eth_provider_responses',
      help: 'Ethereum provider responses returned',
      labelNames: ['method', 'error'],
    }),
    ethProviderResponseTimeMilliseconds: new PromClient.Histogram({
      name: 'eth_provider_response_time_milliseconds',
      help: 'Ethereum provider response time in milliseconds',
      labelNames: ['method'],
    }),
    /*
    totalKnownPeers: new PromClient.Gauge({
      name: 'total_known_peers',
      help: 'Total number of peers in the routing table',
    }),
    activePeers: new PromClient.Gauge({
      name: 'current_active_peers',
      help: 'Number of peers actively connected to',
    }),
    inactivePeers: new PromClient.Gauge({
      name: 'total_inactive_peers',
      help: 'Total number of peers disconnected from due to inactivity',
    }),
    totalBytesReceived: new PromClient.Counter({
      name: 'total_bytes_received',
      help: 'Total number of bytes received from peers',
    }),
    totalBytesSent: new PromClient.Counter({
      name: 'total_bytes_sent',
      help: 'Total number of bytes sent to peers',
    }),
    currentDBSize: new PromClient.Gauge({
      name: 'current_db_size',
      help: 'Total number of MBs stored in the db',
    }),
    */
  }
}
