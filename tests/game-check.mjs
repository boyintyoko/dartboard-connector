import ts from 'typescript'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const source = fs.readFileSync('example/src/lib/game.ts', 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText
const { createGame, throwDart, nextTurn, resolveMatchCoinToss } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
let g = createGame('01', ['A', 'B'], 301)
g = throwDart(g, {base:20,ratio:3}); g = throwDart(g,{base:25,ratio:1}); g = throwDart(g,{base:0,ratio:1})
assert.equal(g.players[0].score,191); assert.equal(throwDart(g,{base:20,ratio:3}),g)
g = nextTurn(g); assert.equal(g.active,1); assert.equal(g.round,1)
g = nextTurn(g); assert.equal(g.round,2)
g = createGame('01',['A'], 50); g = throwDart(g,{base:20,ratio:1}); g = throwDart(g,{base:20,ratio:2}); assert.equal(g.bust,true); assert.equal(g.players[0].score,50)
g = nextTurn(g); g = throwDart(g,{base:25,ratio:2}); assert.equal(g.finished,true); assert.equal(g.winner,0)
g = createGame('cricket',['A','B']); g = throwDart(g,{base:20,ratio:3}); g = throwDart(g,{base:20,ratio:2}); assert.equal(g.players[0].score,40)
g.players[1].marks[20] = 3; g = throwDart(g,{base:20,ratio:3}); assert.equal(g.players[0].score,40)
g = createGame('cricket',['A','B']); for(let i=0;i<42;i++)g=nextTurn(g); assert.equal(g.finished,true);assert.equal(g.winner,null)
g = createGame('01',['A'],501,'split');g=throwDart(g,{base:25,ratio:1});assert.equal(g.players[0].score,476)
g = createGame('match',['A','B'],501); g = resolveMatchCoinToss(g,1); assert.equal(g.match.stage,'playing'); assert.equal(g.match.legStarter,1); assert.equal(g.active,1); assert.match(g.message,/COIN TOSS/)
g = createGame('match',['A','B'],501); g.match={...g.match,stage:'cork',corkPurpose:'choice',legIndex:2}; g=resolveMatchCoinToss(g,0); assert.equal(g.match.stage,'choice'); assert.equal(g.match.choiceOwner,0); assert.equal(g.active,0); assert.match(g.message,/COIN TOSS/)
console.log('PASS: 01 scoring, 3-dart lock, player/round rotation, bust, checkout, cricket scoring, round limit, split bull, online MATCH coin toss')
