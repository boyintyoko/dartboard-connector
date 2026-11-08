export type Mode = '01' | 'cricket' | 'practice' | 'match' | 'robo'
export type Hit = { base: number; ratio: number }
export type OutRule = 'master' | 'double' | 'open'
export type MatchLegMode = '01' | 'cricket' | 'choice'
export type MatchLeadRule = 'loser' | 'alternate'
export type PracticeMode = 'target' | 'count-up' | 'cricket-count-up' | 'eagles-eye' | 'half-it' | 'shoot-out'
export type MatchStage = 'cork' | 'cork-tie' | 'choice' | 'playing' | 'finished'
export type Player = { name: string; score: number; marks: Record<number, number>; darts: number; points: number }
export type MatchState = {
  bestOf: 3 | 5
  initial: number
  legModes: MatchLegMode[]
  legIndex: number
  legWins: [number, number]
  leadRule: MatchLeadRule
  stage: MatchStage
  corkPurpose: 'opening' | 'choice'
  corkThrows: Hit[]
  legStarter: number
  choiceOwner: number | null
  choiceAs: 'first' | 'game' | null
}
export type RoundStats = { points: number; marks: number; rounds: number }
export type RatingResult = { id: string; mode: '01' | 'cricket'; stats: number[]; winner: number | null; eligible: boolean }
export type Game = {
  id: string
  initial: number
  statsTotals: RoundStats[]
  statsFrozen: RoundStats[] | null
  ratingResults: RatingResult[]
  mode: Mode
  legMode: '01' | 'cricket' | null
  match: MatchState | null
  players: Player[]
  active: number
  round: number
  limit: number
  throws: Hit[]
  turnStart: number
  bust: boolean
  finished: boolean
  winner: number | null
  message: string
  bull: 'fat' | 'split'
  outRule: OutRule
  practiceTarget: number
  practiceHits: number
  practiceMode: PracticeMode
  practiceRoundHits: number
  practiceOpened: number[]
}
export const targets = [20, 19, 18, 17, 16, 15, 25]
export const practiceTargets = [20, 19, 18, 17, 16, 15, 25]
export const halfItTargets = ['15', '16', 'D', '17', '18', 'T', '19', '20', 'BULL'] as const
export const practiceTargetForRound = (game: Game) => {
  if (game.practiceMode === 'count-up') return 'ALL NUMBERS'
  if (game.practiceMode === 'cricket-count-up') return practiceTargets[Math.min(game.round - 1, practiceTargets.length - 1)]
  if (game.practiceMode === 'half-it') return halfItTargets[game.round - 1] || 'FINISH'
  if (game.practiceMode === 'shoot-out') return game.practiceOpened.filter(n => n !== 25).length < 20 ? `×${game.practiceOpened.length + 1}` : 'BULL BONUS'
  if (game.practiceMode === 'eagles-eye') return 'BULL'
  return game.practiceTarget === 25 ? 'BULL' : String(game.practiceTarget)
}
export const practiceModeTitle: Record<PracticeMode, string> = {
  target: 'TARGET PRACTICE', 'count-up': 'COUNT-UP', 'cricket-count-up': 'CRICKET COUNT-UP', 'eagles-eye': "EAGLE’S EYE", 'half-it': 'HALF-IT', 'shoot-out': 'SHOOT OUT',
}
export const isX01 = (mode: Mode | 'choice') => mode === '01' || mode === 'match' || mode === 'robo'
export const isX01Game = (game: Game) => game.mode === 'match' || game.mode === 'robo' ? game.legMode === '01' : isX01(game.mode)
export const label = (hit: Hit) => hit.base === 0 ? 'MISS' : hit.base === 25 ? (hit.ratio === 2 ? 'D-BULL' : 'S-BULL') : `${['', 'S', 'D', 'T'][hit.ratio]}${hit.base}`
export const points = (hit: Hit, bull: Game['bull']) => hit.base === 25 && bull === 'fat' ? 50 : hit.base * hit.ratio
export function roboAim(game: Game): Hit {
  const remaining = game.players[game.active].score
  const ratios = game.outRule === 'double' ? [2] : game.outRule === 'master' ? [2, 3] : [1, 2, 3]
  for (const ratio of ratios) {
    for (const base of [...Array.from({ length: 20 }, (_, i) => 20 - i), 25]) {
      if (points({ base, ratio }, game.bull) === remaining && (base !== 25 || ratio <= 2)) return { base, ratio }
    }
  }
  if (remaining > 62) return { base: 20, ratio: 3 }
  if (remaining > 40 && remaining <= 60) return { base: remaining - 40, ratio: 1 }
  return { base: remaining % 2 ? 1 : Math.min(20, Math.max(1, remaining - 2)), ratio: 1 }
}

