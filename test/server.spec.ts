// eslint-disable-next-line import/no-extraneous-dependencies
import { expect } from 'chai'
import { createSchema, createYoga } from 'graphql-yoga'
import { createServer } from 'node:http'

import { initYoga } from '../src/db/index.js'

describe('Server', () => {
  it('manual creation - should return a valid response', async () => {
    const schema = createSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          hello: String
        }
      `,
      resolvers: {
        Query: {
          hello: () => 'world',
        },
      },
    })
    const yoga = createYoga({ schema })
    const server = createServer(yoga)
    const port = 4001
    server.listen(port)

    const response = await yoga.fetch(`http://localhost:${port}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: 'query { hello }',
      }),
    })
    const executionResult = await response.json()

    expect(response.status).to.equal(200)
    expect(executionResult.data.hello).to.equal('world')
    server.closeAllConnections()
    server.close()
  })

  it('using init function - should return a valid response', async () => {
    const yoga = initYoga()
    yoga.start()

    const response = await yoga.instance.fetch(
      'http://localhost:4000/graphql',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: 'query { orders { hash } }',
        }),
      }
    )
    const executionResult = await response.json()

    expect(response.status).to.equal(200)
    expect(executionResult.data.orders.length).to.eq(0)
    yoga.stop()
  })
})
