import ts from 'typescript'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const js = ts.transpileModule(fs.readFileSync('example/src/lib/game.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText
const {createGame,throwDart,nextTurn,roboAim,resolveMatchCoinToss,chooseMatchFirst,chooseMatchGame} = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
const practice = mode => createGame('practice',['A'],501,'fat','master',20,3,'loser','01',mode)
for (const mode of ['count-up','cricket-count-up','eagles-eye','shoot-out']) assert.equal(practice(mode).players[0].score,0)
let g = practice('cricket-count-up'); g=throwDart(g,{base:20,ratio:3}); g=throwDart(g,{base:19,ratio:3}); assert.equal(g.players[0].score,60)
g = nextTurn(g); assert.equal(g.round,2); g=throwDart(g,{base:19,ratio:2}); assert.equal(g.players[0].score,98)
g=practice('half-it'); g=nextTurn(g); assert.equal(g.players[0].score,20); assert.equal(g.players[0].darts,3)
g=practice('shoot-out'); const before=g; g=throwDart(g,{base:1,ratio:3}); assert.deepEqual(before.practiceOpened,[]); assert.equal(g.players[0].score,3)
g=throwDart(g,{base:1,ratio:3}); assert.equal(g.players[0].score,3)
g=throwDart(g,{base:2,ratio:3}); assert.equal(g.players[0].score,15)
for(const out of ['master','double','open']) {
  for(const bull of ['split','fat']) {
    g=createGame('match',['YOU','ROBO · NORMAL'],50,bull,out)
    g=resolveMatchCoinToss(g,1); assert.equal(g.bull,bull)
    const hit=roboAim(g); g=throwDart(g,hit)
    assert.equal(g.match.legWins[1],1); assert.equal(g.bull,bull); assert.equal(g.active,0); assert.equal(g.throws.length,0)
    g.match={...g.match,stage:'choice',choiceOwner:1}; g=chooseMatchFirst(g,'game'); g=chooseMatchGame(g,'01',50); assert.equal(g.bull,bull)
  }
}
g=createGame('01',['A'],101,'split','master'); g=throwDart(g,{base:20,ratio:3}); g=throwDart(g,{base:20,ratio:2}); assert.equal(g.bust,true); assert.equal(g.players[0].score,101); assert.equal(g.players[0].points,0)
g=practice('count-up'); for(let round=0;round<8;round++)g=nextTurn(g); assert.equal(g.finished,true); assert.equal(g.players[0].darts,24)
console.log('PASS: practice scoring, skipped throws, undo immutability, split/fat bull across ROBO MATCH legs and choice, CPU checkouts, bust stats, completion')
