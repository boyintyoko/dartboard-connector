export type SavedResult = { game_id: string; mode: '01' | 'cricket' | 'count-up'; stats: number; stats_100?: number | null; score?: number | null; won: boolean; created_at?: string }
const limits = {
  '01': [0, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 102, 109, 116, 123, 130],
  cricket: [0, 1.3, 1.5, 1.7, 1.9, 2.1, 2.3, 2.5, 2.7, 2.9, 3.1, 3.3, 3.5, 3.75, 4, 4.25, 4.5, 4.75],
}
export function ratingEstimate(mode: '01' | 'cricket', stats: number) {
  const thresholds = limits[mode]
  if (!Number.isFinite(stats) || stats <= thresholds[0]) return 1
  const lastIndex = thresholds.length - 1
  const maxRating = 18.99
  if (stats >= thresholds[lastIndex]) {
    const lastStep = thresholds[lastIndex] - thresholds[lastIndex - 1]
    return Math.min(maxRating, lastIndex + (stats - thresholds[lastIndex]) / lastStep)
  }
  for (let index = 0; index < thresholds.length - 1; index += 1) {
    const lower = thresholds[index]
    const upper = thresholds[index + 1]
    if (stats < upper) return index + 1 + (stats - lower) / (upper - lower)
  }
  return maxRating
}
export function summarizeRating(results: SavedResult[]) {
  const recent = results.filter(game => game.mode === '01' || game.mode === 'cricket').slice(0, 30)
  const average = (mode: SavedResult['mode']) => {
    const games = recent.filter(game => game.mode === mode)
    return games.length ? games.reduce((sum, game) => sum + game.stats, 0) / games.length : null
  }
  const zeroOne = average('01'), cricket = average('cricket')
  const rating = recent.length >= 10 && zeroOne !== null && cricket !== null ? (ratingEstimate('01', zeroOne) + ratingEstimate('cricket', cricket)) / 2 : null
  const flight = rating === null ? '—' : rating >= 16 ? 'SA' : rating >= 13 ? 'AA' : rating >= 10 ? 'A' : rating >= 8 ? 'BB' : rating >= 6 ? 'B' : rating >= 4 ? 'CC' : 'C'
  return { rating, flight, zeroOne, cricket, count: recent.length }
}
