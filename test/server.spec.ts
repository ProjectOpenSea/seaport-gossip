// eslint-disable-next-line import/no-extraneous-dependencies
import { createServer } from '@graphql-yoga/common' 
import { expect } from 'chai'

describe('Server', () => {
  it('should return a valid response', async () =>  {
    const yoga = createServer()

    const { response, executionResult } = await yoga.inject({
      document: '{ greetings }',
    })

    expect(response.status).to.equal(200)
    expect(
      executionResult?.data.greetings).to.equal('This is the `greetings` field of the root `Query` type')
  })
})