const emptyStats = (count: number): RoundStats[] => Array.from({ length: count }, () => ({ points: 0, marks: 0, rounds: 0 }))
const copyStats = (stats: RoundStats[]) => stats.map(value => ({ ...value }))
function freezeStats(game: Game): Game {
  if (game.statsFrozen || game.mode === 'practice') return game
  const reached = isX01Game(game)
    ? game.players.some(p => p.score <= Math.floor(game.initial * .2))
    : game.players.some(p => targets.filter(t => (p.marks[t] || 0) >= 3).length >= 6)
  return reached ? { ...game, statsFrozen: copyStats(game.statsTotals) } : game
}
function recordResult(game: Game, winner: number | null): Game {
  if (game.mode === 'practice') return game
  const id = `${game.id}:${game.match?.legIndex ?? 0}`
  if (game.ratingResults.some(result => result.id === id)) return game
  const mode = isX01Game(game) ? '01' : 'cricket'
  const stats = (game.statsFrozen ?? game.statsTotals).map(p => p.rounds ? (mode === '01' ? p.points : p.marks) / p.rounds : 0)
  const eligible = game.players.length >= 2 && game.mode !== 'robo' && !game.players.some(p => p.name.startsWith('ROBO ·')) && (mode !== '01' || game.bull === 'fat') && game.statsTotals.every(p => p.rounds > 0)
  return { ...game, ratingResults: [...game.ratingResults, { id, mode, stats, winner, eligible }] }
}
function trackStats(before: Game, after: Game, hit: Hit): Game {
  if (after.mode === 'practice' || before.statsFrozen) return after
  const totals = copyStats(before.statsTotals)
  const own = totals[before.active]
  if (!before.throws.length) own.rounds++
  own.points += after.players[before.active].points - before.players[before.active].points
  if (!isX01Game(after) && targets.includes(hit.base)) {
    const marks = before.players[before.active].marks[hit.base] || 0
    const opponentsOpen = before.players.some((p, i) => i !== before.active && (p.marks[hit.base] || 0) < 3)
    if (marks < 3 || opponentsOpen) own.marks += opponentsOpen ? hit.ratio : Math.min(hit.ratio, 3 - marks)
  }
  const next = { ...after, statsTotals: totals }
  return after.throws.length === 3 || after.bust || after.finished ? freezeStats(next) : next
}

