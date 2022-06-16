// eslint-disable-next-line import/no-extraneous-dependencies
import { createServer } from '@graphql-yoga/common' 
import { expect } from 'chai'

import { schema } from '../dist/db/schema.js'

describe('Server', () => {
  it('should return a valid response', async () =>  {
    const server = createServer({})
   
    const { response, executionResult } = await server.inject({
      document: '{ greetings }',
    })
     
    expect(response.status).to.equal(200)
    expect(
      executionResult?.data.greetings).to.equal('This is the `greetings` field of the root `Query` type')
    // server.stop()  
  })    

  it.skip('should return a valid response', async () =>  {
    const server = createServer({ schema })

    const { response, executionResult } = await server.inject({
      document: '{ orders }',
    })

    expect(response.status).to.equal(200)
    expect(
      executionResult?.data.orders).to.deep.eq([])
    // server.stop()  
  })
})