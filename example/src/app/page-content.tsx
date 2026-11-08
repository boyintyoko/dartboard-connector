"use client"

import { DARTSLIVEHomeConnector } from '@minimalcorp/dartboard-connector/dartslive-home'
import { io, type Socket } from 'socket.io-client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { receiveBoardSignal, type BoardSignal } from '../lib/board-input'
import { chooseMatchFirst, chooseMatchGame, createGame, isX01Game, label, nextTurn, resolveCork, resolveMatchCoinToss, targets, throwCork, throwDart, type Game, type Hit, type MatchLeadRule, type Mode, type OutRule } from '../lib/game'

const modes: { id: Mode; title: string; subtitle: string; icon: string; accent: string }[] = [
  { id: '01', title: '01', subtitle: 'ゼロを目指して対戦', icon: '01', accent: 'red' },
  { id: 'cricket', title: 'CRICKET', subtitle: 'ナンバーを閉じて競う', icon: '⊗', accent: 'blue' },
  { id: 'practice', title: 'PRACTICE', subtitle: '狙ったナンバーを練習', icon: '⌃', accent: 'green' },
  { id: 'match', title: 'MATCH', subtitle: '01・CR・CHのメドレー', icon: '☆', accent: 'orange' },
  { id: 'robo', title: 'ROBO MATCH', subtitle: 'CPUと対戦', icon: '♙', accent: 'purple' },
]
const numbers = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]
type MatchSignal = { type: 'offer' | 'answer'; description: RTCSessionDescriptionInit } | { type: 'candidate'; candidate: RTCIceCandidateInit }

function GameResults({ game }: { game: Game }) {
  const cricket = game.mode === 'cricket' || game.mode === 'match' && game.legMode === 'cricket'
  const practice = game.mode === 'practice'
  const match = game.mode === 'match' && game.match
  const closedTargets = (player: Game['players'][number]) => targets.filter(target => (player.marks[target] || 0) >= 3).length
  return <section className="results-panel" aria-label="ゲーム結果">
    <header className="results-heading"><div className="kicker">FINAL RESULTS</div><h2>{game.winner === null ? 'DRAW' : `${game.players[game.winner].name} WIN`}</h2>{match && <p>LEG WINS <strong>{match.legWins[0]} — {match.legWins[1]}</strong><small> · FINAL LEG</small></p>}</header>
    <div className="results-players">{game.players.map((player, index) => <article className={`result-player ${game.winner === index ? 'winner' : ''}`} key={index}>
      <div className="result-player-heading"><span>P{index + 1}</span><strong>{player.name}</strong><em>{game.winner === index ? 'WINNER' : game.winner === null ? 'DRAW' : 'FINISH'}</em></div>
      <div className="result-main-score"><small>{practice ? 'TARGET HITS' : cricket ? game.players.length === 1 ? 'TARGETS CLOSED' : 'CRICKET SCORE' : match ? 'FINAL LEG · REMAINING' : 'REMAINING SCORE'}</small><b>{practice ? `${game.practiceHits} / ${player.darts}` : cricket && game.players.length === 1 ? `${closedTargets(player)} / ${targets.length}` : player.score}</b></div>
      <div className="result-stats">
        <div><small>{match ? 'DARTS · FINAL LEG' : 'DARTS THROWN'}</small><strong>{player.darts}</strong></div>
        {cricket ? <><div><small>TARGETS CLOSED</small><strong>{closedTargets(player)} / {targets.length}</strong></div><div><small>TOTAL MARKS</small><strong>{targets.reduce((sum, target) => sum + (player.marks[target] || 0), 0)}</strong></div>{game.players.length > 1 && <div><small>CRICKET POINTS</small><strong>{player.score}</strong></div>}</> : practice ? <div><small>HIT RATE</small><strong>{player.darts ? `${Math.round(game.practiceHits / player.darts * 100)}%` : '—'}</strong></div> : <><div><small>POINTS SCORED</small><strong>{player.points}</strong></div><div><small>PPD</small><strong>{player.darts ? (player.points / player.darts).toFixed(1) : '—'}</strong></div>{match && <div><small>MATCH LEGS</small><strong>{match.legWins[index]}</strong></div>}</>}
      </div>
    </article>)}</div>
  </section>
}