function newPlayers(names: string[], initial: number, gameMode: '01' | 'cricket'): Player[] {
  return names.map((name, i) => ({ name: name.trim() || `PLAYER ${i + 1}`, score: gameMode === '01' ? initial : 0, marks: {}, darts: 0, points: 0 }))
}
function resetLeg(game: Game, legMode: '01' | 'cricket', starter: number, initial: number): Game {
  const match = { ...game.match!, legWins: [...game.match!.legWins] as [number, number], legModes: [...game.match!.legModes] }
  match.stage = 'playing'; match.legStarter = starter; match.corkThrows = []; match.choiceOwner = null; match.choiceAs = null
  const players = newPlayers(game.players.map(p => p.name), initial, legMode)
  const leg = match.legModes[match.legIndex]
  return { ...game, match, legMode, players, initial, statsTotals: emptyStats(players.length), statsFrozen: null, active: starter, round: 1, limit: legMode === 'cricket' ? 20 : 15, throws: [], turnStart: players[starter].score, bust: false, finished: false, winner: null, message: `LEG ${match.legIndex + 1} · ${leg === 'choice' ? legMode.toUpperCase() : leg.toUpperCase()}` }
}
export function createGame(mode: Mode, names: string[], initial = 701, bull: Game['bull'] = 'fat', outRule: OutRule = 'master', practiceTarget = 20, bestOf: 3 | 5 = 3, leadRule: MatchLeadRule = 'loser', roboMode: '01' | 'cricket' = '01', practiceMode: PracticeMode = 'target'): Game {
  const match: MatchState | null = mode === 'match' ? {
    bestOf,
    initial,
    legModes: bestOf === 3 ? ['01', 'cricket', 'choice'] : ['01', 'cricket', 'cricket', '01', 'choice'],
    legIndex: 0, legWins: [0, 0], leadRule, stage: 'cork', corkPurpose: 'opening', corkThrows: [], legStarter: 0, choiceOwner: null, choiceAs: null,
  } : null
  const gameMode = mode === 'cricket' || mode === 'robo' && roboMode === 'cricket' ? 'cricket' : '01'
  const practiceStart = practiceMode === 'half-it' ? 40 : 0
  const players = newPlayers(names, mode === 'practice' ? practiceStart : initial, gameMode)
  const game: Game = {
    id: crypto.randomUUID(), initial, statsTotals: emptyStats(players.length), statsFrozen: null, ratingResults: [],
    mode, legMode: mode === 'match' ? '01' : mode === 'robo' ? roboMode : null, match, bull, outRule, practiceTarget, practiceHits: 0, practiceMode, practiceRoundHits: 0, practiceOpened: [],
    players, active: 0, round: 1, limit: mode === 'practice' ? practiceMode === 'target' ? 0 : practiceMode === 'half-it' ? halfItTargets.length : 8 : gameMode === 'cricket' ? (players.length === 1 ? 0 : 20) : isX01(mode) ? 15 : 0,
    throws: [], turnStart: players[0]?.score ?? 0, bust: false, finished: false, winner: null,
    message: mode === 'match' ? 'CORK · PLAYER 1 THROWS FIRST' : 'THROW YOUR DARTS',
  }
  return game
}

function prepareNextLeg(game: Game, winner: number): Game {
  game = recordResult(game, winner)
  const match = { ...game.match!, legWins: [...game.match!.legWins] as [number, number], legModes: [...game.match!.legModes] }
  match.legWins[winner]++
  const required = Math.floor(match.bestOf / 2) + 1
  if (match.legWins[winner] >= required) {
    match.stage = 'finished'
    return { ...game, match, finished: true, winner, message: `${game.players[winner].name} WINS THE MATCH` }
  }
  match.legIndex++
  const nextMode = match.legModes[match.legIndex]
  if (nextMode === 'choice') {
    match.stage = 'cork'; match.corkPurpose = 'choice'; match.corkThrows = []; match.choiceOwner = null; match.choiceAs = null
    return { ...game, match, finished: false, winner: null, throws: [], active: 0, message: `LEG ${match.legIndex + 1} · CORK FOR CHOICE` }
  }
  const starter = match.leadRule === 'alternate' ? 1 - match.legStarter : 1 - winner
  return resetLeg({ ...game, match }, nextMode, starter, match.initial)
}

export function resolveCork(game: Game, winner: number): Game {
  if (!game.match || game.match.stage !== 'cork-tie' || (winner !== 0 && winner !== 1)) return game
  const match = { ...game.match, legWins: [...game.match.legWins] as [number, number], legModes: [...game.match.legModes] }
  if (match.corkPurpose === 'opening') return resetLeg({ ...game, match }, '01', winner, match.initial)
  match.stage = 'choice'; match.choiceOwner = winner; match.choiceAs = null; match.corkThrows = []
  return { ...game, match, active: winner, throws: [], message: `${game.players[winner].name} WON CORK · CHOICE` }
}

export function resolveMatchCoinToss(game: Game, winner: number): Game {
  if (!game.match || game.match.stage !== 'cork' || (winner !== 0 && winner !== 1)) return game
  const match = { ...game.match, legWins: [...game.match.legWins] as [number, number], legModes: [...game.match.legModes] }
  if (match.corkPurpose === 'opening') {
    const started = resetLeg({ ...game, match }, '01', winner, match.initial)
    return { ...started, message: `COIN TOSS · ${game.players[winner].name} GOES FIRST` }
  }
  match.stage = 'choice'; match.choiceOwner = winner; match.choiceAs = null; match.corkThrows = []
  return { ...game, match, active: winner, throws: [], message: `COIN TOSS · ${game.players[winner].name} WINS · CHOICE` }
}

