"use client"

import { DARTSLIVEHomeConnector } from '@minimalcorp/dartboard-connector/dartslive-home'
import { io, type Socket } from 'socket.io-client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AccountPanel } from '../components/account-panel'
import { receiveBoardSignal, type BoardSignal } from '../lib/board-input'
import { chooseMatchFirst, chooseMatchGame, createGame, halfItTargets, isX01Game, label, nextTurn, practiceModeTitle, practiceTargetForRound, practiceTargets, resolveCork, resolveMatchCoinToss, roboAim, targets, throwCork, throwDart, type Award, type Game, type Hit, type MatchLeadRule, type Mode, type OutRule, type PracticeMode } from '../lib/game'

const modes: { id: Mode; title: string; subtitle: string; icon: string; accent: string }[] = [
  { id: '01', title: '01', subtitle: 'ゼロを目指して対戦', icon: '01', accent: 'red' },
  { id: 'cricket', title: 'CRICKET', subtitle: 'ナンバーを閉じて競う', icon: '⊗', accent: 'blue' },
  { id: 'practice', title: 'PRACTICE', subtitle: '狙ったナンバーを練習', icon: '⌃', accent: 'green' },
  { id: 'match', title: 'MATCH', subtitle: '01・CR・CHのメドレー', icon: '☆', accent: 'orange' },
  { id: 'robo', title: 'ROBO MATCH', subtitle: 'CPUと対戦', icon: '♙', accent: 'purple' },
]
const numbers = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]
type MatchSignal = { type: 'offer' | 'answer'; description: RTCSessionDescriptionInit } | { type: 'candidate'; candidate: RTCIceCandidateInit }
const isRoboGame = (game: Game) => game.players[1]?.name.startsWith('ROBO ·') === true
const practiceBoardTarget = (game: Game): number | 'bull' | 'double' | 'triple' | undefined => {
  if (game.practiceMode === 'target') return game.practiceTarget
  if (game.practiceMode === 'eagles-eye') return 'bull'
  if (game.practiceMode === 'cricket-count-up') return practiceTargets[Math.min(game.round - 1, practiceTargets.length - 1)]
  if (game.practiceMode === 'half-it') {
    const target = halfItTargets[game.round - 1]
    return target === 'BULL' ? 'bull' : target === 'D' ? 'double' : target === 'T' ? 'triple' : target && /^\d+$/.test(target) ? Number(target) : undefined
  }
  return undefined
}

function GameResults({ game }: { game: Game }) {
  const cricket = game.mode === 'cricket' || (game.mode === 'match' || game.mode === 'robo') && game.legMode === 'cricket'
  const practice = game.mode === 'practice'
  const practiceHitOnly = practice && (game.practiceMode === 'target' || game.practiceMode === 'eagles-eye')
  const match = game.mode === 'match' && game.match
  const closedTargets = (player: Game['players'][number]) => targets.filter(target => (player.marks[target] || 0) >= 3).length
  const practiceSummary = (player: Game['players'][number]) => practiceHitOnly ? `${game.practiceHits} / ${player.darts}` : player.score
  return <section className="results-panel" aria-label="ゲーム結果">
    <header className="results-heading"><div className="kicker">FINAL RESULTS</div><h2>{game.winner === null ? 'DRAW' : `${game.players[game.winner].name} WIN`}</h2>{match && <p>LEG WINS <strong>{match.legWins[0]} — {match.legWins[1]}</strong><small> · FINAL LEG</small></p>}</header>
    <div className="results-players">{game.players.map((player, index) => <article className={`result-player ${game.winner === index ? 'winner' : ''}`} key={index}>
      <div className="result-player-heading"><span>P{index + 1}</span><strong>{player.name}</strong><em>{game.winner === index ? 'WINNER' : game.winner === null ? 'DRAW' : 'FINISH'}</em></div>
      <div className="result-main-score"><small>{practice ? practiceHitOnly ? 'TARGET HITS' : 'FINAL SCORE' : cricket ? game.players.length === 1 ? 'TARGETS CLOSED' : 'CRICKET SCORE' : match ? 'FINAL LEG · REMAINING' : 'REMAINING SCORE'}</small><b>{practice ? practiceHitOnly ? `${game.practiceHits} / ${player.darts}` : player.score : cricket && game.players.length === 1 ? `${closedTargets(player)} / ${targets.length}` : player.score}</b></div>
      <div className="result-stats">
        <div><small>{match ? 'DARTS · FINAL LEG' : 'DARTS THROWN'}</small><strong>{player.darts}</strong></div>
        {!practice && game.ratingResults.at(-1) && <div><small>{cricket ? '80% MPR' : '80% PPR'}</small><strong>{game.ratingResults.at(-1)!.stats[index]?.toFixed(2) ?? '—'}</strong></div>}
        {cricket ? <>
          <div><small>TARGETS CLOSED</small><strong>{closedTargets(player)} / {targets.length}</strong></div>
          <div><small>TOTAL MARKS</small><strong>{targets.reduce((sum, target) => sum + (player.marks[target] || 0), 0)}</strong></div>
          {game.players.length > 1 && <div><small>CRICKET POINTS</small><strong>{player.score}</strong></div>}
        </> : practice ? <>
          {practiceHitOnly && <div><small>HIT RATE</small><strong>{player.darts ? `${Math.round(game.practiceHits / player.darts * 100)}%` : '—'}</strong></div>}
          <div><small>POINTS SCORED</small><strong>{player.points}</strong></div>
          <div><small>AVERAGE / DART</small><strong>{player.darts ? (player.points / player.darts).toFixed(1) : '—'}</strong></div>
          {game.practiceMode === 'shoot-out' && <div><small>AREAS OPENED</small><strong>{game.practiceOpened.filter(n => n !== 25).length} / 20 + {game.practiceOpened.filter(n => n === 25).length} BULL</strong></div>}
        </> : <>
          <div><small>POINTS SCORED</small><strong>{player.points}</strong></div>
          <div><small>PPD</small><strong>{player.darts ? (player.points / player.darts).toFixed(1) : '—'}</strong></div>
          {match && <div><small>MATCH LEGS</small><strong>{match.legWins[index]}</strong></div>}
        </>}
      </div>
    </article>)}</div>
  </section>
}

