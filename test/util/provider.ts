import { BigNumber, ethers } from 'ethers'

export class MockProvider extends ethers.providers.BaseProvider {
  public async perform(method: string, params: any) {
    if (method === 'getBlockNumber') {
      return 1337
    }
    if (method === 'call') {
      const contractMethod = params.transaction.data.slice(0, 10)
      if (contractMethod === '0x46423aa7') {
        // 0x46423aa7: getOrderStatus(bytes32)
        return '0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'
      } else if (contractMethod === '0x4534fe04') {
        // 0x46423aa7: isValidOrderWithConfiguration
        if (params.transaction.data.includes('3f5308') === true) {
          // 3f5308: part of a token address of an invalid order in basic-invalid.json
          const withErrorsNoWarnings =
            '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000044c00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000386'
          return withErrorsNoWarnings
        }
        const noErrorsNoWarnings =
          '0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'
        return noErrorsNoWarnings
      }
      return '0x'
    }
    return super.perform(method, params)
  }

  public async detectNetwork() {
    return {
      chainId: 1,
      ensAddress: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
      name: 'homestead',
    }
  }

  public async getCode(..._args: any[]) {
    return '0x'
  }

  public async getBlock(..._args: any[]) {
    return {
      transactions: [],
      hash: ethers.constants.HashZero,
      parentHash: ethers.constants.HashZero,
      number: 1337,
      timestamp: 12345,
      nonce: '0x00',
      difficulty: 0,
      _difficulty: BigNumber.from(0),
      gasLimit: BigNumber.from(0),
      gasUsed: BigNumber.from(0),
      miner: ethers.constants.AddressZero,
      extraData: '',
      baseFeePerGas: BigNumber.from(7),
    }
  }
}