function corkRank(hit: Hit): number {
  if (hit.base === 25) return hit.ratio === 2 ? 0 : 1
  if (hit.base === 0) return 5
  return hit.ratio === 3 ? 2 : hit.ratio === 1 ? 3 : 4
}
export function throwCork(game: Game, hit: Hit): Game {
  const match = game.match
  if (!match || match.stage !== 'cork') return game
  const throws = [...match.corkThrows, hit]
  if (throws.length === 1) {
    return { ...game, match: { ...match, corkThrows: throws }, active: 1, message: `CORK · ${game.players[1].name} THROWS` }
  }
  const next = { ...game, match: { ...match, corkThrows: throws, stage: 'cork-tie' as const }, active: 1, message: 'CORK · SELECT THE DART CLOSER TO CENTER' }
  if (corkRank(throws[0]) !== corkRank(throws[1])) return resolveCork({ ...next, match: { ...next.match!, stage: 'cork-tie' } }, corkRank(throws[0]) < corkRank(throws[1]) ? 0 : 1)
  return next
}

export function chooseMatchFirst(game: Game, choice: 'first' | 'game'): Game {
  if (!game.match || game.match.stage !== 'choice' || game.match.choiceOwner === null) return game
  const owner = game.match.choiceOwner
  if (owner === null) return game
  const match = { ...game.match, legWins: [...game.match.legWins] as [number, number], legModes: [...game.match.legModes] }
  match.choiceAs = choice
  match.legStarter = choice === 'first' ? owner : 1 - owner
  match.stage = 'choice'
  return { ...game, match, active: choice === 'first' ? 1 - owner : owner, message: choice === 'first' ? 'OPPONENT CHOOSES THE GAME' : `${game.players[owner].name} CHOOSES THE GAME` }
}
export function chooseMatchGame(game: Game, legMode: '01' | 'cricket', initial: number): Game {
  if (!game.match || game.match.stage !== 'choice' || !game.match.choiceAs) return game
  const match = { ...game.match, legWins: [...game.match.legWins] as [number, number], legModes: [...game.match.legModes] }
  match.legModes[match.legIndex] = 'choice'
  return resetLeg({ ...game, match }, legMode, match.legStarter, initial)
}