function Board({ onHit, disabled, darts = [] }: { onHit: (hit: Hit) => void; disabled: boolean; darts?: Hit[] }) {
  const xy = (r: number, a: number) => `${200 + r * Math.sin(a)},${200 - r * Math.cos(a)}`
  const dartPosition = (hit: Hit, dartIndex: number) => {
    if (hit.base === 25) {
      const angle = (dartIndex * 137.5 - 35) * Math.PI / 180
      return { x: 200 + (hit.ratio === 2 ? 4 : 12) * Math.cos(angle), y: 200 + (hit.ratio === 2 ? 4 : 12) * Math.sin(angle) }
    }
    const segment = numbers.indexOf(hit.base)
    if (segment < 0) {
      const angle = (dartIndex * 137.5 + 20) * Math.PI / 180
      return { x: 200 + 177 * Math.cos(angle), y: 200 + 177 * Math.sin(angle) }
    }
    const angle = (segment * 18 + (dartIndex % 3 - 1) * 4.8) * Math.PI / 180
    const radii: Record<number, [number, number]> = { 1: [38, 79], 2: [153, 160], 3: [96, 101] }
    const [inner, outer] = radii[hit.ratio] || [112, 144]
    const radius = inner + (outer - inner) * (0.3 + (dartIndex % 2) * 0.35)
    return { x: 200 + radius * Math.sin(angle), y: 200 - radius * Math.cos(angle) }
  }
  const handleKey = (e: React.KeyboardEvent<SVGElement>, hit: Hit) => {
    if (disabled || !['Enter', ' '].includes(e.key)) return
    e.preventDefault(); onHit(hit)
  }
  return <svg viewBox="0 0 400 400" className="board" aria-label="ダーツボード入力">
    <circle cx="200" cy="200" r="198" fill="#101722" />
    {numbers.map((n, i) => {
      const a = (i * 18 - 9) * Math.PI / 180, b = (i * 18 + 9) * Math.PI / 180
      return <g key={n}>
        {[[16, 92, 1], [92, 104, 3], [104, 150, 1], [150, 164, 2]].map(([inner, outer, ratio], j) => {
          const hit = { base: n, ratio }
          return <path key={j} role="button" tabIndex={disabled ? -1 : 0} aria-label={`${label(hit)}`} onClick={() => !disabled && onHit(hit)} onKeyDown={e => handleKey(e, hit)} d={`M ${xy(inner, a)} L ${xy(outer, a)} A ${outer} ${outer} 0 0 1 ${xy(outer, b)} L ${xy(inner, b)} A ${inner} ${inner} 0 0 0 ${xy(inner, a)}`} fill={ratio === 1 ? (i % 2 ? '#d8d7d0' : '#25303e') : (i % 2 ? '#30b8a1' : '#ec6672')} stroke="#0b111a" strokeWidth="1.5" />
        })}
        <text x={200 + 181 * Math.sin(i * Math.PI / 10)} y={205 - 181 * Math.cos(i * Math.PI / 10)} textAnchor="middle" fill="#e3e9ed" fontSize="15">{n}</text>
      </g>
    })}
    {[{ r: 16, ratio: 1, color: '#30b8a1' }, { r: 8, ratio: 2, color: '#ec6672' }].map(b => <circle key={b.ratio} cx="200" cy="200" r={b.r} fill={b.color} role="button" tabIndex={disabled ? -1 : 0} aria-label={b.ratio === 1 ? 'S-BULL' : 'D-BULL'} onClick={() => !disabled && onHit({ base: 25, ratio: b.ratio })} onKeyDown={e => handleKey(e, { base: 25, ratio: b.ratio })} />)}
    {darts.map((hit, index) => {
      const point = dartPosition(hit, index)
      const angle = (index * 37 - 132) * Math.PI / 180
      const vx = Math.cos(angle), vy = Math.sin(angle), px = -vy, py = vx
      const pointAt = (distance: number, side = 0) => ({ x: point.x + vx * distance + px * side, y: point.y + vy * distance + py * side })
      const at = (distance: number, side = 0) => { const p = pointAt(distance, side); return `${p.x},${p.y}` }
      const barrelStart = pointAt(2), barrelEnd = pointAt(10)
      const flight = index % 2 ? '#f16b73' : '#69b8ed'
      return <g key={`${index}-${hit.base}-${hit.ratio}`} className="board-dart" aria-label={`${label(hit)} のダーツ`}>
        <line x1={point.x + vx * 2} y1={point.y + vy * 2} x2={point.x + vx * 38} y2={point.y + vy * 38} stroke="#02050a" strokeWidth="8" strokeLinecap="round" opacity=".82" />
        <line x1={barrelStart.x} y1={barrelStart.y} x2={barrelEnd.x} y2={barrelEnd.y} stroke="#f2c777" strokeWidth="4.5" strokeLinecap="round" />
        <line x1={pointAt(3, 0.7).x} y1={pointAt(3, 0.7).y} x2={barrelEnd.x} y2={barrelEnd.y} stroke="#fff0c9" strokeWidth="1" strokeLinecap="round" opacity=".8" />
        <line x1={point.x + vx * 10} y1={point.y + vy * 10} x2={point.x + vx * 38} y2={point.y + vy * 38} stroke="#dce5ed" strokeWidth="3" strokeLinecap="round" />
        <line x1={point.x + vx * 13 + px * 1.4} y1={point.y + vy * 13 + py * 1.4} x2={point.x + vx * 15 + px * 1.4} y2={point.y + vy * 15 + py * 1.4} stroke="#8594a3" strokeWidth="1" />
        <line x1={point.x + vx * 17 - px * 1.4} y1={point.y + vy * 17 - py * 1.4} x2={point.x + vx * 19 - px * 1.4} y2={point.y + vy * 19 - py * 1.4} stroke="#8594a3" strokeWidth="1" />
        <path d={`M ${at(31, -1)} L ${at(45, -13)} L ${at(55, -8)} L ${at(38, 2)} Z`} fill={flight} stroke="#101722" strokeWidth="1.8" />
        <path d={`M ${at(31, 1)} L ${at(45, 13)} L ${at(55, 8)} L ${at(38, -2)} Z`} fill={flight} stroke="#101722" strokeWidth="1.8" />
        <path d={`M ${at(38, -6)} L ${at(51, 0)} L ${at(38, 6)} Z`} fill="#dce5ed" stroke="#101722" strokeWidth="1.4" />
        <circle cx={point.x} cy={point.y} r="3.6" fill="#fff9e8" stroke="#17212d" strokeWidth="1.6" />
        <title>{label(hit)}</title>
      </g>
    })}
  </svg>
}

