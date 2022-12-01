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
      help: 'Number of orders ingested from the OpenSea API and successfully added to db',
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
    }),
    ordersReceived: new PromClient.Counter({
      name: 'total_orders_received',
      help: 'Total number of orders received through wire protocol message',
    }),
    ordersRequested: new PromClient.Counter({
      name: 'total_orders_requested',
      help: 'Total number of orders requested through wire protocol message',
    }),
    orderQueriesSent: new PromClient.Counter({
      name: 'total_order_queries_sent',
      help: 'Total number of order queries sent through wire protocol messages',
    }),
    orderQueriesReceived: new PromClient.Counter({
      name: 'total_order_queries_received',
      help: 'Total number of order queries received through wire protocol message',
    }),
    orderHashesSent: new PromClient.Counter({
      name: 'total_order_hashes_sent',
      help: 'Total number of order hashes sent through wire protocol messages',
    }),
    orderHashesReceived: new PromClient.Counter({
      name: 'total_order_hashes_received',
      help: 'Total number of order hashes received through wire protocol message',
    }),
    nodeStatsQueriesSent: new PromClient.Counter({
      name: 'total_node_stats_queries_sent',
      help: 'Total number of node stats queries sent through wire protocol message',
    }),
    nodeStatsQueriesReceived: new PromClient.Counter({
      name: 'total_node_stats_queries_received',
      help: 'Total number of node stats queries received through wire protocol message',
    }),
    orderValidationErrorsAndWarnings: new PromClient.Counter({
      name: 'order_errors_and_warnings',
      help: 'Order validation errors and warnings returned',
    }),
    seaportEvents: new PromClient.Counter({
      name: 'seaport_events',
      help: 'Seaport events observed',
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
    totalContentLookups: new PromClient.Gauge({
      name: 'total_content_lookups',
      help: 'Total number of content lookups initiated',
    }),
    successfulContentLookups: new PromClient.Counter({
      name: 'successful_content_lookups',
      help: 'Number of successful content lookups',
    }),
    failedContentLookups: new PromClient.Counter({
      name: 'failed_content_lookups',
      help: 'Number of failed content lookups',
    }),
    validOrdersReceived: new PromClient.Counter({
      name: 'total_valid_orders_received',
      help: 'Total number of valid orders received',
    }),
    invalidOrdersReceived: new PromClient.Counter({
      name: 'total_invalid_orders_received',
      help: 'Total number of invalid orders received',
    }),
    newOrdersReceived: new PromClient.Counter({
      name: 'total_new_orders_received',
      help: 'Total number of new orders received',
    }),
    acceptMessagesSent: new PromClient.Counter({
      name: 'total_accept_messages_sent',
      help: 'Total number of accept messages sent',
    }),
    acceptMessagesReceived: new PromClient.Counter({
      name: 'total_accept_messages_received',
      help: 'Total number of accept messages received',
    }),
    findContentMessagesSent: new PromClient.Counter({
      name: 'total_findContent_messages_sent',
      help: 'Total number of findContent messages sent',
    }),
    findContentMessagesReceived: new PromClient.Counter({
      name: 'total_findContent_messages_received',
      help: 'Total number of findContent messages received',
    }),
    contentMessagesSent: new PromClient.Counter({
      name: 'total_content_messages_sent',
      help: 'Total number of content messages sent',
    }),
    contentMessagesReceived: new PromClient.Counter({
      name: 'total_content_messages_received',
      help: 'Total number of content messages received',
    }),
    findNodesMessagesSent: new PromClient.Counter({
      name: 'total_findNodes_messages_sent',
      help: 'Total number of findNodes messages sent',
    }),
    findNodesMessagesReceived: new PromClient.Counter({
      name: 'total_findNodes_messages_received',
      help: 'Total number of findNodes messages received',
    }),
    nodesMessagesSent: new PromClient.Counter({
      name: 'total_nodes_messages_sent',
      help: 'Total number of nodes messages sent',
    }),
    nodesMessagesReceived: new PromClient.Counter({
      name: 'total_nodes_messages_received',
      help: 'Total number of nodes messages received',
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
