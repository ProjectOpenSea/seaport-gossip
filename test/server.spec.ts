// eslint-disable-next-line import/no-extraneous-dependencies
import { createServer } from '@graphql-yoga/common' 
import { expect } from 'chai'

import { server } from '../dist/db/index.js'

describe('Server', () => {
  it('should return a valid response', async () =>  {
    const defaultServer = createServer({})
   
    const { response, executionResult } = await defaultServer.inject({
      document: '{ greetings }',
    })
     
    expect(response.status).to.equal(200)
    expect(
      executionResult?.data.greetings).to.equal('This is the `greetings` field of the root `Query` type')
  })    

  it('should return a valid response', async () =>  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query = { document: '{ orders { hash } }' } as any
    const { response, executionResult } = await server.inject(query)

    expect(response.status).to.equal(200)
    expect(executionResult?.data.orders.length).to.eq(0)
  })
})