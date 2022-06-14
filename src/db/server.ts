import { createServer } from '@graphql-yoga/node'

import { schema } from './schema.js'

// Create the server
const server = createServer({ schema })

// Start the server at http://localhost:4000/graphql
await server.start()
