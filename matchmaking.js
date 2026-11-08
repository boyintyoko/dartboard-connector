export function attachMatchmaking(io) {
  const queue = []
  const matches = new Map()
  const modes = ['01', 'cricket', 'match']
  const defaultIceServers = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }]
  let cachedIceServers = null
  let cachedIceServersUntil = 0
  let iceServersRequest = null

  function parseIceServers(value) {
    try {
      const configured = typeof value === 'string' ? JSON.parse(value) : value
      if (Array.isArray(configured) && configured.length > 0 && configured.length <= 16 && configured.every(server => {
        const urls = typeof server?.urls === 'string' ? [server.urls] : server?.urls
        return Array.isArray(urls) && urls.length > 0 && urls.every(url => typeof url === 'string' && /^(stun|stuns|turn|turns):/i.test(url) && url.length <= 512)
          && (server.username === undefined || typeof server.username === 'string')
          && (server.credential === undefined || typeof server.credential === 'string')
      })) return configured
    } catch { /* Fall back to public STUN servers when no TURN service is configured. */ }
    return null
  }

  async function getIceServers() {
    const directConfig = parseIceServers(process.env.WEBRTC_ICE_SERVERS)
    if (directConfig) return { iceServers: directConfig }
    const endpoint = process.env.WEBRTC_TURN_CREDENTIALS_URL
    if (!endpoint) return { iceServers: defaultIceServers }
    try { if (new URL(endpoint).protocol !== 'https:') return { iceServers: defaultIceServers } } catch { return { iceServers: defaultIceServers } }
    if (cachedIceServers && Date.now() < cachedIceServersUntil) return { iceServers: cachedIceServers }
    if (!iceServersRequest) {
      iceServersRequest = (async () => {
        const response = await fetch(endpoint, { signal: AbortSignal.timeout(5000) })
        if (!response.ok) throw new Error(`TURN credentials endpoint returned ${response.status}`)
        const parsed = parseIceServers(await response.json())
        if (!parsed) throw new Error('TURN credentials response did not contain valid ICE servers')
        cachedIceServers = parsed
        cachedIceServersUntil = Date.now() + 60_000
        return parsed
      })().catch(() => null).finally(() => { iceServersRequest = null })
    }
    return { iceServers: await iceServersRequest || defaultIceServers }
  }

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
    socket.on('match:ice-servers', acknowledge => {
      const room = socket.data.matchRoom
      if (!room || !matches.get(room)?.ids.includes(socket.id) || typeof acknowledge !== 'function') return
      void getIceServers().then(config => acknowledge(config))
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
    socket.on('match:signal', signal => {
      const room = socket.data.matchRoom
      const match = room && matches.get(room)
      if (!match || !match.ids.includes(socket.id) || !signal || typeof signal !== 'object') return
      if (signal.type === 'offer' || signal.type === 'answer') {
        if (!signal.description || signal.description.type !== signal.type || typeof signal.description.sdp !== 'string' || signal.description.sdp.length > 100_000) return
      } else if (signal.type === 'candidate') {
        if (!signal.candidate || typeof signal.candidate.candidate !== 'string' || signal.candidate.candidate.length > 4_096) return
      } else return
      socket.to(room).emit('match:signal', signal)
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
