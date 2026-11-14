'use client'

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { gameDetails, label, type Game, type GameThrowRecord } from '../lib/game'
import { ratingEstimate, summarizeRating, type SavedResult } from '../lib/rating'

declare global {
  interface Window {
    dartsRoomDesktop?: {
      isDesktop: true
      openGoogleAuth: (url: string) => Promise<{ ok: boolean; error?: string }>
      onAuthCallback: (callback: (code: string) => void) => () => void
    }
  }
}

type PendingResult = SavedResult & { user_id: string }
const localDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const dateFromKey = (key: string) => new Date(`${key}T12:00:00`)
const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

export function AccountPanel({ game, seat, onDisplayName, cameraAutoStart, onCameraAutoStart }: { game: Game | null; seat: number | null; onDisplayName: (name: string | null) => void; cameraAutoStart: boolean; onCameraAutoStart: (enabled: boolean) => void }) {
  const [client, setClient] = useState<SupabaseClient | null>(null)
  const [ready, setReady] = useState(false)
  const [googleEnabled, setGoogleEnabled] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [results, setResults] = useState<SavedResult[]>([])
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [loginBusy, setLoginBusy] = useState(false)
  const [queue, setQueue] = useState<{ userId: string | null; rows: PendingResult[] }>({ userId: null, rows: [] })
  const [selectedDay, setSelectedDay] = useState('')
  const [visibleMonth, setVisibleMonth] = useState('')
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null)
  const [selectedLegGameId, setSelectedLegGameId] = useState<string | null>(null)
  const owners = useRef(new Map<string, { userId: string | null; seat: number }>())
  const saved = useRef(new Set<string>())

  useEffect(() => {
    const today = new Date()
    setSelectedDay(localDateKey(today))
    setVisibleMonth(monthKey(today))
  }, [])

  useEffect(() => {
    let live = true
    const authError = new URLSearchParams(window.location.hash.slice(1)).get('error_description') || new URLSearchParams(window.location.search).get('error_description')
    if (authError) setError(`Googleログインに失敗しました: ${authError}`)
    void fetch('/api/auth-config').then(response => {
      if (!response.ok) throw new Error('ログイン設定を取得できませんでした。')
      return response.json()
    }).then(config => {
      if (live && config.configured) {
        const desktop = window.dartsRoomDesktop?.isDesktop === true
        setClient(createClient(config.url, config.key, desktop ? { auth: { flowType: 'pkce' } } : undefined)); setGoogleEnabled(config.googleEnabled === true)
        if (config.providerCheckFailed) setError('Google認証の設定を確認できませんでした。ページを再読み込みしてください。')
      }
      if (live && !config.configured) setReady(true)
    }).catch(cause => { if (live) { setError(String(cause.message)); setReady(true) } })
    return () => { live = false }
  }, [])
  useEffect(() => {
    if (!client) return
    const { data } = client.auth.onAuthStateChange((_event, session) => { setUser(session?.user ?? null); setReady(true) })
    return () => data.subscription.unsubscribe()
  }, [client])
  useEffect(() => {
    if (!client || !window.dartsRoomDesktop?.isDesktop) return
    return window.dartsRoomDesktop.onAuthCallback((code) => {
      void client.auth.exchangeCodeForSession(code).then(({ error: cause }) => {
        if (cause) setError(`Googleログインを完了できませんでした: ${cause.message}`)
        else setError('')
        setLoginBusy(false)
      })
    })
  }, [client])
  useEffect(() => {
    const name = user?.user_metadata.full_name || user?.user_metadata.name || null
    onDisplayName(typeof name === 'string' && name.trim() ? name.trim().slice(0, 20) : null)
  }, [user?.id, user?.user_metadata.full_name, user?.user_metadata.name, onDisplayName])
  useEffect(() => {
    if (game && !owners.current.has(game.id)) owners.current.set(game.id, { userId: ready ? user?.id ?? null : null, seat: seat ?? 0 })
  }, [game, ready, user?.id, seat])
  useEffect(() => {
    setResults([])
    if (!client || !user) return
    let live = true
    void client.from('darts_game_results').select('game_id,mode,stats,stats_100,score,won,eligible,created_at,details').eq('user_id', user.id).order('created_at', { ascending: false }).order('game_id', { ascending: false }).limit(1000).then(({ data, error: cause }) => {
      if (!live) return
      if (cause) setError(`成績を読み込めませんでした: ${cause.message}`)
      else { setResults((data ?? []) as SavedResult[]); setError('') }
    })
    return () => { live = false }
  }, [client, user?.id, refresh])
  useEffect(() => {
    if (!user) { setQueue({ userId: null, rows: [] }); return }
    try {
      const stored = JSON.parse(localStorage.getItem(`darts-results:${user.id}`) || '[]')
      const rows = Array.isArray(stored) ? stored.filter(row => row.user_id === user.id && typeof row.game_id === 'string' && ['01', 'cricket', 'count-up'].includes(row.mode) && Number.isFinite(row.stats)) : []
      setQueue({ userId: user.id, rows })
    } catch { setQueue({ userId: user.id, rows: [] }) }
  }, [user?.id])
  useEffect(() => {
    if (!queue.userId) return
    try { localStorage.setItem(`darts-results:${queue.userId}`, JSON.stringify(queue.rows)) } catch { /* In-memory queue still works. */ }
  }, [queue])
  useEffect(() => {
    if (!user || !game || queue.userId !== user.id) return
    const owner = owners.current.get(game.id)
    if (!owner || owner.userId !== user.id) return
    const pending = game.ratingResults.filter(result => !saved.current.has(`${user.id}:${result.id}`) && !queue.rows.some(row => row.game_id === result.id))
    if (!pending.length) return
    const rows = pending.map(result => ({ user_id: user.id, game_id: result.id, mode: result.mode, stats: result.stats[owner.seat], stats_100: result.stats100?.[owner.seat] ?? null, won: result.winner === owner.seat, eligible: result.eligible, created_at: result.createdAt || new Date().toISOString(), details: result.details }))
    setQueue(old => ({ userId: user.id, rows: [...old.rows, ...rows] }))
  }, [game, user?.id, queue])
  useEffect(() => {
    if (!user || !game || game.mode !== 'practice' || game.practiceMode === 'target' || !game.finished || queue.userId !== user.id) return
    const owner = owners.current.get(game.id)
    if (!owner || owner.userId !== user.id) return
    const gameId = `${game.id}:${game.practiceMode}`
    if (saved.current.has(`${user.id}:${gameId}`) || queue.rows.some(row => row.game_id === gameId)) return
    const player = game.players[owner.seat]
    if (!player) return
    const average = game.practiceMode === 'count-up' ? game.limit ? player.score / game.limit : 0 : player.darts ? player.points / player.darts : 0
    const result: PendingResult = { user_id: user.id, game_id: gameId, mode: 'count-up', stats: average, stats_100: average, score: player.score, won: game.winner === owner.seat, eligible: false, created_at: new Date().toISOString(), details: gameDetails(game) }
    setQueue(old => ({ userId: user.id, rows: [...old.rows, result] }))
  }, [game, user?.id, queue])
  useEffect(() => {
    if (!client || !user || queue.userId !== user.id || !queue.rows.length) return
    let live = true
    const rows = queue.rows
    setStatus('成績を保存中…')
    void client.from('darts_game_results').upsert(rows, { onConflict: 'user_id,game_id', ignoreDuplicates: true }).then(({ error: cause }) => {
      if (!live) return
      if (cause) { setStatus('保存待ち · 再試行できます'); setError(cause.message) }
      else {
        rows.forEach(row => saved.current.add(`${user.id}:${row.game_id}`))
        const completed = new Set(rows.map(row => row.game_id))
        setQueue(old => ({ ...old, rows: old.rows.filter(row => !completed.has(row.game_id)) }))
        setStatus('成績を保存しました'); setRefresh(value => value + 1)
      }
    })
    return () => { live = false }
  }, [client, user?.id, queue, refresh])

  const login = async () => {
    if (!client || !googleEnabled) return
    setError(''); setLoginBusy(true)
    try {
      const desktop = window.dartsRoomDesktop?.isDesktop === true
      const { data, error: cause } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: desktop ? 'dartsroom://auth/callback' : `${window.location.origin}/`,
          ...(desktop ? { skipBrowserRedirect: true } : {}),
        },
      })
      if (cause) throw cause
      if (desktop) {
        if (!data.url) throw new Error('Google認証URLを取得できませんでした。')
        const opened = await window.dartsRoomDesktop!.openGoogleAuth(data.url)
        if (!opened.ok) throw new Error(opened.error || '既定のブラウザーを開けませんでした。')
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Googleログインを開始できませんでした。'); setLoginBusy(false) }
  }
  const logout = async () => {
    if (!client) return
    const { error: cause } = await client.auth.signOut()
    if (cause) setError(cause.message)
    else { setUser(null); setResults([]); setStatus(''); setError('') }
  }
  const summary = summarizeRating(results)
  const isCountUp = (result: SavedResult) => result.mode === 'count-up' && (result.details?.practiceMode === 'count-up' || !result.details?.practiceMode) && typeof result.score === 'number'
  const countUpResults = results.filter(isCountUp)
  const countUpAverage = countUpResults.length ? countUpResults.reduce((sum, result) => sum + (result.score ?? 0), 0) / countUpResults.length : null
  const displayedMonth = visibleMonth ? dateFromKey(`${visibleMonth}-01`) : new Date()
  const daysInMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 0).getDate()
  const monthOffset = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth(), 1).getDay()
  const recordedDays = new Set(results.flatMap(result => result.created_at ? [localDateKey(new Date(result.created_at))] : []))
  const selectedResults = results.filter(result => result.created_at && localDateKey(new Date(result.created_at)) === selectedDay)
  const dailyGames = [...selectedResults].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
  const dailyGameGroups = Array.from(dailyGames.reduce((groups, result) => {
    const key = result.details?.sessionId || result.game_id
    const group = groups.get(key) || []
    group.push(result); groups.set(key, group)
    return groups
  }, new Map<string, SavedResult[]>()).entries())
  const dailyAverage = (mode: SavedResult['mode'], field: 'stats' | 'stats_100') => {
    const games = selectedResults.filter(result => result.mode === mode && typeof result[field] === 'number' && Number.isFinite(result[field]))
    return games.length ? games.reduce((sum, result) => sum + (result[field] as number), 0) / games.length : null
  }
  const dailyEligibleAverage = (mode: '01' | 'cricket') => {
    const games = selectedResults.filter(result => result.mode === mode && result.eligible !== false && Number.isFinite(result.stats))
    return games.length ? games.reduce((sum, result) => sum + result.stats, 0) / games.length : null
  }
  const day01 = dailyEligibleAverage('01')
  const dayCricket = dailyEligibleAverage('cricket')
  const dayLevels = [day01 === null ? null : ratingEstimate('01', day01), dayCricket === null ? null : ratingEstimate('cricket', dayCricket)].filter((level): level is number => level !== null)
  const dayRt = dayLevels.length ? dayLevels.reduce((sum, level) => sum + level, 0) / dayLevels.length : null
  const dayFlight = dayRt === null ? '—' : dayRt >= 16 ? 'SA' : dayRt >= 13 ? 'AA' : dayRt >= 10 ? 'A' : dayRt >= 8 ? 'BB' : dayRt >= 6 ? 'B' : dayRt >= 4 ? 'CC' : 'C'
  const hasUnbackfilledStats = selectedResults.some(result => (result.mode === '01' || result.mode === 'cricket') && result.stats_100 == null)
  const countUpGames = selectedResults.filter(isCountUp)
  const countUpScoreAverage = countUpGames.length ? countUpGames.reduce((sum, result) => sum + (result.score ?? 0), 0) / countUpGames.length : null
  const countUpRoundAverage = countUpGames.length ? countUpGames.reduce((sum, result) => sum + result.stats, 0) / countUpGames.length : null
  const monthTitle = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long' }).format(displayedMonth)
  const changeMonth = (amount: number) => {
    const date = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + amount, 1)
    setVisibleMonth(monthKey(date))
  }
  return <section className="account-panel" aria-label="アカウントとレーティング">
    <div className="account-camera-setting"><div><span className="kicker">ONLINE VIDEO</span><strong>カメラ設定</strong><small>マッチ成立時に自動でカメラをオンにします。マイク音声は共有しません。</small></div><label><input type="checkbox" checked={cameraAutoStart} onChange={event => onCameraAutoStart(event.target.checked)} /> 自動でオン</label></div>
    <div className="account-identity"><span className="kicker">MY ACCOUNT</span><strong>{user ? user.user_metadata.full_name || user.email || 'PLAYER' : 'ゲスト'}</strong>
      {user ? <button onClick={() => void logout()}>ログアウト</button> : <button disabled={!client || !ready || !googleEnabled || loginBusy || !!game && !game.finished} onClick={() => void login()}>{loginBusy ? 'Googleへ移動中…' : 'Googleでログイン'}</button>}
      {!ready && <small>アカウントを確認中…</small>}{ready && !client && <small>ログイン準備中 · Supabaseの接続設定が必要です</small>}{ready && client && !googleEnabled && !user && <small>Googleログイン準備中</small>}
    </div>
    <div className="account-rating"><small>参考レーティング</small><strong>{summary.rating?.toFixed(2) ?? '—'} <span>{summary.flight}</span></strong><small>{user ? summary.rating === null ? `測定中 · ${summary.count}/10ゲーム（01とCRの両方が必要）` : `直近${summary.count}ゲーム · 補間による参考値` : 'ログインして対人成績を記録'}</small></div>
    <div className="account-stats"><span>01 <b>{summary.zeroOne?.toFixed(2) ?? '—'}</b></span><span>CR <b>{summary.cricket?.toFixed(2) ?? '—'}</b></span><span>COUNT-UP <b>{countUpAverage?.toFixed(0) ?? '—'}</b></span></div>
    {user ? <section className="stats-calendar" aria-label="日別スタッツ">
      <header className="stats-calendar-heading"><div><span className="kicker">PLAY HISTORY</span><h3>日別スタッツ</h3></div><div className="calendar-month-nav"><button onClick={() => changeMonth(-1)} aria-label="前の月">←</button><strong>{monthTitle}</strong><button onClick={() => changeMonth(1)} aria-label="次の月">→</button></div></header>
      <div className="calendar-grid" role="grid" aria-label={monthTitle}>
        {['日','月','火','水','木','金','土'].map(day => <span className="calendar-weekday" key={day} role="columnheader">{day}</span>)}
        {Array.from({ length: monthOffset }, (_, index) => <span className="calendar-empty" key={`empty-${index}`} aria-hidden="true"/>)}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1
          const key = `${visibleMonth || monthKey(displayedMonth)}-${String(day).padStart(2, '0')}`
          const hasResults = recordedDays.has(key)
          return <button key={key} className={`calendar-day${selectedDay === key ? ' selected' : ''}${hasResults ? ' has-results' : ''}`} role="gridcell" aria-label={`${key}${hasResults ? ' · 記録あり' : ''}`} aria-pressed={selectedDay === key} onClick={() => { setSelectedDay(key); setExpandedGameId(null) }}>{day}{hasResults && <i/>}</button>
        })}
      </div>
      <div className="day-stats">
        <div className="day-stats-title"><strong>{selectedDay ? dateFromKey(selectedDay).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }) : '日付を選択'}</strong><small>{dailyGameGroups.length} ゲーム</small></div>
        <article className="day-rating"><small>この日の参考RT</small><strong>{dayRt?.toFixed(2) ?? '—'} <em>{dayFlight}</em></strong><span>{dayLevels.length === 2 ? '当日の01・CRの80%スタッツから補間' : dayLevels.length === 1 ? `当日の${day01 === null ? 'CR' : '01'}・80%スタッツから仮算出` : 'この日に01またはCRの記録がありません'}</span></article>
        <div className="day-metric-grid">
          <article className="day-metric"><small>01 · 100%</small><strong>{dailyAverage('01','stats_100')?.toFixed(2) ?? '—'}</strong><span>PPR · {selectedResults.filter(row => row.mode === '01').length}ゲーム</span></article>
          <article className="day-metric"><small>01 · 80%</small><strong>{dailyAverage('01','stats')?.toFixed(2) ?? '—'}</strong><span>PPR</span></article>
          <article className="day-metric"><small>CRICKET · 100%</small><strong>{dailyAverage('cricket','stats_100')?.toFixed(2) ?? '—'}</strong><span>MPR · {selectedResults.filter(row => row.mode === 'cricket').length}ゲーム</span></article>
          <article className="day-metric"><small>CRICKET · 80%</small><strong>{dailyAverage('cricket','stats')?.toFixed(2) ?? '—'}</strong><span>MPR</span></article>
          <article className="day-metric count-up-metric"><small>COUNT-UP · 平均スコア</small><strong>{countUpScoreAverage?.toFixed(0) ?? '—'}</strong><span>{countUpRoundAverage === null ? '8ラウンド平均 —' : `1ラウンド平均 ${countUpRoundAverage.toFixed(1)}`} · {countUpGames.length}ゲーム</span></article>
        </div>
        <section className="daily-game-history" aria-label="この日のゲーム履歴">
          <h4>この日のゲーム</h4>
          {dailyGameGroups.length ? <ul>{dailyGameGroups.map(([sessionId, rows]) => {
            const sortedRows = [...rows].sort((a, b) => (a.details?.legIndex ?? 0) - (b.details?.legIndex ?? 0))
            const first = sortedRows[0]
            const details = first.details
            const practiceLabels: Record<string, string> = { target: 'TARGET PRACTICE', 'count-up': 'COUNT-UP', 'cricket-count-up': 'CRICKET COUNT-UP', 'eagles-eye': 'EAGLE’S EYE', 'half-it': 'HALF-IT', 'shoot-out': 'SHOOT OUT' }
            const modeLabel = details?.mode === 'match' ? 'MATCH' : details?.mode === 'robo' ? 'ROBO MATCH' : details?.mode === 'practice' ? practiceLabels[details.practiceMode || ''] || 'PRACTICE' : first.mode === '01' ? '01' : first.mode === 'cricket' ? 'CRICKET' : 'COUNT-UP'
            const statsLabel = first.mode === '01' ? 'PPR' : first.mode === 'cricket' ? 'MPR' : details?.practiceMode === 'count-up' || !details?.practiceMode ? 'AVG / ROUND' : 'AVG / DART'
            const playedAt = first.created_at ? new Date(first.created_at) : null
            const expanded = expandedGameId === sessionId
            const matchWins = [0, 0]
            if (details?.mode === 'match') sortedRows.forEach(row => { if (row.details?.winner === 0 || row.details?.winner === 1) matchWins[row.details.winner]++ })
            const matchWinner = details?.mode === 'match' && details.matchBestOf && Math.max(...matchWins) >= Math.floor(details.matchBestOf / 2) + 1 ? matchWins[0] > matchWins[1] ? 0 : 1 : null
            const groupWon = details?.mode === 'match' && matchWinner === null ? false : matchWinner === null ? first.won : sortedRows.find(row => row.details?.winner === matchWinner)?.won === true
            return <li key={sessionId} className={`daily-game-entry${expanded ? ' expanded' : ''}`}>
              <button className="daily-game-toggle" aria-expanded={expanded} onClick={() => { setExpandedGameId(expanded ? null : sessionId); if (!expanded) setSelectedLegGameId(sortedRows[0]?.game_id ?? null) }}>
                <span className="daily-game-heading"><time>{playedAt?.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) ?? '時刻不明'}</time><strong>{modeLabel}</strong><span className={`game-result${groupWon ? ' won' : ''}`}>{details?.mode === 'match' && matchWinner === null ? 'MATCH' : groupWon ? 'WIN' : 'LOSE'}</span><span className="daily-game-expand-label">{expanded ? '閉じる −' : '投ごとの詳細 ＋'}</span></span>
                {details?.mode === 'match' ? <div className="daily-game-stats"><span>LEG <b>{sortedRows.length}</b></span><span>戦績 <b>{matchWins[0]} – {matchWins[1]}</b></span>{sortedRows.map((row, index) => <span key={row.game_id}>LEG {index + 1} <b>{row.mode === '01' ? '01' : 'CR'}</b> · {row.mode === '01' ? 'PPR' : 'MPR'} <b>{row.stats.toFixed(2)}</b></span>)}</div> : <div className="daily-game-stats"><span>80% <b>{first.stats.toFixed(2)}</b> {statsLabel}</span>{first.stats_100 != null && <span>100% <b>{first.stats_100.toFixed(2)}</b> {statsLabel}</span>}{first.mode === 'count-up' && first.score != null && <span>SCORE <b>{first.score}</b></span>}</div>}
              </button>
              {expanded && <div className="daily-game-detail">
                {details?.mode === 'match' && sortedRows.length > 1 && <nav className="match-leg-tabs" aria-label="MATCHのLEG選択">{sortedRows.map((row, index) => <button key={row.game_id} className={(selectedLegGameId || sortedRows[0]?.game_id) === row.game_id ? 'selected' : ''} onClick={() => setSelectedLegGameId(row.game_id)}><small>LEG {index + 1}</small><strong>{row.mode === '01' ? '01' : 'CR'}</strong><span>{row.won ? 'WIN' : 'FINISH'}</span></button>)}</nav>}
                {(() => {
                  const row = sortedRows.find(candidate => candidate.game_id === selectedLegGameId) || sortedRows[0]
                  const detail = row?.details
                  if (!row || !detail?.throws.length) return <p className="daily-game-no-detail">この試合の投ごとの履歴はありません。保存開始後のゲームから確認できます。</p>
                  const isCricket = detail.legMode === 'cricket' || detail.mode === 'cricket' || detail.practiceMode === 'cricket-count-up'
                  const legLabel = detail.mode === 'match' ? `LEG ${(detail.legIndex ?? 0) + 1} · ${(detail.legMode || row.mode).toUpperCase()}` : detail.mode === 'practice' ? detail.practiceMode?.toUpperCase() || 'PRACTICE' : modeLabel
                  const hitTargets = [20, 19, 18, 17, 16, 15, 25]
                  const turnMap = new Map<string, GameThrowRecord[]>()
                  detail.throws.forEach(throwRecord => {
                    const key = `${throwRecord.round}:${throwRecord.player}`
                    const turn = turnMap.get(key) || []
                    turn.push(throwRecord); turnMap.set(key, turn)
                  })
                  return <section className="daily-leg-detail" key={row.game_id}>
                    <header><strong>{legLabel}</strong><span>{row.mode === '01' ? 'PPR' : row.mode === 'cricket' ? 'MPR' : 'SCORE'} <b>{row.stats.toFixed(2)}</b>{row.stats_100 != null && <> · 100% <b>{row.stats_100.toFixed(2)}</b></>}</span></header>
                    {isCricket ? <div className="cricket-hit-summary" aria-label="クリケットナンバーのヒット数">{hitTargets.map(target => {
                      const hits = detail.throws.filter(throwRecord => throwRecord.hit.base === target).length
                      return <span key={target}><small>{target === 25 ? 'BULL' : target}</small><b>{hits}</b><i style={{ '--hit-width': `${detail.throws.length ? hits / detail.throws.length * 100 : 0}%` } as CSSProperties}/></span>
                    })}</div> : <div className="game-hit-summary"><span><small>THROWS</small><b>{detail.throws.length}</b></span><span><small>BULL</small><b>{detail.throws.filter(throwRecord => throwRecord.hit.base === 25).length}</b></span><span><small>D-BULL</small><b>{detail.throws.filter(throwRecord => throwRecord.hit.base === 25 && throwRecord.hit.ratio === 2).length}</b></span></div>}
                    <h5>ラウンド別プレイデータ</h5>
                    {Array.from(turnMap.entries()).map(([key, turn]) => {
                      const [round, player] = key.split(':').map(Number)
                      const playerName = detail.players[player] || `PLAYER ${player + 1}`
                      return <div className="daily-turn-detail" key={key}><strong>R{round} · P{player + 1} {playerName}</strong><div>{turn.map((throwRecord, dartIndex) => <span className="daily-dart-detail" key={`${throwRecord.round}-${throwRecord.player}-${dartIndex}`}><small>D{dartIndex + 1}</small><b>{label(throwRecord.hit)}{throwRecord.hit.ring === 'outer-single' ? ' OUT' : throwRecord.hit.ring === 'inner-single' ? ' IN' : ''}</b><em>{isCricket ? `${Object.values(throwRecord.marks).reduce((sum, marks) => sum + marks, 0)} MARKS · ${throwRecord.score} PTS` : detail.mode === 'practice' ? `${throwRecord.score} PTS` : `${throwRecord.score} LEFT`}</em></span>)}</div></div>
                    })}
                  </section>
                })()}
              </div>}
            </li>
          })}</ul> : <p>この日の試合記録はありません。</p>}
        </section>
        {hasUnbackfilledStats && <p className="stats-history-note">100%スタッツの保存開始前の記録は、元データがないため表示できません。新しいゲームから表示されます。</p>}
      </div>
    </section> : <p className="stats-calendar-login">Googleログインすると、プレイ履歴を日付ごとに確認できます。</p>}
    {status && <p className="account-message" role="status">{status}</p>}{error && <p className="account-error" role="alert">{error} <button onClick={() => setRefresh(value => value + 1)}>再試行</button></p>}
  </section>
}
