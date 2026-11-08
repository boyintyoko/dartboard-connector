import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { io as createClient } from 'socket.io-client'
import { attachMatchmaking } from '../matchmaking.js'

const httpServer = createServer()
const server = new Server(httpServer, { transports: ['websocket'] })
attachMatchmaking(server)
await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve))
const address = httpServer.address()
const url = `http://127.0.0.1:${address.port}`
const clients = []

function client() {
  const socket = createClient(url, { transports: ['websocket'], forceNew: true })
  clients.push(socket)
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket))
    socket.once('connect_error', reject)
  })
}

function matched(socket, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for match: ${label}`)), 2000)
    socket.once('match:found', match => { clearTimeout(timer); resolve(match) })
  })
}

try {
  const one = await client()
  const cricket = await client()
  one.emit('queue:join', { mode: '01' })
  cricket.emit('queue:join', { mode: 'cricket' })
  let unexpectedMatch = false
  one.once('match:found', () => { unexpectedMatch = true })
  await new Promise(resolve => setTimeout(resolve, 100))
  assert.equal(unexpectedMatch, false, 'different fixed preferences must remain in separate queues')

  const oneAgain = matched(one, 'first 01 client')
  const oneOpponent = matched(one, 'first 01 client duplicate listener')
  const third = await client()
  const thirdFound = matched(third, 'third 01 client')
  third.emit('queue:join', { mode: '01' })
  const [oneMatch, opponentMatch, thirdMatch] = await Promise.all([oneAgain, oneOpponent, thirdFound])
  assert.equal(oneMatch.mode, '01')
  assert.equal(opponentMatch.mode, '01')
  assert.equal(thirdMatch.mode, '01')
  assert.equal(oneMatch.room, thirdMatch.room)
  cricket.emit('queue:leave')

  const random = await client()
  const cricketAgain = await client()
  const randomFound = matched(random, 'random client')
  const cricketFound = matched(cricketAgain, 'cricket client')
  random.emit('queue:join', { mode: 'random' })
  cricketAgain.emit('queue:join', { mode: 'cricket' })
  const [randomMatch, cricketMatch] = await Promise.all([randomFound, cricketFound])
  assert.equal(randomMatch.mode, 'cricket', 'RANDOM should accept the opponent’s fixed mode')
  assert.equal(cricketMatch.mode, 'cricket')
  assert.equal(randomMatch.room, cricketMatch.room)
  const relayedCandidate = new Promise(resolve => cricketAgain.once('match:signal', resolve))
  random.emit('match:signal', { type: 'candidate', candidate: { candidate: 'candidate:relay-test', sdpMid: '0', sdpMLineIndex: 0 } })
  assert.deepEqual(await relayedCandidate, { type: 'candidate', candidate: { candidate: 'candidate:relay-test', sdpMid: '0', sdpMLineIndex: 0 } })
  console.log('Matchmaking modes and WebRTC signaling passed')
} finally {
  for (const socket of clients) socket.disconnect()
  await new Promise(resolve => server.close(resolve))
}
