import { PrismaClient } from '@prisma/client'
import { createYoga } from 'graphql-yoga'
import { createServer } from 'node:http'

import { createWinstonLogger } from '../util/log.js'

import { schema } from './schema.js'

import type winston from 'winston'

export type Yoga = ReturnType<typeof initYoga>

const yogaLogger = (logger: winston.Logger) => ({
  debug: logger.debug.bind(logger),
  error: logger.error.bind(logger),
  info: logger.info.bind(logger),
  warn: logger.warn.bind(logger),
})

export const initYoga = (
  opts = {
    prisma: new PrismaClient(),
    port: 4000,
    logger: createWinstonLogger(),
  }
) => {
  const { prisma, port, logger } = opts
  const logging = yogaLogger(logger)

  const yogaInstance = createYoga({ schema, logging, context: { prisma } })
  const server = createServer(yogaInstance)

  const start = () => {
    server.listen(port, () => {
      logger.info(
        `GraphQL server is running on http://localhost:${port}/graphql`
      )
    })
  }

  const stop = () => {
    server.closeAllConnections()
    server.close()
  }

  return { instance: yogaInstance, start, stop }
}
