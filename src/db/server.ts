import { createServer } from '@graphql-yoga/node'
import { PrismaClient } from '@prisma/client'

import { schema } from './schema.js'

const devLogging = { debug: () => true, error: console.error, info: () => true, warn: console.warn }
const prodLogging = { debug: console.debug, error: console.error, info: console.info, warn: console.warn }
const logging = process.env.NODE_ENV === 'development' ? devLogging : prodLogging

const prisma = new PrismaClient()

export const server = createServer({ schema, logging, context: { prisma } })
