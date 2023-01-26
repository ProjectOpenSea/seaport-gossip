import 'reflect-metadata'
import { buildSchema } from 'type-graphql'

import { resolvers } from '../../node_modules/@generated/type-graphql/index.js'

export const schema = await buildSchema({
  resolvers,
  emitSchemaFile: true,
})
