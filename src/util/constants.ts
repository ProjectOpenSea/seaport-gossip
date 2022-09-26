import { multiaddr } from '@multiformats/multiaddr'

import type { Multiaddr } from '@multiformats/multiaddr'

/** The default Seaport address */
export const DEFAULT_SEAPORT_ADDRESS =
  '0x00000000006c3852cbEf3e08E8dF289169EdE581'

/** OpenSea's Fee Recipient address, for validating valid OpenSea Seaport orders */
export const OPENSEA_FEE_RECIPIENT =
  '0x0000a26b00c1F0DF003000390027140000fAa719'

/**
 * OpenSea bootstrap signaling servers
 */
export const openseaBootstrapNodes: {
  [chainId: string]: [peerId: string, multiaddr: Multiaddr]
} = {
  ['1']: [
    'Qm...',
    multiaddr('/dnsaddr/eth-mainnet.bootstrap.seaport.opensea.io'),
  ],
  ['5']: [
    'Qm...',
    multiaddr('/dnsaddr/eth-goerli.bootstrap.seaport.opensea.io'),
  ],
  ['10']: [
    'Qm...',
    multiaddr('/dnsaddr/optimism-mainnet.bootstrap.seaport.opensea.io'),
  ],
  ['420']: [
    'Qm...',
    multiaddr('/dnsaddr/optimism-goerli.bootstrap.seaport.opensea.io'),
  ],
  ['137']: [
    'Qm...',
    multiaddr('/dnsaddr/polygon-mainnet.bootstrap.seaport.opensea.io'),
  ],
  ['80001']: [
    'Qm...',
    multiaddr('/dnsaddr/polygon-mumbai.bootstrap.seaport.opensea.io'),
  ],
}

/** The `protocolVersion` for the `identify` protocol. */
export const protocolVersion = '/seaport/0.1.0'

/**
 * The `agentVersion` for the `identify` protocol.
 * The usual format is agent-name/version, where agent-name is
 * the name of the program or library and version is its semantic version.
 */
export const agentVersion = 'seaport-gossip/0.0.1'

/** The list of protocols supported by the client for the `identify` protocol. */
export const protocols = ['seaport']
