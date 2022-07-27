import { createServer } from '@graphql-yoga/node'
import { PrismaClient } from '@prisma/client'

import { createWinstonLogger } from '../util/log.js'

import { schema } from './schema.js'

import type winston from 'winston'

const prisma = new PrismaClient()

const yogaLogger = (logger: winston.Logger) => ({
  debug: logger.debug.bind(logger),
  error: logger.error.bind(logger),
  info: logger.info.bind(logger),
  warn: logger.warn.bind(logger),
})

export const startGraphqlServer = (
  opts = { port: 4000, logger: createWinstonLogger() }
) => {
  const { port, logger } = opts
  const logging = yogaLogger(logger)
  return createServer({ schema, logging, context: { prisma }, port })
}
