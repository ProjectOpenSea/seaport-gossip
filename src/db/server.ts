import { createServer } from '@graphql-yoga/node'

import { schema } from './schema.js'

export const server = createServer({ schema })
