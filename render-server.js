import { createServer } from 'node:http'
import next from 'next'
import { Server } from 'socket.io'
import { attachMatchmaking } from './matchmaking.js'

const dev = process.env.NODE_ENV !== 'production'
const port = Number(process.env.PORT || 3000)
const app = next({ dev, dir: 'example' })
const handle = app.getRequestHandler()

await app.prepare()
const httpServer = createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('hello')
    return
  }
  handle(request, response)
})
const io = new Server(httpServer, { cors: { origin: true } })
attachMatchmaking(io)

httpServer.listen(port, '0.0.0.0', () => console.log(`Darts Room listening on :${port}`))
