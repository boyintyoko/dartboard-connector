'use client'

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { useEffect, useRef, useState } from 'react'
import type { Game } from '../lib/game'
import { summarizeRating, type SavedResult } from '../lib/rating'

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
        setClient(createClient(config.url, config.key)); setGoogleEnabled(config.googleEnabled === true)
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
    void client.from('darts_game_results').select('game_id,mode,stats,stats_100,score,won,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).order('game_id', { ascending: false }).limit(1000).then(({ data, error: cause }) => {
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
    const pending = game.ratingResults.filter(result => result.eligible && !saved.current.has(`${user.id}:${result.id}`) && !queue.rows.some(row => row.game_id === result.id))
    if (!pending.length) return
    const rows = pending.map(result => ({ user_id: user.id, game_id: result.id, mode: result.mode, stats: result.stats[owner.seat], stats_100: result.stats100?.[owner.seat] ?? null, won: result.winner === owner.seat, created_at: result.createdAt || new Date().toISOString() }))
    setQueue(old => ({ userId: user.id, rows: [...old.rows, ...rows] }))
  }, [game, user?.id, queue])
  useEffect(() => {
    if (!user || !game || game.mode !== 'practice' || game.practiceMode !== 'count-up' || !game.finished || queue.userId !== user.id) return
    const owner = owners.current.get(game.id)
    if (!owner || owner.userId !== user.id) return
    const gameId = `${game.id}:count-up`
    if (saved.current.has(`${user.id}:${gameId}`) || queue.rows.some(row => row.game_id === gameId)) return
    const player = game.players[owner.seat]
    if (!player) return
    const average = game.limit ? player.score / game.limit : 0
    const result: PendingResult = { user_id: user.id, game_id: gameId, mode: 'count-up', stats: average, stats_100: average, score: player.score, won: game.winner === owner.seat, created_at: new Date().toISOString() }
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
      const { error: cause } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/` } })
      if (cause) throw cause
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Googleログインを開始できませんでした。'); setLoginBusy(false) }
  }
  const logout = async () => {
    if (!client) return
    const { error: cause } = await client.auth.signOut()
    if (cause) setError(cause.message)
    else { setUser(null); setResults([]); setStatus(''); setError('') }
  }
  const summary = summarizeRating(results)
  const countUpResults = results.filter(result => result.mode === 'count-up' && typeof result.score === 'number')
  const countUpAverage = countUpResults.length ? countUpResults.reduce((sum, result) => sum + (result.score ?? 0), 0) / countUpResults.length : null
  const displayedMonth = visibleMonth ? dateFromKey(`${visibleMonth}-01`) : new Date()
  const daysInMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 0).getDate()
  const monthOffset = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth(), 1).getDay()
  const recordedDays = new Set(results.flatMap(result => result.created_at ? [localDateKey(new Date(result.created_at))] : []))
  const selectedResults = results.filter(result => result.created_at && localDateKey(new Date(result.created_at)) === selectedDay)
  const resultsUpToDay = results.filter(result => result.created_at && localDateKey(new Date(result.created_at)) <= selectedDay)
  const dayRating = summarizeRating(resultsUpToDay)
  const dailyAverage = (mode: SavedResult['mode'], field: 'stats' | 'stats_100') => {
    const games = selectedResults.filter(result => result.mode === mode && typeof result[field] === 'number' && Number.isFinite(result[field]))
    return games.length ? games.reduce((sum, result) => sum + (result[field] as number), 0) / games.length : null
  }
  const countUpGames = selectedResults.filter(result => result.mode === 'count-up')
  const countUpScoreAverage = countUpGames.length ? countUpGames.reduce((sum, result) => sum + (result.score ?? 0), 0) / countUpGames.length : null
  const countUpRoundAverage = dailyAverage('count-up', 'stats')
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
    <div className="account-rating"><small>参考レーティング</small><strong>{summary.rating?.toFixed(1) ?? '—'} <span>{summary.flight}</span></strong><small>{user ? summary.rating === null ? `測定中 · ${summary.count}/10ゲーム（01とCRの両方が必要）` : `直近${summary.count}ゲーム` : 'ログインして対人成績を記録'}</small></div>
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
          return <button key={key} className={`calendar-day${selectedDay === key ? ' selected' : ''}${hasResults ? ' has-results' : ''}`} role="gridcell" aria-label={`${key}${hasResults ? ' · 記録あり' : ''}`} aria-pressed={selectedDay === key} onClick={() => setSelectedDay(key)}>{day}{hasResults && <i/>}</button>
        })}
      </div>
      <div className="day-stats">
        <div className="day-stats-title"><strong>{selectedDay ? dateFromKey(selectedDay).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }) : '日付を選択'}</strong><small>{selectedResults.length} ゲーム</small></div>
        <article className="day-rating"><small>この日時点のRT</small><strong>{dayRating.rating?.toFixed(1) ?? '—'} <em>{dayRating.flight}</em></strong><span>{dayRating.rating === null ? 'RT算出には01・CRを含む10ゲームが必要' : `直近${dayRating.count}ゲームの参考RT`}</span></article>
        <div className="day-metric-grid">
          <article className="day-metric"><small>01 · 100%</small><strong>{dailyAverage('01','stats_100')?.toFixed(2) ?? '—'}</strong><span>PPR · {selectedResults.filter(row => row.mode === '01').length}ゲーム</span></article>
          <article className="day-metric"><small>01 · 80%</small><strong>{dailyAverage('01','stats')?.toFixed(2) ?? '—'}</strong><span>PPR</span></article>
          <article className="day-metric"><small>CRICKET · 100%</small><strong>{dailyAverage('cricket','stats_100')?.toFixed(2) ?? '—'}</strong><span>MPR · {selectedResults.filter(row => row.mode === 'cricket').length}ゲーム</span></article>
          <article className="day-metric"><small>CRICKET · 80%</small><strong>{dailyAverage('cricket','stats')?.toFixed(2) ?? '—'}</strong><span>MPR</span></article>
          <article className="day-metric count-up-metric"><small>COUNT-UP · 平均スコア</small><strong>{countUpScoreAverage?.toFixed(0) ?? '—'}</strong><span>{countUpRoundAverage === null ? '8ラウンド平均 —' : `1ラウンド平均 ${countUpRoundAverage.toFixed(1)}`} · {countUpGames.length}ゲーム</span></article>
        </div>
      </div>
    </section> : <p className="stats-calendar-login">Googleログインすると、プレイ履歴を日付ごとに確認できます。</p>}
    {status && <p className="account-message" role="status">{status}</p>}{error && <p className="account-error" role="alert">{error} <button onClick={() => setRefresh(value => value + 1)}>再試行</button></p>}
  </section>
}
