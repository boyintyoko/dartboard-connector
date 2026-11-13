'use client'

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { useEffect, useRef, useState } from 'react'
import type { Game } from '../lib/game'
import { summarizeRating, type SavedResult } from '../lib/rating'

type PendingResult = SavedResult & { user_id: string }

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
  const owners = useRef(new Map<string, { userId: string | null; seat: number }>())
  const saved = useRef(new Set<string>())

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
    void client.from('darts_game_results').select('game_id,mode,stats,won,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).order('game_id', { ascending: false }).limit(30).then(({ data, error: cause }) => {
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
      const rows = Array.isArray(stored) ? stored.filter(row => row.user_id === user.id && typeof row.game_id === 'string' && ['01', 'cricket'].includes(row.mode) && Number.isFinite(row.stats)) : []
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
    const rows = pending.map(result => ({ user_id: user.id, game_id: result.id, mode: result.mode, stats: result.stats[owner.seat], won: result.winner === owner.seat }))
    setQueue(old => ({ userId: user.id, rows: [...old.rows, ...rows] }))
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
  return <section className="account-panel" aria-label="アカウントとレーティング">
    <div className="account-camera-setting"><div><span className="kicker">ONLINE VIDEO</span><strong>カメラ設定</strong><small>マッチ成立時に自動でカメラをオンにします。マイク音声は共有しません。</small></div><label><input type="checkbox" checked={cameraAutoStart} onChange={event => onCameraAutoStart(event.target.checked)} /> 自動でオン</label></div>
    <div className="account-identity"><span className="kicker">MY ACCOUNT</span><strong>{user ? user.user_metadata.full_name || user.email || 'PLAYER' : 'ゲスト'}</strong>
      {user ? <button onClick={() => void logout()}>ログアウト</button> : <button disabled={!client || !ready || !googleEnabled || loginBusy || !!game && !game.finished} onClick={() => void login()}>{loginBusy ? 'Googleへ移動中…' : 'Googleでログイン'}</button>}
      {!ready && <small>アカウントを確認中…</small>}{ready && !client && <small>ログイン準備中 · Supabaseの接続設定が必要です</small>}{ready && client && !googleEnabled && !user && <small>Googleログイン準備中</small>}
    </div>
    <div className="account-rating"><small>参考レーティング</small><strong>{summary.rating?.toFixed(1) ?? '—'} <span>{summary.flight}</span></strong><small>{user ? summary.rating === null ? `測定中 · ${summary.count}/10ゲーム（01とCRの両方が必要）` : `直近${summary.count}ゲーム` : 'ログインして対人成績を記録'}</small></div>
    <div className="account-stats"><span>01 <b>{summary.zeroOne?.toFixed(2) ?? '—'}</b></span><span>CR <b>{summary.cricket?.toFixed(2) ?? '—'}</b></span></div>
    {status && <p className="account-message" role="status">{status}</p>}{error && <p className="account-error" role="alert">{error} <button onClick={() => setRefresh(value => value + 1)}>再試行</button></p>}
  </section>
}
