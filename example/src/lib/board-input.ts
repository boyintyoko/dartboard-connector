import { isX01Game, label, nextTurn, throwCork, throwDart, type Game, type Hit } from './game'
export type BoardSignal = { type: 'change' } | ({ type: 'segment' } & Hit)
export type BoardInputResult = { game: Game | null; applied: boolean; detail: string }
export function receiveBoardSignal(game: Game | null, signal: BoardSignal): BoardInputResult {
  if (!game) return { game, applied: false, detail: 'ゲーム開始待ち' }
  if (game.finished) return { game, applied: false, detail: 'ゲーム終了' }
  if (game.mode === 'match' && game.match?.stage === 'cork') return signal.type === 'change' ? { game, applied: false, detail: 'CORK入力待ち' } : { game: throwCork(game, signal), applied: true, detail: `CORK · ${label(signal)}` }
  if (game.mode === 'match' && game.match?.stage !== 'playing') return { game, applied: false, detail: '選択待ち' }
  if (signal.type === 'change') return { game: nextTurn(game), applied: true, detail: 'CHANGE' }
  if (game.bust || game.throws.length >= 3) return { game, applied: false, detail: 'CHANGE待ち' }
  if (!Number.isInteger(signal.base) || !Number.isInteger(signal.ratio) || !((signal.base >= 1 && signal.base <= 20 && signal.ratio >= 1 && signal.ratio <= 3) || (signal.base === 25 && (signal.ratio === 1 || signal.ratio === 2)))) return { game, applied: false, detail: `未対応データ: ${JSON.stringify(signal)}` }
  const next = throwDart(game, signal)
  const current = game.players[game.active]
  return { game: next, applied: true, detail: `${label(signal)} · ${isX01Game(game) ? `${current.score} → ${next.players[game.active].score}` : '記録しました'}` }
}
