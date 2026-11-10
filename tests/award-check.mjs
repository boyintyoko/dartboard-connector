import ts from 'typescript'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const js=ts.transpileModule(fs.readFileSync('example/src/lib/game.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText
const {createGame,throwDart,nextTurn,resolveMatchCoinToss}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
const visit=(g,hits)=>hits.reduce((g,[base,ratio=1])=>throwDart(g,{base,ratio}),g)
const zero=()=>createGame('01',['A','B'],701,'fat','open')
let g=visit(zero(),[[25],[25],[25]])
assert.equal(g.award.title,'HAT TRICK');assert.equal(g.award.player,'A');assert.equal(nextTurn(g).award,null)
assert.equal(visit(zero(),[[25],[0],[0]]).award.title,'ONE BULL')
for(const hits of [[[25],[25],[0]],[[20,3],[20,2],[0]],[[25],[25],[25]]])assert.equal(visit(zero(),hits).award.title,hits.every(([base])=>base===25)?'HAT TRICK':'LOW TON')
assert.equal(visit(zero(),[[20,3],[20,3],[20,2]]).award.title,'HIGH TON')
assert.equal(visit(zero(),[[20],[20],[20]]).award,null)
for(const marks of [5,6,7,8,9]) {
  const ratios={5:[3,1,1],6:[3,2,1],7:[3,3,1],8:[3,3,2],9:[3,3,3]}[marks]
  g=visit(createGame('cricket',['A','B']),ratios.map((ratio,i)=>[marks === 9 ? [20,20,19][i] : 20-i,ratio]))
  assert.equal(g.award.title,`${marks} MARKS`)
  assert.equal(g.turnMarks,marks)
}
g=createGame('cricket',['A','B']);g.players.forEach(p=>p.marks[20]=3)
g=visit(g,[[20,3],[20,3],[20,3]]);assert.equal(g.award,null)
g=createGame('cricket',['A','B']);g.players[1].marks[20]=3
g=visit(g,[[20,3],[20,3],[20,3]]);assert.equal(g.turnMarks,3);assert.equal(g.award,null)
g=visit(createGame('01',['A','B'],110,'fat','open'),[[25],[25],[20]])
assert.equal(g.bust,true);assert.equal(g.award,null)
g=visit(createGame('match',['A','B'],150,'fat','open'),[]);g=resolveMatchCoinToss(g,0)
g=visit(g,[[25],[25],[25]]);assert.equal(g.match.legIndex,1);assert.equal(g.award.title,'HAT TRICK');assert.equal(g.turnMarks,0)
g=visit(createGame('01',['A','B'],50,'fat','open'),[[25]]);assert.equal(g.finished,true);assert.equal(g.award.title,'ONE BULL')
g=throwDart(zero(),{base:25,ratio:1});assert.equal(g.award,null)
for(const [hits,title,call] of [
  [[[25,2],[25,2],[25,2]],'THREE IN THE BLACK','ナイスブラック！'],
  [[[20,3],[20,3],[20,3]],'TON80','ナイストンパ！'],
  [[[19,3],[19,3],[19,3]],'THREE IN A BED','ナイスベッド！'],
  [[[20,2],[20,2],[20,2]],'THREE IN A BED','ナイスベッド！'],
  [[[20,3],[19,3],[18,3]],'HIGH TON','ナイスハイトン！'],
]) {
 const award=visit(zero(),hits).award;assert.equal(award.title,title);assert.equal(award.call,call)
}
g=visit(createGame('cricket',['A','B']),[[20,3],[19,3],[18,3]])
assert.equal(g.award.title,'WHITE HORSE');assert.equal(g.award.call,'ナイスホース！')
// WHITE HORSE follows the physical three-distinct-triples condition, including closed numbers.
for (const mode of ['cricket','robo','match']) {
  g=createGame(mode,['A','B'],701,'fat','open',20,3,'loser','cricket')
  if(mode==='match'){g=resolveMatchCoinToss(g,0);g.legMode='cricket'}
  g.players.forEach(p=>{p.marks[20]=3;p.marks[19]=3;p.marks[18]=3})
  g=visit(g,[[20,3],[19,3],[18,3]])
  assert.equal(g.turnMarks,0)
  assert.equal(g.award.title,'WHITE HORSE')
}
g=createGame('cricket',['A']);g.players[0].marks[20]=3
g=visit(g,[[18,3],[20,3],[19,3]])
assert.equal(g.award.title,'WHITE HORSE')
g=visit(createGame('cricket',['A','B']),[[20,3],[19,3],[14,3]])
assert.notEqual(g.award?.title,'WHITE HORSE')
console.log('PASS: all awards and Japanese calls, priority, exact scores, valid cricket areas, bust exclusion, early checkout and MATCH transition preservation')
