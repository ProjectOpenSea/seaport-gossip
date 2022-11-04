import { SeaportGossipNode } from '../index.js'

console.log('Starting node...')
const node = new SeaportGossipNode()
await node.start()

process.on('exit', async function (code) {
  console.log(`Stopping node (exit code ${code})...`)
  await node.stop()
})
