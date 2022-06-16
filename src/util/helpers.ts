import { Order } from '../types.js'

export const orderHash = async (_order: Order) => {
  return '0x123'
}

export const isValidAddress = (address: string) => {
  return address[0] === '0' && address[1] === 'x' && address.length === 42
}