export function throwDart(game: Game, hit: Hit): Game {
  if (game.finished || game.throws.length >= 3 || game.bust || game.mode === 'match' && game.match?.stage !== 'playing') return game
  let g: Game = { ...game, practiceOpened: [...game.practiceOpened], players: game.players.map(p => ({ ...p, marks: { ...p.marks } })), throws: [...game.throws, hit] }
  const p = g.players[g.active]
  p.darts++
  const value = points(hit, g.bull)
  if (isX01Game(g)) {
    if (p.score - value < 0 || p.score - value === 1 && g.outRule !== 'open') { p.points -= g.turnStart - p.score; p.score = g.turnStart; g.bust = true; g.message = 'BUST' }
    else {
      p.score -= value; p.points += value
      if (p.score === 0) {
        const checkoutAllowed = g.outRule === 'open'
          ? hit.base !== 0
          : g.outRule === 'master' ? hit.ratio >= 2 : hit.ratio === 2
        if (checkoutAllowed) { g.finished = true; g.winner = g.active }
        else { p.points -= g.turnStart; p.score = g.turnStart; g.bust = true; g.message = `BUST · ${g.outRule.toUpperCase()} OUT` }
      }
    }
  } else if (g.mode === 'practice') {
    let scored = 0
    if (g.practiceMode === 'target') {
      if (hit.base === g.practiceTarget) { g.practiceHits++; scored = value }
    } else if (g.practiceMode === 'count-up') {
      scored = value
    } else if (g.practiceMode === 'cricket-count-up') {
      const currentTarget = practiceTargets[Math.min(g.round - 1, practiceTargets.length - 1)]
      if (hit.base === currentTarget) { g.practiceHits++; scored = value }
    } else if (g.practiceMode === 'eagles-eye') {
      if (hit.base === 25) { g.practiceHits++; scored = hit.ratio === 2 ? 50 : 25 }
    } else if (g.practiceMode === 'half-it') {
      const current = halfItTargets[g.round - 1]
      const valid = current === 'D' ? hit.ratio === 2 : current === 'T' ? hit.ratio === 3 : current === 'BULL' ? hit.base === 25 : hit.base === Number(current)
      if (valid) { g.practiceHits++; g.practiceRoundHits++; scored = value }
    } else if (g.practiceMode === 'shoot-out') {
      const openedNumbers = g.practiceOpened.filter(n => n !== 25).length
      const alreadyOpened = hit.base === 25 ? openedNumbers < 20 || g.practiceOpened.filter(n => n === 25).length >= 3 : g.practiceOpened.includes(hit.base)
      if (hit.base > 0 && !alreadyOpened && (openedNumbers < 20 || hit.base === 25)) {
        g.practiceOpened.push(hit.base)
        g.practiceHits++
        scored = value * g.practiceOpened.length
      }
    }
    p.score += scored
    p.points += scored
    if (g.practiceMode === 'half-it' && g.throws.length === 3) {
      if (g.practiceRoundHits === 0) p.score = Math.floor(p.score / 2)
      g.message = g.practiceRoundHits === 0 ? 'HALF-IT · SCORE HALVED' : `HIT ${g.practiceRoundHits} TARGET${g.practiceRoundHits === 1 ? '' : 'S'}`
    }
    if (g.practiceMode === 'shoot-out' && g.practiceOpened.filter(n => n !== 25).length === 20 && g.practiceOpened.filter(n => n === 25).length === 3) { g.finished = true; g.winner = g.active }
    if (g.practiceMode !== 'half-it' && g.practiceMode !== 'shoot-out') g.message = scored ? `${label(hit)} · +${scored}` : g.practiceMode === 'eagles-eye' ? 'ONLY BULL SCORES' : `${label(hit)} · 0`
  } else if ((g.mode === 'cricket' || (g.mode === 'match' || g.mode === 'robo') && g.legMode === 'cricket') && targets.includes(hit.base)) {
    const before = p.marks[hit.base] || 0
    p.marks[hit.base] = Math.min(3, before + hit.ratio)
    const extra = Math.max(0, before + hit.ratio - 3)
    if (g.players.some((other, i) => i !== g.active && (other.marks[hit.base] || 0) < 3)) p.score += extra * hit.base
    if (targets.every(t => p.marks[t] === 3) && g.players.every(other => p.score >= other.score)) { g.finished = true; g.winner = g.active }
  }
  g = trackStats(game, g, hit)
  if (g.finished && g.mode !== 'match') g = recordResult(g, g.winner)
  if (g.finished && g.mode === 'match' && g.winner !== null) return prepareNextLeg(g, g.winner)
  if (g.finished) g.message = `${p.name} WINS!`
  else if (!g.bust && g.mode !== 'practice') g.message = g.throws.length === 3 ? 'REMOVE DARTS · CHANGE' : label(hit)
  return g
}

export function nextTurn(game: Game): Game {
  if (game.finished || game.mode === 'match' && game.match?.stage !== 'playing') return game
  if (game.mode !== 'practice' && !game.throws.length && !game.statsFrozen) {
    const totals = copyStats(game.statsTotals); totals[game.active].rounds++
    game = { ...game, statsTotals: totals }
  }
  game = freezeStats(game)
  if (game.mode === 'practice' && game.practiceMode !== 'target') {
    while (game.throws.length < 3 && !game.finished) game = throwDart(game, { base: 0, ratio: 1 })
  }
  if (game.mode === 'practice' && game.practiceMode !== 'target' && game.throws.length > 0 && game.active === 0 && game.round >= game.limit) {
    return { ...game, finished: true, winner: 0, message: 'PRACTICE COMPLETE' }
  }
  const active = (game.active + 1) % game.players.length
  const round = game.round + (active === 0 ? 1 : 0)
  if (game.limit > 0 && round > game.limit) {
    const scores = game.players.map(p => p.score)
    const best = isX01Game(game) ? Math.min(...scores) : Math.max(...scores)
    const winners = scores.map((score, i) => score === best ? i : -1).filter(i => i >= 0)
    if (game.mode === 'match' && winners.length === 1) return prepareNextLeg(game, winners[0])
    return { ...recordResult(game, winners.length === 1 ? winners[0] : null), finished: true, winner: winners.length === 1 ? winners[0] : null, message: winners.length === 1 ? `${game.players[winners[0]].name} WINS!` : 'DRAW GAME' }
  }
  return { ...game, active, round, throws: [], bust: false, turnStart: game.players[active].score, practiceRoundHits: 0, message: 'THROW YOUR DARTS' }
}