const AWARD_DURATION = 2400
function AwardMovie({ award, onSkip }: { award: Award; onSkip: () => void }) {
  const marks = award.title.endsWith(' MARKS')
  return <div className={`award-movie award-${award.kind}${award.title === 'THREE IN THE BLACK' ? ' award-black' : ''}`} role="status" aria-label={`${award.player} · ${award.title}`}>
    <div className="award-flare" aria-hidden="true"/>
    <div className="award-content">
      <div className="award-eyebrow"><span/>ROUND HIGHLIGHT<span/></div>
      <div className={`award-headline${marks ? ' award-headline-marks' : ''}`}>
        {marks && <strong className="award-number">{award.title.split(' ')[0]}</strong>}
        <h2>{marks ? 'MARKS' : award.title}</h2>
      </div>
      <div className="award-line" aria-hidden="true"/>
      <p className="award-player">{award.player}</p>
      <div className="award-timer" aria-hidden="true"/>
    </div>
    <button className="award-skip" onClick={onSkip}>スキップ →</button>
  </div>
}

function Board({ onHit, disabled, darts = [], activeTarget, cricketMarks }: { onHit: (hit: Hit) => void; disabled: boolean; darts?: Hit[]; activeTarget?: number | 'bull' | 'double' | 'triple'; cricketMarks?: Record<number, number> }) {
  const xy = (r: number, a: number) => `${200 + r * Math.sin(a)},${200 - r * Math.cos(a)}`
  const dartPosition = (hit: Hit, dartIndex: number) => {
    if (hit.position && Number.isFinite(hit.position.x) && Number.isFinite(hit.position.y)) return hit.position
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
    const [inner, outer] = hit.ratio === 1 && hit.ring === 'outer-single' ? [112, 144] : radii[hit.ratio] || [112, 144]
    const radius = inner + (outer - inner) * (0.3 + (dartIndex % 2) * 0.35)
    return { x: 200 + radius * Math.sin(angle), y: 200 - radius * Math.cos(angle) }
  }
  const handleClick = (e: React.MouseEvent<SVGElement>, hit: Hit) => {
    if (disabled) return
    const matrix = e.currentTarget.ownerSVGElement?.getScreenCTM()
    if (!matrix) { onHit(hit); return }
    const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse())
    onHit({ ...hit, position: { x: point.x, y: point.y } })
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
          const hit: Hit = { base: n, ratio, ...(ratio === 1 ? { ring: j === 0 ? 'inner-single' : 'outer-single' } : {}) }
          const isActive = activeTarget === n || activeTarget === 'double' && ratio === 2 || activeTarget === 'triple' && ratio === 3
          const marks = cricketMarks?.[n] ?? 0
          const isMarked = marks > 0
          return <path key={j} role="button" tabIndex={disabled ? -1 : 0} aria-label={`${label(hit)}${hit.ring === 'outer-single' ? ' 外側シングル' : hit.ring === 'inner-single' ? ' 内側シングル' : ''}${isMarked ? ` · ${marks}マーク取得` : ''}`} onClick={e => handleClick(e, hit)} onKeyDown={e => handleKey(e, hit)} d={`M ${xy(inner, a)} L ${xy(outer, a)} A ${outer} ${outer} 0 0 1 ${xy(outer, b)} L ${xy(inner, b)} A ${inner} ${inner} 0 0 0 ${xy(inner, a)}`} fill={ratio === 1 ? (i % 2 ? '#d8d7d0' : '#25303e') : (i % 2 ? '#30b8a1' : '#ec6672')} stroke={isActive ? '#c4f36a' : isMarked ? '#c4f36a' : '#0b111a'} strokeWidth={isActive ? 2.6 : isMarked ? 2.1 : 1.5} style={isMarked ? { filter: `drop-shadow(0 0 ${2 + Math.min(marks, 3)}px #c4f36a${marks >= 3 ? 'cc' : '88'})` } : undefined} />
        })}
        <text x={200 + 181 * Math.sin(i * Math.PI / 10)} y={205 - 181 * Math.cos(i * Math.PI / 10)} textAnchor="middle" fill="#e3e9ed" fontSize="15">{n}</text>
      </g>
    })}
    {[{ r: 16, ratio: 1, color: '#30b8a1' }, { r: 8, ratio: 2, color: '#ec6672' }].map(b => { const marks = cricketMarks?.[25] ?? 0; const isMarked = marks > 0; return <circle key={b.ratio} cx="200" cy="200" r={b.r} fill={b.color} stroke={activeTarget === 'bull' || isMarked ? '#c4f36a' : 'none'} strokeWidth={activeTarget === 'bull' ? 3 : isMarked ? 2 : 0} style={isMarked ? { filter: `drop-shadow(0 0 ${2 + Math.min(marks, 3)}px #c4f36a${marks >= 3 ? 'cc' : '88'})` } : undefined} role="button" tabIndex={disabled ? -1 : 0} aria-label={`${b.ratio === 1 ? 'S-BULL' : 'D-BULL'}${isMarked ? ` · ${marks}マーク取得` : ''}`} onClick={e => handleClick(e, { base: 25, ratio: b.ratio })} onKeyDown={e => handleKey(e, { base: 25, ratio: b.ratio })} /> })}
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
  const videoOfferRetry = useRef<number | null>(null)
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
  const [googleDisplayName, setGoogleDisplayName] = useState<string | null>(null)
  const handleGoogleDisplayName = useCallback((nextName: string | null) => {
    setNames(currentNames => {
      const currentPlayerName = currentNames[0]
      if (currentPlayerName === 'PLAYER 1' || currentPlayerName === googleDisplayName) {
        return [nextName || 'PLAYER 1', ...currentNames.slice(1)]
      }
      return currentNames
    })
    setGoogleDisplayName(nextName)
  }, [googleDisplayName])
  const [initial, setInitial] = useState(501)
  const [outRule, setOutRule] = useState<OutRule>('master')
  const [matchBestOf, setMatchBestOf] = useState<3 | 5>(3)
  const [matchLeadRule, setMatchLeadRule] = useState<MatchLeadRule>('loser')
  const [bull, setBull] = useState<'fat' | 'split'>('fat')
  const [practiceTarget, setPracticeTarget] = useState(20)
  const [practiceMode, setPracticeMode] = useState<PracticeMode>('count-up')
  const [difficulty, setDifficulty] = useState<'EASY' | 'NORMAL' | 'HARD'>('NORMAL')
  const [roboGameMode, setRoboGameMode] = useState<'01' | 'cricket' | 'match'>('01')
  const [sound, setSound] = useState(true)
  const [manual, setManual] = useState(true)
  const [game, setGame] = useState<Game | null>(null)
  const [history, setHistory] = useState<Game[]>([])
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
  const [dismissedAward, setDismissedAward] = useState<string | null>(null)
  const awardPlaying = !!game?.award && game.award.id !== dismissedAward
  const awardPlayingRef = useRef(false); awardPlayingRef.current = awardPlaying
  useEffect(() => {
    const award = game?.award
    if (!award) return
    const timer = window.setTimeout(() => setDismissedAward(award.id), AWARD_DURATION)
    const context = audio.current
    if (context && soundRef.current && context.state === 'running') {
      ;[523,659,784,1047].forEach((frequency,index) => {
        const start = context.currentTime + index * .12
        const oscillator = context.createOscillator(), gain = context.createGain()
        oscillator.type = 'sine'; oscillator.frequency.value = frequency
        gain.gain.setValueAtTime(0,start); gain.gain.linearRampToValueAtTime(.065,start+.025); gain.gain.exponentialRampToValueAtTime(.001,start+.3)
        oscillator.connect(gain); gain.connect(context.destination); oscillator.start(start); oscillator.stop(start+.32)
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
      })
    }
    return () => window.clearTimeout(timer)
  }, [game?.award?.id])
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
      // The answerer must use the transceiver created by the remote offer.
      // Pre-creating one there leaves an unused sender with no negotiated MID.
      if (onlineSeatRef.current === 0) peer.addTransceiver('video', { direction: 'sendrecv' })
      peer.onicecandidate = event => {
        if (event.candidate) onlineSocket.current?.emit('match:signal', { type: 'candidate', candidate: event.candidate.toJSON() })
      }
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'connected') setVideoConnectionState('connected')
        else if (peer.connectionState === 'failed') setVideoConnectionState('failed')
        else if (peer.connectionState === 'connecting' || peer.connectionState === 'disconnected') setVideoConnectionState('connecting')
        else if (peer.connectionState === 'closed') setVideoConnectionState('idle')
      }
      peer.onicecandidateerror = event => {
        // ICE 701 is reported per server URL when that one endpoint cannot be
        // reached. Other TURN URLs may still work, so only the peer connection
        // state should decide whether the whole video connection failed.
        if (event.errorCode === 701) return
        setCameraError(`映像サーバーからエラーが返りました (ICE ${event.errorCode}${event.url ? ` · ${event.url}` : ''})`)
      }
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
  const requestVideoOffer = () => {
    if (onlineSeatRef.current !== 0 || videoOfferRetry.current !== null) return
    let attempts = 0
    const retry = () => {
      videoOfferRetry.current = null
      const peer = peerConnection.current
      if (!peer || peer.connectionState === 'closed') return
      if (peer.signalingState !== 'stable') {
        if (++attempts < 20) videoOfferRetry.current = window.setTimeout(retry, 250)
        else setCameraError('映像の再接続に失敗しました。もう一度カメラをオンにしてください。')
        return
      }
      void makeVideoOffer().catch(cause => setCameraError(cause instanceof Error ? `映像の再接続に失敗しました: ${cause.message}` : '映像の再接続に失敗しました。'))
    }
    videoOfferRetry.current = window.setTimeout(retry, 100)
  }
  const closeVideo = () => {
    if (videoOfferRetry.current !== null) window.clearTimeout(videoOfferRetry.current)
    videoOfferRetry.current = null
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
      const videoTransceivers = peer.getTransceivers().filter(item => item.receiver.track.kind === 'video')
      const transceiver = videoTransceivers.find(item => item.mid !== null) || videoTransceivers[0]
      if (transceiver) await transceiver.sender.replaceTrack(track)
      else peer.addTrack(track, stream)
      localStreamRef.current = stream
      setLocalStream(stream)
      if (onlineSeatRef.current === 0) requestVideoOffer()
      else onlineSocket.current?.emit('match:action', { type: 'video-offer' })
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
    let resolved = onlineStatus === 'matched' && next.mode === 'match' && next.match?.stage === 'cork'
      ? resolveMatchCoinToss(next, Math.random() < 0.5 ? 0 : 1)
      : next
    const completedOnlineTurn = onlineSeatRef.current === 0 && (resolved.throws.length === 3 || resolved.bust)
    if (completedOnlineTurn && !resolved.finished) {
      const award = resolved.award
      resolved = { ...nextTurn(resolved), award }
    }
    if (resolved === previous) return
    gameRef.current = resolved; setHistory(items => resolved.ratingResults.length > previous.ratingResults.length ? [] : [...items, previous]); setGame(resolved)
    if (onlineSeatRef.current === 0) onlineSocket.current?.emit('match:state', resolved)
    if (hit) playSound(hit)
  }, [onlineStatus, playSound, onlineSeat])
  const apply = useCallback((action: 'next' | Hit) => {
    const previous = gameRef.current
    if (!previous || previous.finished || awardPlayingRef.current) return
    if (onlineStatus === 'matched' && previous.active !== onlineSeat) return
    if (onlineStatus === 'matched' && onlineSeat === 1) {
      onlineSocket.current?.emit('match:action', { type: 'throw', action: action === 'next' ? { type: 'next' } : action })
      return
    }
    const next = action === 'next' ? nextTurn(previous) : previous.mode === 'match' && previous.match?.stage === 'cork' ? throwCork(previous, action) : throwDart(previous, action)
    commitGame(previous, next, action === 'next' ? undefined : action)
  }, [commitGame, onlineSeat, onlineStatus])
  const requestMatchDecision = (type: 'first' | 'choose' | 'select-game' | 'cork-winner', value: 'first' | 'game' | '01' | 'cricket' | number) => {
    if (!game || awardPlayingRef.current) return
    if (isRoboGame(game) && game.active === 1) return
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
  const receive = useCallback((signal: BoardSignal) => {
    const previous = gameRef.current
    const result = receiveBoardSignal(previous, signal)
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
          const videoTransceiver = peer.getTransceivers().find(item => item.mid !== null && item.receiver.track.kind === 'video')
          if (videoTransceiver) {
            videoTransceiver.direction = 'sendrecv'
            const localTrack = localStreamRef.current?.getVideoTracks()[0]
            if (localTrack) await videoTransceiver.sender.replaceTrack(localTrack)
          }
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
    socket.on('match:action', (request: { type: 'throw' | 'decision' | 'video-offer'; action?: Hit | { type: 'next' }; decision?: 'first' | 'choose' | 'select-game' | 'cork-winner'; value?: 'first' | 'game' | '01' | 'cricket' | number; seat: number }) => {
      if (request.type === 'video-offer') {
        requestVideoOffer()
        return
      }
      const previous = gameRef.current
      if (!previous || previous.finished || previous.active !== request.seat || awardPlayingRef.current) return
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
    if (awardPlaying || !game || !isRoboGame(game) || game.active !== 1 || game.finished || game.bust || game.throws.length >= 3 || game.match?.stage === 'cork-tie') return
    const timer = window.setTimeout(() => {
      const previous = gameRef.current
      if (!previous || !isRoboGame(previous) || previous.active !== 1 || previous.finished || previous.match?.stage === 'cork-tie') return
      if (previous.mode === 'match' && previous.match?.stage === 'choice') {
        const next = previous.match.choiceAs === null
          ? chooseMatchFirst(previous, Math.random() < 0.5 ? 'first' : 'game')
          : chooseMatchGame(previous, Math.random() < 0.5 ? '01' : 'cricket', previous.match.initial)
        commitGame(previous, next)
        return
      }
      if (previous.mode === 'match' && previous.match?.stage === 'cork') {
        const hit: Hit = { base: 25, ratio: Math.random() < 0.55 ? 2 : 1 }
        commitGame(previous, throwCork(previous, hit))
        return
      }
      if (previous.bust || previous.throws.length >= 3) return
      const level = difficulty === 'HARD' ? 0.68 : difficulty === 'NORMAL' ? 0.43 : 0.2
      const cricket = previous.mode === 'cricket' || (previous.mode === 'match' || previous.mode === 'robo') && previous.legMode === 'cricket'
      const own = previous.players[1], opponent = previous.players[0]
      const target = cricket
        ? targets.find(number => (own.marks[number] || 0) < 3 || (opponent.marks[number] || 0) < 3 && own.score < opponent.score) ?? 20
        : 20
      const canHit = Math.random() < level
      const ratio = target === 25 ? (Math.random() < level ? 2 : 1) : Math.random() < level * .55 ? 3 : Math.random() < .72 ? 2 : 1
      const aim = roboAim(previous)
      const hit: Hit = cricket
        ? canHit ? { base: target, ratio } : { base: 0, ratio: 1 }
        : canHit ? aim : { base: [19, 18, 17, 16, 15, 12, 5][Math.floor(Math.random() * 7)], ratio: 1 }
      if (hit.base !== 0 && hit.base !== 25 && hit.ratio === 1) hit.ring = Math.random() < .5 ? 'inner-single' : 'outer-single'
      commitGame(previous, throwDart(previous, hit), hit)
    }, game.throws.length ? 1100 : 900)
    return () => window.clearTimeout(timer)
  }, [game, difficulty, commitGame, awardPlaying])
  useEffect(() => {
    if (onlineStatus === 'matched' || awardPlaying || !game || game.finished || game.mode === 'match' && game.match?.stage !== 'playing') return
    if ((!game.bust && game.throws.length !== 3) || autoChangedTurn.current === game) return
    const completedTurn = game
    const timer = window.setTimeout(() => {
      const current = gameRef.current
      if (current !== completedTurn || current.finished || current.mode === 'match' && current.match?.stage !== 'playing') return
      autoChangedTurn.current = completedTurn
      const changed = nextTurn(current)
      commitGame(current, changed)
    }, game.award ? 180 : isRoboGame(game) && game.active === 1 ? 1600 : game.bust ? 700 : 650)
    return () => window.clearTimeout(timer)
  }, [game, onlineStatus, onlineSeat, commitGame, awardPlaying])

  const connect = async () => {
    if (!('bluetooth' in navigator)) { setError('BluetoothはChrome / Edgeで、localhostまたはHTTPSから利用できます。'); return }
    setConnecting(true); setError('')
    try {
      unsubscribe.current?.(); unsubscribe.current = null
      if (!await connector.current!.connect()) { setError('接続できませんでした。ボードの電源と接続状態をご確認ください。'); return }
      unsubscribe.current = await connector.current!.subscribe(receive)
      setManual(false); setConnected(true)
    } catch (cause) { connector.current?.disconnect(); setConnected(false); setError(cause instanceof Error ? cause.message : '接続に失敗しました') }
    finally { setConnecting(false) }
  }
  useEffect(() => { if (!connected) setManual(true) }, [connected])
  const disconnect = () => { unsubscribe.current?.(); unsubscribe.current = null; connector.current?.disconnect(); setConnected(false); setManual(true) }
  const selectMode = (next: Mode) => {
    setMode(next); setScreen('setup'); setError('')
    setCount(next === 'practice' || next === 'robo' ? 1 : 2)
    setInitial(next === '01' ? 701 : 501)
  }
  const start = () => {
    if (mode === 'match' && count < 2) return
    try { if (!audio.current) audio.current = new AudioContext() } catch { /* Sound is optional. */ }
    void audio.current?.resume().catch(() => {})
    const players = mode === 'robo' ? [names[0], `ROBO · ${difficulty}`] : names.slice(0, count)
    const gameMode = mode === 'robo' && roboGameMode === 'match' ? 'match' : mode
    const next = createGame(gameMode, players, initial, bull, outRule, practiceTarget, matchBestOf, matchLeadRule, roboGameMode === 'cricket' ? 'cricket' : '01', practiceMode)
    if (gameMode !== mode) setMode(gameMode)
    gameRef.current = next; setGame(next); setHistory([]); setScreen('game')
  }
  const goHome = () => { if (screen === 'game' && game && !game.finished && !window.confirm('ゲームを終了してホームに戻りますか？')) return; if (onlineStatus === 'matched') { onlineSocket.current?.disconnect(); onlineSocket.current = null; closeVideo(); setOnlineStatus('offline'); setOnlineSeat(null); onlineSeatRef.current = null }; gameRef.current = null; setGame(null); setHistory([]); setScreen('home') }
  const undo = () => { const previous = history.at(-1); if (!previous) return; gameRef.current = previous; setGame(previous); setHistory(items => items.slice(0, -1)) }

  return <main className="app-shell">
    {awardPlaying && game?.award && <AwardMovie key={game.award.id} award={game.award} onSkip={() => setDismissedAward(game.award!.id)}/>}
    <header className="topbar">
      <button className="wordmark" onClick={goHome}><span className="mark">D</span><span>DARTS<small>ROOM</small></span></button>
      <div className="board-status"><span className={`status-dot ${connected ? 'online' : ''}`} /><span>{connected ? 'DARTSLIVE HOME 接続中' : 'ボード未接続'}</span><button className="connect-button" disabled={connecting} onClick={connected ? disconnect : connect}>{connecting ? '接続中…' : connected ? '切断' : 'Bluetooth接続'}</button></div>
    </header>
    {error && <div className="error-banner" role="alert">{error}<button onClick={() => setError('')}>閉じる</button></div>}

    {screen === 'home' && <>
      <section className="mode-section lobby"><div className="section-heading"><div><span className="kicker">DARTS ROOM / PLAY</span><h1>GAME SELECT</h1></div><p>ゲームを選んでスタート</p></div>
        <div className="game-grid">{modes.map(item => <button key={item.id} className={`game-card ${item.accent}`} disabled={onlineStatus === 'connecting' || onlineStatus === 'searching'} onClick={() => selectMode(item.id)}><span className="card-icon">{item.icon}</span><span className="card-arrow">↗</span><span className="card-copy"><strong>{item.title}</strong><small>{item.subtitle}</small></span></button>)}
          <button className="game-card online-card" onClick={() => onlineStatus === 'searching' ? findOnlineOpponent() : setOnlineSelectionOpen(open => !open)} disabled={onlineStatus === 'connecting'} aria-expanded={onlineSelectionOpen} aria-label={onlineStatus === 'searching' ? 'オンライン対戦をキャンセル' : 'オンライン対戦のゲームモードを選ぶ'}><span className="card-icon">◎</span><span className="card-arrow">{onlineStatus === 'searching' ? '×' : '↗'}</span><span className="card-copy"><strong>ONLINE MATCH</strong><small>{onlineStatus === 'connecting' ? 'サーバーに接続中…' : onlineStatus === 'searching' ? '対戦相手を検索中 · タップでキャンセル' : onlineSelectionOpen ? 'ゲームモードを選択してください' : '01・CR・MATCH・RANDOM'}</small></span></button>
        </div>
        {onlineSelectionOpen && <div className="online-mode-panel">
          <div className="online-mode-heading"><div><strong>オンライン対戦モード</strong><small>01・CR・MATCHは同じ種目の相手と対戦。RANDOMならどの種目でも対戦できます。</small></div></div>
          <div className="online-mode-options" role="group" aria-label="オンライン対戦モード">
            {([{ id: '01', title: '01', detail: 'ゼロワン' }, { id: 'cricket', title: 'CR', detail: 'クリケット' }, { id: 'match', title: 'MATCH', detail: 'メドレー' }, { id: 'random', title: 'RANDOM', detail: 'どのモードともマッチ' }] as const).map(option => <button key={option.id} className={onlineMode === option.id ? 'chosen' : ''} aria-pressed={onlineMode === option.id} disabled={onlineStatus === 'connecting' || onlineStatus === 'searching'} onClick={() => setOnlineMode(option.id)}><strong>{option.title}</strong><small>{option.detail}</small></button>)}
          </div>
          <button className="online-search-button" onClick={findOnlineOpponent} disabled={onlineStatus === 'connecting'}>{onlineStatus === 'searching' ? '検索をキャンセル' : onlineStatus === 'connecting' ? '接続中…' : '対戦相手を検索'} <span>→</span></button>
        </div>}
      </section>
    </>}
    <div hidden={screen !== 'home' && !game?.finished}><AccountPanel game={game} seat={onlineSeat} onDisplayName={handleGoogleDisplayName} /></div>

    {screen === 'setup' && <section className="setup-view">
      <button className="back-link" onClick={() => setScreen('home')}>← <span>ゲーム選択へ戻る</span></button>
      <div className="setup-layout"><div className="setup-main"><div className={`mode-emblem ${modeInfo.accent}`}>{modeInfo.icon}</div><div className="kicker">GAME SETUP</div><h1>{modeInfo.title}</h1><p className="setup-description">{modeInfo.subtitle}</p>
        {mode === 'practice' ? <><div className="setup-block"><h2>プレイヤー</h2><div className="segmented player-count">{[1,2,3,4].map(n=><button className={count===n?'chosen':''} key={n} onClick={()=>setCount(n)}>{n}<small>人</small></button>)}</div>{names.slice(0,count).map((name,i)=><label className="player-name" key={i}><span>P{i+1}</span><input aria-label={`プレイヤー${i+1}`} value={name} maxLength={20} onChange={e=>setNames(old=>old.map((v,j)=>i===j?e.target.value:v))}/></label>)}</div><div className="setup-block"><h2>練習メニュー</h2><div className="practice-mode-grid">{([{id:'count-up',label:'COUNT-UP',detail:'8ラウンドで合計点'}, {id:'cricket-count-up',label:'CRICKET COUNT-UP',detail:'20〜15・BULLを順に狙う'}, {id:'eagles-eye',label:"EAGLE’S EYE",detail:'BULLだけが得点'}, {id:'half-it',label:'HALF-IT',detail:'外すと得点が半分'}, {id:'shoot-out',label:'SHOOT OUT',detail:'数字を開けて倍率アップ'}, {id:'target',label:'TARGET PRACTICE',detail:'狙う数字を自由に練習'}] as const).map(item => <button key={item.id} className={practiceMode===item.id?'chosen':''} onClick={()=>setPracticeMode(item.id)}><strong>{item.label}</strong><small>{item.detail}</small></button>)}</div></div>{practiceMode === 'target' && <div className="setup-block"><h2>練習するナンバー</h2><div className="target-select">{[20,19,18,17,16,15,25].map(target => <button className={practiceTarget===target?'chosen':''} key={target} onClick={() => setPracticeTarget(target)}>{target===25?'BULL':target}</button>)}</div><p className="setup-hint">狙ったナンバーの命中回数と命中率を記録します。</p></div>}</> : <>
          {mode === 'robo' && <div className="setup-block"><h2>ゲーム</h2><div className="segmented"><button className={roboGameMode==='01'?'chosen':''} onClick={() => setRoboGameMode('01')}>01</button><button className={roboGameMode==='cricket'?'chosen':''} onClick={() => setRoboGameMode('cricket')}>CRICKET</button><button className={roboGameMode==='match'?'chosen':''} onClick={() => setRoboGameMode('match')}>MATCH</button></div></div>}
          {(mode === '01' || mode === 'match' || mode === 'robo' && (roboGameMode === '01' || roboGameMode === 'match')) && <div className="setup-block"><h2>スタートスコア</h2><div className="segmented score-options">{(mode === '01' ? [301,501,701,901,1101,1501] : [301,501,701,901]).map(score => <button className={initial===score?'chosen':''} key={score} onClick={() => setInitial(score)}>{score}</button>)}</div></div>}
          {(mode === '01' || mode === 'match' || mode === 'robo' && (roboGameMode === '01' || roboGameMode === 'match')) && <div className="setup-block"><h2>上がり方</h2><div className="segmented"><button className={outRule==='master'?'chosen':''} onClick={() => setOutRule('master')}>MASTER OUT</button><button className={outRule==='double'?'chosen':''} onClick={() => setOutRule('double')}>DOUBLE OUT</button><button className={outRule==='open'?'chosen':''} onClick={() => setOutRule('open')}>OPEN OUT</button></div></div>}
          {(mode === 'match' || mode === 'robo' && roboGameMode === 'match') && <><div className="setup-block"><h2>メドレー</h2><div className="segmented"><button className={matchBestOf===3?'chosen':''} onClick={() => setMatchBestOf(3)}>BEST OF 3 <small>01 · CR · CH</small></button><button className={matchBestOf===5?'chosen':''} onClick={() => setMatchBestOf(5)}>BEST OF 5 <small>01 · CR · CR · 01 · CH</small></button></div><p className="setup-hint">必要勝利数に先に達した時点で終了します。</p></div><div className="setup-block"><h2>2レグ目以降の先攻</h2><div className="segmented"><button className={matchLeadRule==='loser'?'chosen':''} onClick={() => setMatchLeadRule('loser')}>LOSER · 前レグの敗者</button><button className={matchLeadRule==='alternate'?'chosen':''} onClick={() => setMatchLeadRule('alternate')}>ALTERNATE · 交互</button></div></div></>}
          {mode !== 'robo' && <div className="setup-block"><h2>プレイヤー</h2><div className="segmented player-count">{(mode === 'match' ? [2] : [1,2,3,4]).map(n=><button className={count===n?'chosen':''} key={n} onClick={() => setCount(n)}>{n}<small>人</small></button>)}</div>{names.slice(0,count).map((name,i)=><label className="player-name" key={i}><span>P{i+1}</span><input aria-label={`プレイヤー${i+1}`} value={name} maxLength={20} onChange={e=>setNames(old=>old.map((v,j)=>i===j?e.target.value:v))}/></label>)}{mode==='cricket'&&count===1&&<p className="setup-hint">15〜20とBULLをすべてクローズすると終了します。ラウンド制限はありません。</p>}</div>}
          {mode === 'robo' && <div className="setup-block"><h2>CPUレベル</h2><div className="segmented">{(['EASY','NORMAL','HARD'] as const).map(level=><button className={difficulty===level?'chosen':''} key={level} onClick={()=>setDifficulty(level)}>{level}</button>)}</div></div>}
          {(mode !== 'cricket' && !(mode === 'robo' && roboGameMode === 'cricket')) && <div className="setup-block"><h2>ブル</h2><div className="segmented"><button className={bull==='fat'?'chosen':''} onClick={()=>setBull('fat')}>FAT BULL · 50</button><button className={bull==='split'?'chosen':''} onClick={()=>setBull('split')}>SEPARATE · 25 / 50</button></div></div>}
        </>}
        {mode === 'match' && count<2 && <p className="setup-hint">MATCHは2人以上でプレイします。</p>}
        <button className="primary-button" disabled={mode==='match'&&count<2} onClick={start}>{mode==='practice'?'練習をはじめる':'ゲームをはじめる'} <span>→</span></button>
      </div><aside className="setup-aside"><div className="aside-label">{mode==='robo'?'VS COMPUTER':mode==='practice'?practiceModeTitle[practiceMode]:mode==='cricket'?'CRICKET':mode==='match'?'MATCH MEDLEY':'01 GAME'}</div><div className="aside-number">{mode==='practice'?practiceMode==='target'?(practiceTarget===25?'BULL':practiceTarget):practiceMode==='count-up'?'8 R':practiceMode==='cricket-count-up'?'CR':practiceMode==='eagles-eye'?'BULL':practiceMode==='half-it'?'40':'×1':mode==='cricket'||mode==='robo'&&roboGameMode==='cricket'?'CR':initial}</div><div className="aside-rule">{mode==='cricket'?'15 · 16 · 17 · 18 · 19 · 20 · BULL':mode==='practice'?practiceMode==='target'?'狙った数字を何度でも練習':practiceMode==='count-up'?'8ラウンド × 3本 · 合計スコア':practiceMode==='cricket-count-up'?'20 · 19 · 18 · 17 · 16 · 15 · BULL':practiceMode==='eagles-eye'?'BULLのみ加点 · 8ラウンド':practiceMode==='half-it'?'40点スタート · 外したラウンドで半減': '20ナンバーを一度ずつ · BULLボーナス':mode==='robo'?`YOU  VS  ROBO · ${difficulty} · ${roboGameMode==='match'?'MATCH':roboGameMode==='cricket'?'CRICKET':'01'}`:mode==='match'?`BEST OF ${matchBestOf} · ${matchBestOf===3?'01 · CR · CH':'01 · CR · CR · 01 · CH'}`:`15 ROUNDS · ${outRule.toUpperCase()}`}</div><div className="aside-board"><Board onHit={()=>{}} disabled /></div></aside></div>
    </section>}

    {screen === 'game' && onlineStatus === 'matched' && !game && <section className="game-view online-waiting"><span className="kicker">RANDOM MATCH</span><h1>対戦相手と接続中</h1><p>ゲーム情報を同期しています…</p></section>}
    {screen === 'game' && game && <section className="game-view">
      <div className="game-toolbar"><button className="back-link" onClick={goHome}>← ホーム</button><div className="game-label"><span className={`mini-dot ${modeInfo.accent}`} />{mode === 'practice' ? practiceModeTitle[game.practiceMode] : modeInfo.title}{onlineStatus === 'matched' ? ' · ONLINE' : isRoboGame(game) || mode === 'robo' ? ' · CPU対戦' : ''}</div><div className="game-round">{mode === 'practice' ? game.practiceMode === 'target' ? 'FREE PRACTICE' : `ROUND ${game.round} / ${game.limit}` : mode === 'match' ? `LEG ${game.match!.legIndex + 1} / ${game.match!.bestOf} · ${game.match!.legWins[0]} - ${game.match!.legWins[1]}` : `ROUND ${game.round}${game.limit ? ` / ${game.limit}` : ''}`}</div></div>
      {onlineStatus === 'matched' && <div className="match-video-panel">
        <div className="match-video-feeds">
          <div className="match-video-feed"><div className="match-video-frame">{localStream ? <video ref={localVideo} autoPlay playsInline muted /> : <span>あなたのカメラはオフです</span>}<small>YOU</small></div></div>
          <div className="match-video-feed"><div className="match-video-frame">{remoteStream && remoteVideoActive ? <video ref={remoteVideo} autoPlay playsInline muted /> : <span>{videoConnectionState === 'failed' ? '映像接続に失敗しました · 別のネットワークをお試しください' : videoConnectionState !== 'connected' ? '相手と映像を接続中…' : remoteStream ? '相手のカメラはオフです' : '相手のカメラを待っています'}</span>}<small>OPPONENT</small></div></div>
        </div>
        <div className="match-video-controls"><button onClick={() => void toggleCamera()}>{localStream ? 'カメラをオフ' : 'カメラをオン'}</button><small>映像のみ共有 · マイク音声は送信しません</small><small className={relayConfigured ? 'relay-ready' : 'relay-missing'}>{relayConfigured ? 'TURN設定あり · 接続経路は未確認' : 'TURN中継なし · ネットワークによって映像がつながらない場合があります'}</small></div>
        {cameraError && <p className="match-video-error" role="status">{cameraError}</p>}
      </div>}
      {!game.finished && <div className="score-strip">{game.players.map((p, i) => <article key={i} className={`score-card ${game.active === i ? 'active' : ''}`}><div><span>P{i + 1}</span><strong>{p.name}</strong>{onlineStatus === 'matched' && i === onlineSeat && <small className="you-tag">あなた</small>}{isRoboGame(game) && i === 1 && <small className="cpu-tag">CPU</small>}</div><b>{isX01Game(game) ? p.score : mode === 'practice' ? game.practiceMode === 'target' ? `${game.practiceHits} / ${p.darts}` : p.score : p.score}</b><small>{mode === 'match' ? `MATCH LEGS ${game.match!.legWins[i]}` : mode === 'cricket' || (game.mode === 'match' || game.mode === 'robo') && game.legMode === 'cricket' ? `${targets.reduce((sum, t) => sum + (p.marks[t] || 0), 0)} MARKS` : mode === 'practice' ? game.practiceMode === 'target' || game.practiceMode === 'eagles-eye' ? `命中率 ${p.darts ? Math.round(game.practiceHits / p.darts * 100) : 0}%` : `AVG ${p.darts ? (p.points / p.darts).toFixed(1) : '—'} / DART` : `PPD ${p.darts ? (p.points / p.darts).toFixed(1) : '—'}`}</small></article>)}</div>}
      {game.finished ? <><GameResults game={game}/><div className="finish-card">{onlineStatus !== 'matched' && <button className="primary-button" onClick={() => { if (isRoboGame(game)) setMode('robo'); gameRef.current = null; setGame(null); setHistory([]); setScreen('setup') }}>同じ設定でもう一度 <span>↻</span></button>}<button className="primary-button" onClick={goHome}>ホームへ戻る <span>→</span></button></div></> : <div className="play-layout">
        <div className="turn-panel">
          <div className="turn-player">{onlineStatus === 'matched' && <strong className="online-turn-owner">{game.active === onlineSeat ? 'あなたの番' : '相手の番'} · </strong>}{mode === 'match' ? game.match!.stage === 'cork' ? `CORK · ${activePlayer?.name} の番` : game.match!.stage === 'cork-tie' ? 'CORK · 近いダーツを選択' : game.match!.stage === 'choice' ? `${game.players[game.active].name} · CHOICE` : `LEG ${game.match!.legIndex + 1} · ${activePlayer?.name}` : `P${game.active + 1} · ${activePlayer?.name}${(mode === 'robo' || isRoboGame(game)) && game.active === 1 ? ' · CPUのターン' : ''}`}</div>
          <div className="main-score">{mode === 'match' && game.match!.stage === 'cork' ? 'CORK' : mode === 'match' && game.match!.stage === 'cork-tie' ? 'TIE' : mode === 'match' && game.match!.stage === 'choice' ? 'CH' : isX01Game(game) ? activePlayer?.score : mode === 'practice' ? game.practiceMode === 'target' ? `${game.practiceHits}` : activePlayer?.score : activePlayer?.score}</div>
          {mode === 'practice' && <p className="practice-focus">{game.practiceMode === 'half-it' ? 'THIS ROUND' : game.practiceMode === 'shoot-out' ? 'MULTIPLIER' : 'TARGET'} <strong>{practiceTargetForRound(game)}</strong>{game.practiceMode === 'shoot-out' && <small className="practice-progress"> · {game.practiceOpened.filter(n => n !== 25).length}/20 NUMBERS</small>}</p>}
            {mode === 'match' && game.match!.stage === 'choice' ? <div className="match-decision">{isRoboGame(game) && game.active === 1 ? <p className="bot-thinking">ROBO THINKING<span>···</span></p> : game.match!.choiceAs === null ? <><p>{onlineStatus === 'matched' ? 'コイントスの勝者' : 'コークの勝者'}が選びます。先攻を取るか、ゲーム選択権を取ってください。</p><button disabled={onlineStatus === 'matched' && game.active !== onlineSeat} onClick={() => requestMatchDecision('first', 'first')}>先攻を取る</button><button disabled={onlineStatus === 'matched' && game.active !== onlineSeat} onClick={() => requestMatchDecision('choose', 'game')}>ゲームを選ぶ</button></> : <><p>{game.players[game.active].name} がCHのゲームを選択</p><button disabled={onlineStatus === 'matched' && game.active !== onlineSeat} onClick={() => requestMatchDecision('select-game', '01')}>01を選ぶ</button><button disabled={onlineStatus === 'matched' && game.active !== onlineSeat} onClick={() => requestMatchDecision('select-game', 'cricket')}>CRICKETを選ぶ</button></>}</div> : mode === 'match' && game.match!.stage === 'cork-tie' ? <div className="match-decision"><p>同じエリアに入っています。実際に中心に近い方を選んでください。</p>{game.players.map((p, i) => <button key={i} disabled={onlineStatus === 'matched' && game.active !== onlineSeat} onClick={() => requestMatchDecision('cork-winner', i)}>{p.name} のダーツが近い</button>)}</div> : <>
            <div className="throw-message" aria-live="polite">{game.message}</div>
            <div className="dart-slots">{(mode === 'match' && game.match!.stage === 'cork' ? [0, 1] : [0, 1, 2]).map(i => <div key={i}><small>{mode === 'match' && game.match!.stage === 'cork' ? `CORK · ${game.players[i].name}` : `DART ${i + 1}`}</small><b>{mode === 'match' && game.match!.stage === 'cork' ? game.match!.corkThrows[i] ? label(game.match!.corkThrows[i]) : '—' : game.throws[i] ? label(game.throws[i]) : '—'}</b></div>)}</div>
            {mode === 'match' && game.match!.stage === 'cork' ? isRoboGame(game) && game.active === 1 ? <p className="bot-thinking">ROBO THINKING<span>···</span></p> : <div className="play-controls">{onlineStatus !== 'matched' && <button onClick={undo} disabled={!history.length}>↶ 取り消す</button>}<label><input type="checkbox" checked={manual} onChange={e => setManual(e.target.checked)} />ボードを画面入力</label></div> : game.bust || game.throws.length === 3 ? <p className="auto-change-message" aria-live="polite">{game.bust ? 'BUST · 次のプレイヤーへ' : '3本投げ終わり · 次のプレイヤーへ'}</p> : (!isRoboGame(game) || game.active === 0) ? <><button className="primary-button next-turn" disabled={onlineStatus === 'matched' && game.active !== onlineSeat} onClick={() => apply('next')}>ターンを終了 <span>→</span></button><div className="play-controls">{onlineStatus !== 'matched' && <button onClick={undo} disabled={!history.length}>↶ 取り消す</button>}<button onClick={() => apply({ base: 0, ratio: 1 })} disabled={game.throws.length >= 3 || game.bust || onlineStatus === 'matched' && game.active !== onlineSeat}>MISS</button><label><input type="checkbox" checked={manual} onChange={e => setManual(e.target.checked)} />ボードを画面入力</label></div></> : isRoboGame(game) && game.active === 1 ? <p className="bot-thinking">ROBO THINKING<span>···</span></p> : null}
            <p className="board-hint">{mode === 'match' && game.match!.stage === 'cork' ? '1本ずつ中心を狙います。エリアが同じ場合は近い方を選択。' : connected ? 'Bluetoothボードの命中を待っています' : 'Bluetooth接続または画面のボード入力でプレイ'}</p>
          </>}
        </div>
        <div className="board-wrap">{(mode === 'cricket' || (mode === 'match' || mode === 'robo') && game.legMode === 'cricket') && <table className="cricket-score"><thead><tr><th>NUMBER</th>{game.players.map((p, i) => <th key={i}>{p.name}</th>)}</tr></thead><tbody>{targets.map(t => <tr key={t}><th>{t === 25 ? 'BULL' : t}</th>{game.players.map((p, i) => <td className={(p.marks[t] || 0) >= 3 ? 'closed' : ''} key={i}>{['·', '/', '×', '⊗'][Math.min(3, p.marks[t] || 0)]}</td>)}</tr>)}</tbody></table>}<div className="board-title"><span>{mode === 'match' && game.match!.stage === 'choice' ? onlineStatus === 'matched' ? 'COIN TOSS / CHOICE' : 'CORK / CHOICE' : mode === 'match' && game.match!.stage !== 'playing' ? 'CORK / CHOICE' : 'BOARD'}</span>{manual && <small>クリックで入力</small>}</div><Board onHit={hit => apply(hit)} disabled={!manual || (mode === 'robo' || isRoboGame(game)) && game.active === 1 || onlineStatus === 'matched' && game.active !== onlineSeat || game.throws.length >= 3 || game.bust || mode === 'match' && (game.match!.stage === 'choice' || game.match!.stage === 'cork-tie')} activeTarget={mode === 'practice' ? practiceBoardTarget(game) : undefined} cricketMarks={mode === 'cricket' || (mode === 'match' || mode === 'robo') && game.legMode === 'cricket' ? game.players[game.active]?.marks : undefined} darts={mode === 'match' && game.match?.stage === 'cork' ? game.match.corkThrows : game.throws}/></div>
      </div>}
    </section>}
    <footer className="app-footer"><span>DARTS ROOM</span><a href="/privacy" target="_blank" rel="noreferrer">プライバシー</a><span>{onlineStatus === 'matched' ? 'ONLINE MATCH' : 'HOME BOARD COMPANION'}</span></footer>
  </main>
}
