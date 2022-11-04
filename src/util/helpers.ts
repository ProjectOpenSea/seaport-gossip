import { Sema } from 'async-sema'
import { ethers } from 'ethers'

import type { OrderJSON } from './types.js'

/** The zero address */
export const zeroAddress = `0x${'0'.repeat(40)}`

/**
 * Truncate a string to 6 characters on each side.
 */
export const short = <T extends string | null | undefined>(str: T): T => {
  if (str === undefined || str === null || str.length <= 12) return str
  return `${str.slice(0, 6)}…${str.slice(str.length - 6, str.length)}` as T
}

/**
 * Returns whether the address is a valid ethereum address.
 */
export const isValidAddress = (address: string) => {
  // * is valid, meaning any address
  if (address === '*') return true

  return address[0] === '0' && address[1] === 'x' && address.length === 42
}

/**
 * Returns the current timestamp in resolution of seconds
 */
export const timestampNow = () => Math.round(Date.now() / 1000)

/**
 * Returns the max from a list of bigints
 */
export const bigIntMax = (...args: bigint[]) =>
  args.reduce((m, e) => (e > m ? e : m))

/**
 * Returns the min from a list of bigints
 */
export const bigIntMin = (...args: bigint[]) =>
  args.reduce((m, e) => (e < m ? e : m))

/**
 * Returns a 0x-prefixed string formatted to Buffer
 */
export const prefixedStrToBuf = (address: string) =>
  Buffer.from(address.slice(2), 'hex')

/**
 * Returns a Buffer formatted to 0x-prefixed string
 */
export const bufToPrefixedStr = (address: Buffer | Uint8Array) =>
  `0x${address.toString('hex')}`

/**
 * Modifies the order in-place to checksum the addresses.
 */
export const orderJSONToChecksummedAddresses = (order: OrderJSON) => {
  order.offerer = ethers.utils.getAddress(order.offerer)
  order.zone = ethers.utils.getAddress(order.zone)
  for (const item of [...order.offer, ...order.consideration]) {
    item.token = ethers.utils.getAddress(item.token)
  }
  for (const item of order.consideration) {
    item.recipient = ethers.utils.getAddress(item.recipient)
  }
  return order
}

/** Rate limiter from async-sema with an added AbortSignal */
/* eslint-disable-next-line @typescript-eslint/naming-convention */
export function RateLimit(
  rps: number,
  {
    timeUnit = 1000,
    uniformDistribution = false,
    signal = undefined,
  }: {
    timeUnit?: number
    uniformDistribution?: boolean
    signal?: AbortSignal
  } = {}
) {
  const sema = new Sema(uniformDistribution ? 1 : rps)
  const delay = uniformDistribution ? timeUnit / rps : timeUnit

  let running = true
  signal?.addEventListener('abort', async () => {
    running = false
    await sema.drain()
  })

  return async function rl() {
    if (!running) return
    await sema.acquire()
    setTimeout(() => sema.release(), delay)
  }
}
