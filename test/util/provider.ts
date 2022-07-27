import { ethers } from 'ethers'

export class MockProvider extends ethers.providers.BaseProvider {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async perform(method: string, params: any[]) {
    if (method === 'getBlockNumber') {
      return 1337
    }
    return super.perform(method, params)
  }
}
