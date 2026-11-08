import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { attachMatchmaking } from './matchmaking.js'

const port = Number(process.env.PORT || 4001)
const httpServer = createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
  response.end('Darts Room random matchmaking server')
})
const io = new Server(httpServer, { cors: { origin: '*' } })
attachMatchmaking(io)

httpServer.listen(port, '0.0.0.0', () => console.log(`Random matchmaking server listening on :${port}`))
