import PromClient from 'prom-client'

export const setupMetrics = () => {
  return {
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
    ordersSent: new PromClient.Counter({
      name: 'total_orders_sent',
      help: 'Total number of orders sent',
    }),
    ordersReceived: new PromClient.Counter({
      name: 'total_orders_received',
      help: 'Total number of orders received',
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
  }
}