export const Example = () => {
  const connector = useRef<DARTSLIVEHomeConnector | null>(null)
  const unsubscribe = useRef<(() => void) | null>(null)
  const audio = useRef<AudioContext | null>(null)
  const onlineSocket = useRef<Socket | null>(null)
  const onlineSeatRef = useRef<number | null>(null)
  const peerConnection = useRef<RTCPeerConnection | null>(null)
  const peerConnectionPending = useRef<Promise<RTCPeerConnection> | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([])
  const localVideo = useRef<HTMLVideoElement | null>(null)
  const remoteVideo = useRef<HTMLVideoElement | null>(null)
  const [screen, setScreen] = useState<'home' | 'setup' | 'game'>('home')
  const [mode, setMode] = useState<Mode>('01')
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')
  const [count, setCount] = useState(2)
  const [names, setNames] = useState(['PLAYER 1', 'PLAYER 2', 'PLAYER 3', 'PLAYER 4'])
  const [initial, setInitial] = useState(501)
  const [outRule, setOutRule] = useState<OutRule>('master')
  const [matchBestOf, setMatchBestOf] = useState<3 | 5>(3)
  const [matchLeadRule, setMatchLeadRule] = useState<MatchLeadRule>('loser')
  const [bull, setBull] = useState<'fat' | 'split'>('fat')
  const [practiceTarget, setPracticeTarget] = useState(20)
  const [difficulty, setDifficulty] = useState<'EASY' | 'NORMAL' | 'HARD'>('NORMAL')
  const [sound, setSound] = useState(true)
  const [manual, setManual] = useState(false)
  const [game, setGame] = useState<Game | null>(null)
  const [history, setHistory] = useState<Game[]>([])
  const [lastInput, setLastInput] = useState('')
  const [onlineStatus, setOnlineStatus] = useState<'offline' | 'connecting' | 'searching' | 'matched'>('offline')
  const [onlineMode, setOnlineMode] = useState<'01' | 'cricket' | 'match' | 'random'>('random')
  const [onlineSelectionOpen, setOnlineSelectionOpen] = useState(false)
  const [onlineSeat, setOnlineSeat] = useState<number | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [remoteVideoActive, setRemoteVideoActive] = useState(false)
  const [videoConnectionState, setVideoConnectionState] = useState<'idle' | 'connecting' | 'connected' | 'failed'>('idle')
  const [relayConfigured, setRelayConfigured] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const autoChangedTurn = useRef<Game | null>(null)
  onlineSeatRef.current = onlineSeat
  const gameRef = useRef<Game | null>(game); gameRef.current = game
  const soundRef = useRef(sound); soundRef.current = sound
  const modeInfo = modes.find(item => item.id === mode)!
  const activePlayer = game?.players[game.active]

  const ensurePeerConnection = async () => {
    if (peerConnection.current) return peerConnection.current
    if (peerConnectionPending.current) return peerConnectionPending.current
    if (typeof RTCPeerConnection === 'undefined') throw new Error('このブラウザーはWebRTCに対応していません。')
    const pending = (async () => {
      let iceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }]
      const socket = onlineSocket.current
      if (socket?.connected) {
        const config = await new Promise<{ iceServers?: RTCIceServer[] } | null>(resolve => {
          socket.timeout(5000).emit('match:ice-servers', (cause: Error | null, response: { iceServers?: RTCIceServer[] } | undefined) => resolve(cause ? null : response || null))
        })
        if (config?.iceServers?.length) iceServers = config.iceServers
      }
      setRelayConfigured(iceServers.some(server => (Array.isArray(server.urls) ? server.urls : [server.urls]).some(url => /^(turn|turns):/i.test(url))))
      const peer = new RTCPeerConnection({ iceServers })
      peer.addTransceiver('video', { direction: 'sendrecv' })
      peer.onicecandidate = event => {
        if (event.candidate) onlineSocket.current?.emit('match:signal', { type: 'candidate', candidate: event.candidate.toJSON() })
      }
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'connected') setVideoConnectionState('connected')
        else if (peer.connectionState === 'failed') setVideoConnectionState('failed')
        else if (peer.connectionState === 'connecting' || peer.connectionState === 'disconnected') setVideoConnectionState('connecting')
        else if (peer.connectionState === 'closed') setVideoConnectionState('idle')
      }
      peer.onicecandidateerror = event => setCameraError(`映像ネットワーク候補を取得できませんでした (ICE ${event.errorCode})`)
      peer.ontrack = event => {
        const stream = event.streams[0] || new MediaStream([event.track])
        setRemoteStream(stream)
        setRemoteVideoActive(!event.track.muted)
        event.track.onunmute = () => setRemoteVideoActive(true)
        event.track.onmute = () => setRemoteVideoActive(false)
      }
      peerConnection.current = peer
      return peer
    })()
    peerConnectionPending.current = pending
    try { return await pending } finally { if (peerConnectionPending.current === pending) peerConnectionPending.current = null }
  }
  const makeVideoOffer = async () => {
    const peer = await ensurePeerConnection()
    if (peer.signalingState !== 'stable') return
    const offer = await peer.createOffer()
    await peer.setLocalDescription(offer)
    onlineSocket.current?.emit('match:signal', { type: 'offer', description: peer.localDescription?.toJSON() || offer })
  }
  const closeVideo = () => {
    localStreamRef.current?.getTracks().forEach(track => track.stop())
    localStreamRef.current = null
    peerConnection.current?.close()
    peerConnection.current = null
    peerConnectionPending.current = null
    pendingCandidates.current = []
    setLocalStream(null)
    setRemoteStream(null)
    setRemoteVideoActive(false)
    setVideoConnectionState('idle')
    setRelayConfigured(false)
    setCameraError('')
  }
  const toggleCamera = async () => {
    setCameraError('')
    if (localStreamRef.current) {
      const peer = peerConnection.current
      const sender = peer?.getSenders().find(item => item.track?.kind === 'video')
      try { await sender?.replaceTrack(null) } catch { /* The peer may already have closed. */ }
      localStreamRef.current.getTracks().forEach(track => track.stop())
      localStreamRef.current = null
      setLocalStream(null)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 360 }, facingMode: 'user' }, audio: false })
      const track = stream.getVideoTracks()[0]
      const peer = await ensurePeerConnection()
      const transceiver = peer.getTransceivers().find(item => item.receiver.track.kind === 'video')
      if (transceiver) await transceiver.sender.replaceTrack(track)
      else peer.addTrack(track, stream)
      localStreamRef.current = stream
      setLocalStream(stream)
    } catch (cause) {
      const reason = cause instanceof Error ? `${cause.name} ${cause.message}` : ''
      if (/permission|denied|dismissed|notallowed/i.test(reason)) {
        setCameraError('カメラの許可が閉じられました。アドレスバー左のサイト設定から「カメラ」を許可し、ページを再読み込みしてからもう一度押してください。')
      } else if (/notfound|devicesnotfound/i.test(reason)) {
        setCameraError('カメラが見つかりません。カメラを接続してからもう一度お試しください。')
      } else {
        setCameraError(cause instanceof Error ? `カメラを開始できませんでした: ${cause.message}` : 'カメラを開始できませんでした。ブラウザーのカメラ許可をご確認ください。')
      }
    }
  }

  const playSound = useCallback((hit: Hit) => {
    if (!soundRef.current || !audio.current || audio.current.state !== 'running') return
    const ctx = audio.current
    const now = ctx.currentTime
    const tone = (frequency: number, delay: number, duration: number, volume: number, type: OscillatorType = 'sine') => {
      const oscillator = ctx.createOscillator(), envelope = ctx.createGain(), filter = ctx.createBiquadFilter()
      const start = now + delay
      oscillator.type = type
      oscillator.frequency.setValueAtTime(frequency * 1.45, start)
      oscillator.frequency.exponentialRampToValueAtTime(frequency, start + Math.min(0.045, duration / 3))
      filter.type = 'lowpass'; filter.frequency.value = Math.max(900, frequency * 3)
      oscillator.connect(filter); filter.connect(envelope); envelope.connect(ctx.destination)
      envelope.gain.setValueAtTime(0.0001, start)
      envelope.gain.exponentialRampToValueAtTime(volume, start + 0.008)
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)
      oscillator.start(start); oscillator.stop(start + duration + 0.01)
    }
    if (hit.base === 0) {
      tone(145, 0, 0.12, 0.065, 'triangle')
      return
    }
    if (hit.base === 25) {
      const innerBull = hit.ratio === 2
      tone(innerBull ? 880 : 660, 0, innerBull ? 0.48 : 0.32, 0.09)
      tone(innerBull ? 1320 : 990, 0.035, innerBull ? 0.38 : 0.25, 0.055, 'triangle')
      if (innerBull) tone(1760, 0.075, 0.28, 0.035)
      return
    }
    const pitch = 280 + (hit.base % 12) * 16
    tone(105, 0, 0.075, 0.07, 'triangle')
    if (hit.ratio === 3) {
      tone(pitch * 2, 0.015, 0.2, 0.075, 'triangle')
      tone(pitch * 3, 0.045, 0.28, 0.045)
      tone(pitch * 4, 0.08, 0.22, 0.035, 'triangle')
    } else if (hit.ratio === 2) {
      tone(pitch * 1.5, 0.015, 0.22, 0.075, 'triangle')
      tone(pitch * 2, 0.05, 0.3, 0.05)
    } else {
      tone(pitch, 0.01, 0.13, 0.065, 'triangle')
    }
  }, [])
  const commitGame = useCallback((previous: Game, next: Game, hit?: Hit) => {
    const resolved = onlineStatus === 'matched' && next.mode === 'match' && next.match?.stage === 'cork'
      ? resolveMatchCoinToss(next, Math.random() < 0.5 ? 0 : 1)
      : next
    if (resolved === previous) return
    gameRef.current = resolved; setHistory(items => [...items, previous]); setGame(resolved)
    if (onlineSeatRef.current === 0) onlineSocket.current?.emit('match:state', resolved)
    if (hit) playSound(hit)
  }, [onlineStatus, playSound, onlineSeat])
  const apply = useCallback((action: 'next' | Hit) => {
    const previous = gameRef.current
    if (!previous || previous.finished) return
    if (onlineStatus === 'matched' && previous.active !== onlineSeat) return
    if (onlineStatus === 'matched' && onlineSeat === 1) {
      onlineSocket.current?.emit('match:action', { type: 'throw', action: action === 'next' ? { type: 'next' } : action })
      return
    }
    const next = action === 'next' ? nextTurn(previous) : previous.mode === 'match' && previous.match?.stage === 'cork' ? throwCork(previous, action) : throwDart(previous, action)
    commitGame(previous, next, action === 'next' ? undefined : action)
  }, [commitGame, onlineSeat, onlineStatus])
  const requestMatchDecision = (type: 'first' | 'choose' | 'select-game' | 'cork-winner', value: 'first' | 'game' | '01' | 'cricket' | number) => {
    if (!game) return
    if (onlineStatus === 'matched' && game.active !== onlineSeat) return
    if (onlineStatus === 'matched' && onlineSeat === 1) {
      onlineSocket.current?.emit('match:action', { type: 'decision', decision: type, value })
      return
    }
    const next = type === 'first' || type === 'choose'
      ? chooseMatchFirst(game, value as 'first' | 'game')
      : type === 'cork-winner'
        ? resolveCork(game, value as number)
        : chooseMatchGame(game, value as '01' | 'cricket', initial)
    commitGame(game, next)
  }
  const receive = useCallback((signal: BoardSignal, raw?: { code: number; hex: string }) => {
    const previous = gameRef.current
    const result = receiveBoardSignal(previous, signal)
    const rawText = raw ? ` · ${raw.code} [${raw.hex}]` : ''
    setLastInput(`${signal.type === 'change' ? 'CHANGE' : label(signal)}${rawText} · ${result.detail}`)
    if (previous && result.applied && result.game) apply(signal.type === 'segment' ? signal : 'next')
  }, [apply])

  const findOnlineOpponent = () => {
    if (onlineStatus === 'searching') {
      onlineSocket.current?.emit('queue:leave')
      onlineSocket.current?.disconnect()
      onlineSocket.current = null
      setOnlineSeat(null)
      setOnlineStatus('offline')
      return
    }
    setError('')
    setOnlineStatus('connecting')
    const configuredUrl = process.env.NEXT_PUBLIC_MATCH_SERVER_URL
    const url = configuredUrl || (process.env.NODE_ENV === 'production' ? 'https://darts-room-match.onrender.com' : `http://${window.location.hostname}:4001`)
    const socket = io(url, { transports: ['websocket', 'polling'], timeout: 10000 })
    onlineSocket.current?.disconnect()
    onlineSocket.current = socket
    socket.on('connect', () => { setOnlineStatus('searching'); socket.emit('queue:join', { mode: onlineMode }) })
    socket.on('connect_error', cause => {
      setOnlineStatus('offline')
      setError(`マッチングサーバーに接続できません。サーバーを起動してください。(${cause.message})`)
      socket.disconnect()
    })
    socket.on('match:found', (match: { room: string; seat: number; mode: Mode; players: string[] }) => {
      setOnlineSeat(match.seat); onlineSeatRef.current = match.seat
      setOnlineStatus('matched')
      setOnlineSelectionOpen(false)
      void ensurePeerConnection().then(() => match.seat === 0 ? makeVideoOffer() : undefined).catch(cause => setCameraError(cause instanceof Error ? cause.message : 'このブラウザーではカメラ映像を利用できません。'))
      setMode(match.mode)
      setCount(2)
      setInitial(match.mode === '01' || match.mode === 'match' ? 501 : 501)
      setScreen('game')
      setHistory([])
      if (match.seat === 0) {
        const initialGame = createGame(match.mode, match.players, 501, bull, outRule, practiceTarget, matchBestOf, matchLeadRule)
        const next = match.mode === 'match'
          ? resolveMatchCoinToss(initialGame, Math.random() < 0.5 ? 0 : 1)
          : { ...initialGame, message: `COIN TOSS · ${initialGame.players[0].name} GOES FIRST` }
        gameRef.current = next
        setGame(next)
        socket.emit('match:state', next)
      } else {
        gameRef.current = null
        setGame(null)
      }
    })
    socket.on('match:signal', async (signal: MatchSignal) => {
      try {
        const peer = await ensurePeerConnection()
        if (signal.type === 'offer') {
          if (onlineSeatRef.current !== 1) return
          await peer.setRemoteDescription(new RTCSessionDescription(signal.description))
          for (const candidate of pendingCandidates.current.splice(0)) await peer.addIceCandidate(new RTCIceCandidate(candidate))
          const answer = await peer.createAnswer()
          await peer.setLocalDescription(answer)
          socket.emit('match:signal', { type: 'answer', description: peer.localDescription?.toJSON() || answer })
        } else if (signal.type === 'answer') {
          if (onlineSeatRef.current !== 0) return
          await peer.setRemoteDescription(new RTCSessionDescription(signal.description))
          for (const candidate of pendingCandidates.current.splice(0)) await peer.addIceCandidate(new RTCIceCandidate(candidate))
        } else if (signal.type === 'candidate') {
          if (peer.remoteDescription) await peer.addIceCandidate(new RTCIceCandidate(signal.candidate))
          else pendingCandidates.current.push(signal.candidate)
        }
      } catch (cause) {
        setCameraError(cause instanceof Error ? `映像接続でエラーが発生しました: ${cause.message}` : '映像接続に失敗しました。')
      }
    })
    socket.on('match:state', (next: Game) => {
      if (onlineSeatRef.current !== 0) { gameRef.current = next; setGame(next) }
    })
    socket.on('match:action', (request: { type: 'throw' | 'decision'; action?: Hit | { type: 'next' }; decision?: 'first' | 'choose' | 'select-game' | 'cork-winner'; value?: 'first' | 'game' | '01' | 'cricket' | number; seat: number }) => {
      const previous = gameRef.current
      if (!previous || previous.finished || previous.active !== request.seat) return
      let next: Game
      if (request.type === 'throw') {
        const action = request.action!
        next = 'type' in action ? nextTurn(previous) : previous.mode === 'match' && previous.match?.stage === 'cork' ? throwCork(previous, action) : throwDart(previous, action)
        commitGame(previous, next, 'type' in action ? undefined : action)
      } else if (previous.mode === 'match' && request.decision === 'cork-winner') {
        commitGame(previous, resolveCork(previous, request.value as number))
      } else if (previous.mode === 'match' && (request.decision === 'first' || request.decision === 'choose')) {
        commitGame(previous, chooseMatchFirst(previous, request.value as 'first' | 'game'))
      } else if (previous.mode === 'match') {
        commitGame(previous, chooseMatchGame(previous, request.value as '01' | 'cricket', 501))
      }
    })
    socket.on('match:opponent-left', () => {
      setError('対戦相手が退出しました。')
      closeVideo()
      setOnlineStatus('offline')
      setOnlineSeat(null)
      onlineSeatRef.current = null
      onlineSocket.current?.disconnect()
      onlineSocket.current = null
      gameRef.current = null
      setGame(null)
      setScreen('home')
    })
  }

  useEffect(() => {
    connector.current = new DARTSLIVEHomeConnector()
    const timer = window.setInterval(() => { if (connector.current && !connector.current.isConnected) setConnected(false) }, 1000)
    return () => { window.clearInterval(timer); unsubscribe.current?.(); connector.current?.disconnect(); localStreamRef.current?.getTracks().forEach(track => track.stop()); peerConnection.current?.close(); onlineSocket.current?.disconnect(); void audio.current?.close() }
  }, [])
  useEffect(() => {
    if (!localVideo.current) return
    localVideo.current.srcObject = localStream
    if (localStream) void localVideo.current.play().catch(() => {})
  }, [localStream])
  useEffect(() => {
    if (!remoteVideo.current) return
    remoteVideo.current.srcObject = remoteStream
    if (remoteStream) void remoteVideo.current.play().catch(() => {})
  }, [remoteStream, remoteVideoActive])
  useEffect(() => {
    if (!game || game.mode !== 'robo' || game.active !== 1 || game.finished) return
    const timer = window.setTimeout(() => {
      const previous = gameRef.current
      if (!previous || previous.mode !== 'robo' || previous.active !== 1 || previous.finished) return
      let next = previous
      for (let dart = 0; dart < 3; dart++) {
        const level = difficulty === 'HARD' ? 0.68 : difficulty === 'NORMAL' ? 0.43 : 0.2
        const hit: Hit = Math.random() < level ? { base: 20, ratio: Math.random() < level * .55 ? 3 : 1 } : { base: [19, 18, 17, 16, 15, 12, 5][Math.floor(Math.random() * 7)], ratio: 1 }
        next = throwDart(next, hit)
        if (next.finished) break
      }
      if (!next.finished) next = nextTurn(next)
      commitGame(previous, next)
    }, 900)
    return () => window.clearTimeout(timer)
  }, [game, difficulty, commitGame])
  useEffect(() => {
    if (!game || game.finished || game.mode === 'match' && game.match?.stage !== 'playing') return
    if (onlineStatus === 'matched' && onlineSeat !== 0) return
    if ((!game.bust && game.throws.length !== 3) || autoChangedTurn.current === game) return
    const completedTurn = game
    const timer = window.setTimeout(() => {
      const current = gameRef.current
      if (current !== completedTurn || current.finished || current.mode === 'match' && current.match?.stage !== 'playing') return
      autoChangedTurn.current = completedTurn
      commitGame(current, nextTurn(current))
    }, game.bust ? 700 : 650)
    return () => window.clearTimeout(timer)
  }, [game, onlineStatus, onlineSeat, commitGame])

  const connect = async () => {
    if (!('bluetooth' in navigator)) { setError('BluetoothはChrome / Edgeで、localhostまたはHTTPSから利用できます。'); return }
    setConnecting(true); setError('')
    try {
      unsubscribe.current?.(); unsubscribe.current = null
      if (!await connector.current!.connect()) { setError('接続できませんでした。ボードの電源と接続状態をご確認ください。'); return }
      unsubscribe.current = await connector.current!.subscribe(receive)
      setConnected(true)
    } catch (cause) { connector.current?.disconnect(); setConnected(false); setError(cause instanceof Error ? cause.message : '接続に失敗しました') }
    finally { setConnecting(false) }
  }
  const disconnect = () => { unsubscribe.current?.(); unsubscribe.current = null; connector.current?.disconnect(); setConnected(false) }
  const selectMode = (next: Mode) => {
    setMode(next); setScreen('setup'); setError('')
    setCount(next === 'practice' || next === 'robo' ? 1 : 2)
    setInitial(next === '01' ? 701 : 501)
  }
  const start = () => {
    if (mode === 'match' && count < 2) return
    try { if (!audio.current) audio.current = new AudioContext() } catch { /* Sound is optional. */ }
    void audio.current?.resume().catch(() => {})
    const players = mode === 'robo' ? [names[0], `ROBO · ${difficulty}`] : mode === 'practice' ? [names[0]] : names.slice(0, count)
    const next = createGame(mode, players, initial, bull, outRule, practiceTarget, matchBestOf, matchLeadRule)
    gameRef.current = next; setGame(next); setHistory([]); setScreen('game')
  }
  const goHome = () => { if (screen === 'game' && game && !game.finished && !window.confirm('ゲームを終了してホームに戻りますか？')) return; if (onlineStatus === 'matched') { onlineSocket.current?.disconnect(); onlineSocket.current = null; closeVideo(); setOnlineStatus('offline'); setOnlineSeat(null); onlineSeatRef.current = null }; gameRef.current = null; setGame(null); setHistory([]); setScreen('home') }
  const undo = () => { const previous = history.at(-1); if (!previous) return; gameRef.current = previous; setGame(previous); setHistory(items => items.slice(0, -1)) }

  return <main className="app-shell">
    <header className="topbar">
      <button className="wordmark" onClick={goHome}><span className="mark">D</span><span>DARTS<small>ROOM</small></span></button>
      <div className="board-status"><span className={`status-dot ${connected ? 'online' : ''}`} /><span>{connected ? 'DARTSLIVE HOME 接続中' : 'ボード未接続'}</span><button className="connect-button" disabled={connecting} onClick={connected ? disconnect : connect}>{connecting ? '接続中…' : connected ? '切断' : 'Bluetooth接続'}</button></div>
    </header>
    {error && <div className="error-banner" role="alert">{error}<button onClick={() => setError('')}>閉じる</button></div>}

    {screen === 'home' && <>
      <section className="welcome"><div><div className="kicker">HOME DARTS · LOCAL PLAY</div><h1>今日の一本を、<span>ここから。</span></h1><p>遊びたいゲームを選んで、スタート。</p></div><div className="welcome-orbit">D<span>●</span></div></section>
      <section className="mode-section"><div className="section-heading"><div><span className="kicker">CHOOSE YOUR GAME</span><h2>GAME SELECT</h2></div><span className="local-tag">● LOCAL + ONLINE</span></div>
        <div className="game-grid">{modes.map(item => <button key={item.id} className={`game-card ${item.accent}`} onClick={() => selectMode(item.id)}><span className="card-icon">{item.icon}</span><span className="card-arrow">↗</span><span className="card-copy"><strong>{item.title}</strong><small>{item.subtitle}</small></span></button>)}
          <button className="game-card online-card" onClick={() => onlineStatus === 'searching' ? findOnlineOpponent() : setOnlineSelectionOpen(open => !open)} disabled={onlineStatus === 'connecting'} aria-expanded={onlineSelectionOpen} aria-label={onlineStatus === 'searching' ? 'オンライン対戦をキャンセル' : 'オンライン対戦のゲームモードを選ぶ'}><span className="card-icon">◎</span><span className="card-arrow">{onlineStatus === 'searching' ? '×' : '↗'}</span><span className="card-copy"><strong>ONLINE MATCH</strong><small>{onlineStatus === 'connecting' ? 'サーバーに接続中…' : onlineStatus === 'searching' ? '対戦相手を検索中 · タップでキャンセル' : onlineSelectionOpen ? 'ゲームモードを選択してください' : '01・CR・MATCH・RANDOM'}</small></span></button>
        </div>
        {onlineSelectionOpen && <div className="online-mode-panel">
          <div className="online-mode-heading"><div><strong>オンライン対戦モード</strong><small>相手と同じモード、またはRANDOM同士でマッチします。</small></div></div>
          <div className="online-mode-options" role="group" aria-label="オンライン対戦モード">
            {([{ id: '01', title: '01', detail: 'ゼロワン' }, { id: 'cricket', title: 'CR', detail: 'クリケット' }, { id: 'match', title: 'MATCH', detail: 'メドレー' }, { id: 'random', title: 'RANDOM', detail: 'どのモードともマッチ' }] as const).map(option => <button key={option.id} className={onlineMode === option.id ? 'chosen' : ''} aria-pressed={onlineMode === option.id} disabled={onlineStatus === 'connecting' || onlineStatus === 'searching'} onClick={() => setOnlineMode(option.id)}><strong>{option.title}</strong><small>{option.detail}</small></button>)}
          </div>
          <button className="online-search-button" onClick={findOnlineOpponent} disabled={onlineStatus === 'connecting'}>{onlineStatus === 'searching' ? '検索をキャンセル' : onlineStatus === 'connecting' ? '接続中…' : '対戦相手を検索'} <span>→</span></button>
        </div>}
      </section>
      <section className="home-note"><span>01</span><p>Bluetoothボードまたは画面入力に対応。</p><span>PLAY AT HOME</span></section>
    </>}

    {screen === 'setup' && <section className="setup-view">
      <button className="back-link" onClick={() => setScreen('home')}>← <span>ゲーム選択へ戻る</span></button>
      <div className="setup-layout"><div className="setup-main"><div className={`mode-emblem ${modeInfo.accent}`}>{modeInfo.icon}</div><div className="kicker">GAME SETUP</div><h1>{modeInfo.title}</h1><p className="setup-description">{modeInfo.subtitle}</p>
        {mode === 'practice' ? <div className="setup-block"><h2>練習するナンバー</h2><div className="target-select">{[20,19,18,17,16,15,25].map(target => <button className={practiceTarget===target?'chosen':''} key={target} onClick={() => setPracticeTarget(target)}>{target===25?'BULL':target}</button>)}</div><p className="setup-hint">狙ったナンバーに入った回数と命中率を記録します。</p></div> : <>
          {(mode === '01' || mode === 'match' || mode === 'robo') && <div className="setup-block"><h2>スタートスコア</h2><div className="segmented score-options">{(mode === '01' ? [301,501,701,901,1101,1501] : [301,501,701,901]).map(score => <button className={initial===score?'chosen':''} key={score} onClick={() => setInitial(score)}>{score}</button>)}</div></div>}
          {(mode === '01' || mode === 'match' || mode === 'robo') && <div className="setup-block"><h2>上がり方</h2><div className="segmented"><button className={outRule==='master'?'chosen':''} onClick={() => setOutRule('master')}>MASTER OUT</button><button className={outRule==='double'?'chosen':''} onClick={() => setOutRule('double')}>DOUBLE OUT</button></div></div>}
          {mode === 'match' && <><div className="setup-block"><h2>メドレー</h2><div className="segmented"><button className={matchBestOf===3?'chosen':''} onClick={() => setMatchBestOf(3)}>BEST OF 3 <small>01 · CR · CH</small></button><button className={matchBestOf===5?'chosen':''} onClick={() => setMatchBestOf(5)}>BEST OF 5 <small>01 · CR · CR · 01 · CH</small></button></div><p className="setup-hint">必要勝利数に先に達した時点で終了します。</p></div><div className="setup-block"><h2>2レグ目以降の先攻</h2><div className="segmented"><button className={matchLeadRule==='loser'?'chosen':''} onClick={() => setMatchLeadRule('loser')}>LOSER · 前レグの敗者</button><button className={matchLeadRule==='alternate'?'chosen':''} onClick={() => setMatchLeadRule('alternate')}>ALTERNATE · 交互</button></div></div></>}
          {mode !== 'robo' && <div className="setup-block"><h2>プレイヤー</h2><div className="segmented player-count">{[1,2,3,4].map(n=><button className={count===n?'chosen':''} key={n} onClick={() => setCount(n)}>{n}<small>人</small></button>)}</div>{names.slice(0,count).map((name,i)=><label className="player-name" key={i}><span>P{i+1}</span><input aria-label={`プレイヤー${i+1}`} value={name} maxLength={20} onChange={e=>setNames(old=>old.map((v,j)=>i===j?e.target.value:v))}/></label>)}{mode==='cricket'&&count===1&&<p className="setup-hint">15〜20とBULLをすべてクローズすると終了します。ラウンド制限はありません。</p>}</div>}
          {mode === 'robo' && <div className="setup-block"><h2>CPUレベル</h2><div className="segmented">{(['EASY','NORMAL','HARD'] as const).map(level=><button className={difficulty===level?'chosen':''} key={level} onClick={()=>setDifficulty(level)}>{level}</button>)}</div></div>}
          {mode !== 'robo' && <div className="setup-block"><h2>ブル</h2><div className="segmented"><button className={bull==='fat'?'chosen':''} onClick={()=>setBull('fat')}>FAT BULL · 50</button><button className={bull==='split'?'chosen':''} onClick={()=>setBull('split')}>SPLIT · 25 / 50</button></div></div>}
        </>}
        {mode === 'match' && count<2 && <p className="setup-hint">MATCHは2人以上でプレイします。</p>}
        <button className="primary-button" disabled={mode==='match'&&count<2} onClick={start}>{mode==='practice'?'練習をはじめる':'ゲームをはじめる'} <span>→</span></button>
      </div><aside className="setup-aside"><div className="aside-label">{mode==='robo'?'VS COMPUTER':mode==='practice'?'PRACTICE TARGET':mode==='cricket'?'CRICKET':mode==='match'?'MATCH MEDLEY':'01 GAME'}</div><div className="aside-number">{mode==='practice'?(practiceTarget===25?'BULL':practiceTarget):initial}</div><div className="aside-rule">{mode==='cricket'?'15 · 16 · 17 · 18 · 19 · 20 · BULL':mode==='practice'?'狙った数字を何度でも練習':mode==='robo'?`YOU  VS  ROBO · ${difficulty}`:mode==='match'?`BEST OF ${matchBestOf} · ${matchBestOf===3?'01 · CR · CH':'01 · CR · CR · 01 · CH'}`:`15 ROUNDS · ${outRule.toUpperCase()}`}</div><div className="aside-board"><Board onHit={()=>{}} disabled /></div></aside></div>
    </section>}

    {screen === 'game' && onlineStatus === 'matched' && !game && <section className="game-view online-waiting"><span className="kicker">RANDOM MATCH</span><h1>対戦相手と接続中</h1><p>ゲーム情報を同期しています…</p></section>}
    {screen === 'game' && game && <section className="game-view">
      <div className="game-toolbar"><button className="back-link" onClick={goHome}>← ホーム</button><div className="game-label"><span className={`mini-dot ${modeInfo.accent}`} />{modeInfo.title}{onlineStatus === 'matched' ? ' · ONLINE' : mode === 'robo' ? ' · CPU対戦' : ''}</div><div className="game-round">{mode === 'practice' ? 'FREE PRACTICE' : mode === 'match' ? `LEG ${game.match!.legIndex + 1} / ${game.match!.bestOf} · ${game.match!.legWins[0]} - ${game.match!.legWins[1]}` : `ROUND ${game.round}${game.limit ? ` / ${game.limit}` : ''}`}</div></div>
      {onlineStatus === 'matched' && <div className="match-video-panel">
        <div className="match-video-feeds">
          <div className="match-video-feed"><div className="match-video-frame">{localStream ? <video ref={localVideo} autoPlay playsInline muted /> : <span>あなたのカメラはオフです</span>}<small>YOU</small></div></div>
          <div className="match-video-feed"><div className="match-video-frame">{remoteStream && remoteVideoActive ? <video ref={remoteVideo} autoPlay playsInline muted /> : <span>{videoConnectionState === 'failed' ? '映像接続に失敗しました · 別のネットワークをお試しください' : videoConnectionState !== 'connected' ? '相手と映像を接続中…' : remoteStream ? '相手のカメラはオフです' : '相手のカメラを待っています'}</span>}<small>OPPONENT</small></div></div>
        </div>
        <div className="match-video-controls"><button onClick={() => void toggleCamera()}>{localStream ? 'カメラをオフ' : 'カメラをオン'}</button><small>映像のみ共有 · マイク音声は送信しません</small><small className={relayConfigured ? 'relay-ready' : 'relay-missing'}>{relayConfigured ? 'TURN中継を利用できます' : 'TURN中継なし · ネットワークによって映像がつながらない場合があります'}</small></div>
        {cameraError && <p className="match-video-error" role="status">{cameraError}</p>}
      </div>}
      {!game.finished && <div className="score-strip">{game.players.map((p, i) => <article key={i} className={`score-card ${game.active === i ? 'active' : ''}`}><div><span>P{i + 1}</span><strong>{p.name}</strong>{onlineStatus === 'matched' && i === onlineSeat && <small className="you-tag">あなた</small>}{mode === 'robo' && i === 1 && <small className="cpu-tag">CPU</small>}</div><b>{isX01Game(game) ? p.score : mode === 'practice' ? `${game.practiceHits} / ${p.darts}` : p.score}</b><small>{mode === 'match' ? `MATCH LEGS ${game.match!.legWins[i]}` : mode === 'cricket' || game.mode === 'match' && game.legMode === 'cricket' ? `${targets.reduce((sum, t) => sum + (p.marks[t] || 0), 0)} MARKS` : mode === 'practice' ? `命中率 ${p.darts ? Math.round(game.practiceHits / p.darts * 100) : 0}%` : `PPD ${p.darts ? (p.points / p.darts).toFixed(1) : '—'}`}</small></article>)}</div>}
      {game.finished ? <><GameResults game={game}/><div className="finish-card"><button className="primary-button" onClick={goHome}>ホームへ戻る <span>→</span></button></div></> : <div className="play-layout">
        <div className="turn-panel">
          <div className="turn-player">{onlineStatus === 'matched' && <strong className="online-turn-owner">{game.active === onlineSeat ? 'あなたの番' : '相手の番'} · </strong>}{mode === 'match' ? game.match!.stage === 'cork' ? `CORK · ${activePlayer?.name} の番` : game.match!.stage === 'cork-tie' ? 'CORK · 近いダーツを選択' : game.match!.stage === 'choice' ? `${game.players[game.active].name} · CHOICE` : `LEG ${game.match!.legIndex + 1} · ${activePlayer?.name}` : `P${game.active + 1} · ${activePlayer?.name}${mode === 'robo' && game.active === 1 ? ' · CPUのターン' : ''}`}</div>
          <div className="main-score">{mode === 'match' && game.match!.stage === 'cork' ? 'CORK' : mode === 'match' && game.match!.stage === 'cork-tie' ? 'TIE' : mode === 'match' && game.match!.stage === 'choice' ? 'CH' : isX01Game(game) ? activePlayer?.score : mode === 'practice' ? `${game.practiceHits}` : activePlayer?.score}</div>
          {mode === 'practice' && <p className="practice-focus">TARGET <strong>{game.practiceTarget === 25 ? 'BULL' : game.practiceTarget}</strong></p>}
          {mode === 'match' && game.match!.stage === 'choice' ? <div className="match-decision">{game.match!.choiceAs === null ? <><p>{onlineStatus === 'matched' ? 'コイントスの勝者' : 'コークの勝者'}が選びます。先攻を取るか、ゲーム選択権を取ってください。</p><button disabled={onlineStatus === 'matched' && game.active !== onlineSeat} onClick={() => requestMatchDecision('first', 'first')}>先攻を取る</button><button disabled={onlineStatus === 'matched' && game.active !== onlineSeat} onClick={() => requestMatchDecision('choose', 'game')}>ゲームを選ぶ</button></> : <><p>{game.players[game.active].name} がCHのゲームを選択</p><button disabled={onlineStatus === 'matched' && game.active !== onlineSeat} onClick={() => requestMatchDecision('select-game', '01')}>01を選ぶ</button><button disabled={onlineStatus === 'matched' && game.active !== onlineSeat} onClick={() => requestMatchDecision('select-game', 'cricket')}>CRICKETを選ぶ</button></>}</div> : mode === 'match' && game.match!.stage === 'cork-tie' ? <div className="match-decision"><p>同じエリアに入っています。実際に中心に近い方を選んでください。</p>{game.players.map((p, i) => <button key={i} disabled={onlineStatus === 'matched' && game.active !== onlineSeat} onClick={() => requestMatchDecision('cork-winner', i)}>{p.name} のダーツが近い</button>)}</div> : <>
            <div className="throw-message" aria-live="polite">{game.message}</div>
            <div className="dart-slots">{(mode === 'match' && game.match!.stage === 'cork' ? [0, 1] : [0, 1, 2]).map(i => <div key={i}><small>{mode === 'match' && game.match!.stage === 'cork' ? `CORK · ${game.players[i].name}` : `DART ${i + 1}`}</small><b>{mode === 'match' && game.match!.stage === 'cork' ? game.match!.corkThrows[i] ? label(game.match!.corkThrows[i]) : '—' : game.throws[i] ? label(game.throws[i]) : '—'}</b></div>)}</div>
            {mode === 'match' && game.match!.stage === 'cork' ? <div className="play-controls">{onlineStatus !== 'matched' && <button onClick={undo} disabled={!history.length}>↶ 取り消す</button>}<label><input type="checkbox" checked={manual} onChange={e => setManual(e.target.checked)} />ボードを画面入力</label></div> : game.bust || game.throws.length === 3 ? <p className="auto-change-message" aria-live="polite">{game.bust ? 'BUST · 次のプレイヤーへ' : '3本投げ終わり · 次のプレイヤーへ'}</p> : (mode !== 'robo' || game.active === 0) ? <><button className="primary-button next-turn" disabled={onlineStatus === 'matched' && game.active !== onlineSeat} onClick={() => apply('next')}>ターンを終了 <span>→</span></button><div className="play-controls">{onlineStatus !== 'matched' && <button onClick={undo} disabled={!history.length}>↶ 取り消す</button>}<button onClick={() => apply({ base: 0, ratio: 1 })} disabled={game.throws.length >= 3 || game.bust || onlineStatus === 'matched' && game.active !== onlineSeat}>MISS</button><label><input type="checkbox" checked={manual} onChange={e => setManual(e.target.checked)} />ボードを画面入力</label></div></> : mode === 'robo' && game.active === 1 ? <p className="bot-thinking">ROBO THINKING<span>···</span></p> : null}
            <p className="board-hint">{mode === 'match' && game.match!.stage === 'cork' ? '1本ずつ中心を狙います。エリアが同じ場合は近い方を選択。' : connected ? 'Bluetoothボードの命中を待っています' : 'Bluetooth接続または画面のボード入力でプレイ'}</p>{lastInput && <p className="last-hit">{lastInput}</p>}
          </>}
        </div>
        <div className="board-wrap">{(mode === 'cricket' || mode === 'match' && game.legMode === 'cricket') && <table className="cricket-score"><thead><tr><th>NUMBER</th>{game.players.map((p, i) => <th key={i}>{p.name}</th>)}</tr></thead><tbody>{targets.map(t => <tr key={t}><th>{t === 25 ? 'BULL' : t}</th>{game.players.map((p, i) => <td className={(p.marks[t] || 0) >= 3 ? 'closed' : ''} key={i}>{['·', '/', '×', '⊗'][Math.min(3, p.marks[t] || 0)]}</td>)}</tr>)}</tbody></table>}<div className="board-title"><span>{mode === 'match' && game.match!.stage === 'choice' ? onlineStatus === 'matched' ? 'COIN TOSS / CHOICE' : 'CORK / CHOICE' : mode === 'match' && game.match!.stage !== 'playing' ? 'CORK / CHOICE' : 'BOARD'}</span>{manual && <small>クリックで入力</small>}</div><Board onHit={hit => apply(hit)} disabled={!manual || mode === 'robo' && game.active === 1 || onlineStatus === 'matched' && game.active !== onlineSeat || game.throws.length >= 3 || game.bust || mode === 'match' && (game.match!.stage === 'choice' || game.match!.stage === 'cork-tie')} darts={mode === 'match' && game.match?.stage === 'cork' ? game.match.corkThrows : game.throws}/></div>
      </div>}
    </section>}
    <footer className="app-footer"><span>DARTS ROOM</span><span>{onlineStatus === 'matched' ? 'ONLINE MATCH' : 'LOCAL PLAY · OFFLINE'}</span></footer>
  </main>
}
