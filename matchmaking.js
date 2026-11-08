export function attachMatchmaking(io) {
  const queue = []
  const matches = new Map()
  const modes = ['01', 'cricket', 'match']

  function removeFromQueue(id) {
    const index = queue.findIndex(entry => entry.id === id)
    if (index !== -1) queue.splice(index, 1)
  }

  function tryMatch() {
    for (const entry of [...queue]) {
      if (!io.sockets.sockets.get(entry.id)?.connected) removeFromQueue(entry.id)
    }
    while (queue.length >= 2) {
      let pair
      for (let firstIndex = 0; firstIndex < queue.length && !pair; firstIndex++) {
        for (let secondIndex = firstIndex + 1; secondIndex < queue.length; secondIndex++) {
          const firstPreference = queue[firstIndex].mode
          const secondPreference = queue[secondIndex].mode
          if (firstPreference === 'random' || secondPreference === 'random' || firstPreference === secondPreference) {
            pair = [firstIndex, secondIndex]
            break
          }
        }
      }
      if (!pair) return
      const [firstIndex, secondIndex] = pair
      const [firstEntry, secondEntry] = [queue[firstIndex], queue[secondIndex]]
      queue.splice(secondIndex, 1)
      queue.splice(firstIndex, 1)
      const first = io.sockets.sockets.get(firstEntry.id)
      const second = io.sockets.sockets.get(secondEntry.id)
      if (!first?.connected || !second?.connected) continue
      const players = Math.random() < 0.5 ? [first, second] : [second, first]
      const room = `match-${players.map(player => player.id).join('-')}`
      const preferredMode = firstEntry.mode === 'random' ? secondEntry.mode : firstEntry.mode
      const mode = preferredMode === 'random' ? modes[Math.floor(Math.random() * modes.length)] : preferredMode
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
    socket.on('queue:join', preference => {
      if (socket.data.matchRoom || queue.some(entry => entry.id === socket.id)) return
      const mode = ['01', 'cricket', 'match', 'random'].includes(preference?.mode) ? preference.mode : 'random'
      queue.push({ id: socket.id, mode })
      socket.emit('queue:waiting', { mode })
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
