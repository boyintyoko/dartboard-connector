export function attachMatchmaking(io) {
  const queue = []
  const matches = new Map()
  const modes = ['01', 'cricket', 'match']

  function removeFromQueue(id) {
    const index = queue.indexOf(id)
    if (index !== -1) queue.splice(index, 1)
  }

  function tryMatch() {
    while (queue.length >= 2) {
      const first = io.sockets.sockets.get(queue.shift())
      const second = io.sockets.sockets.get(queue.shift())
      if (!first?.connected || !second?.connected) {
        if (first?.connected) queue.unshift(first.id)
        if (second?.connected) queue.unshift(second.id)
        continue
      }
      const players = Math.random() < 0.5 ? [first, second] : [second, first]
      const room = `match-${players.map(player => player.id).join('-')}`
      const mode = modes[Math.floor(Math.random() * modes.length)]
      matches.set(room, { host: players[0].id, ids: players.map(player => player.id) })
      players.forEach((player, seat) => {
        player.join(room)
        player.data.matchRoom = room
        player.data.seat = seat
        player.emit('match:found', { room, seat, mode, players: ['PLAYER 1', 'PLAYER 2'] })
      })
    }
  }

  io.on('connection', socket => {
    socket.on('queue:join', () => {
      if (socket.data.matchRoom || queue.includes(socket.id)) return
      queue.push(socket.id)
      socket.emit('queue:waiting')
      tryMatch()
    })
    socket.on('queue:leave', () => {
      removeFromQueue(socket.id)
      socket.emit('queue:left')
    })
    socket.on('match:state', state => {
      const room = socket.data.matchRoom
      const match = room && matches.get(room)
      if (match?.host === socket.id) socket.to(room).emit('match:state', state)
    })
    socket.on('match:action', action => {
      const room = socket.data.matchRoom
      const match = room && matches.get(room)
      if (match && match.ids.includes(socket.id) && match.host !== socket.id) {
        io.to(match.host).emit('match:action', { ...action, seat: socket.data.seat })
      }
    })
    socket.on('disconnect', () => {
      removeFromQueue(socket.id)
      const room = socket.data.matchRoom
      const match = room && matches.get(room)
      if (match) {
        socket.to(room).emit('match:opponent-left')
        matches.delete(room)
        for (const id of match.ids) {
          const player = io.sockets.sockets.get(id)
          if (player) { player.leave(room); delete player.data.matchRoom; delete player.data.seat }
        }
      }
      tryMatch()
    })
  })
}
