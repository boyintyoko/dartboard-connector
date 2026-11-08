import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { format } from '../packages/dartboard-connector/dist/format.js'
import { DARTSLIVEHomeConnector } from '../packages/dartboard-connector/dist/DARTSLIVEHomeConnector.js'

// Segment codes are 1-based: 1–20, 21–40, 41–60, 61–80.
for (const [block, ratio] of [[0, 1], [1, 1], [2, 2], [3, 3]]) {
  for (let base = 1; base <= 20; base++) {
    const signal = format(block * 20 + base)
    assert.equal(signal.type, 'segment')
    assert.equal(signal.base, base)
    assert.equal(signal.ratio, ratio, `code ${block * 20 + base} must be ${ratio} × ${base}`)
  }
}

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'darts-ble-test-'))
try {
  for (const name of ['game', 'board-input']) {
    const src = await fs.readFile(`example/src/lib/${name}.ts`, 'utf8')
    const code = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText.replace("from './game'", "from './game.mjs'")
    await fs.writeFile(path.join(temp, `${name}.mjs`), code)
  }
  const { createGame } = await import(pathToFileURL(path.join(temp, 'game.mjs')))
  const { receiveBoardSignal } = await import(pathToFileURL(path.join(temp, 'board-input.mjs')))
  class Characteristic extends EventTarget {
    properties = { notify: true }
    value = new DataView(new ArrayBuffer(0))
    async startNotifications() { return this }
    notify(bytes) { this.value = new DataView(Uint8Array.from(bytes).buffer); this.dispatchEvent(new Event('characteristicvaluechanged')) }
  }
  const characteristic = new Characteristic()
  let connected = false
  const server = { get connected() { return connected }, async connect() { connected = true; return this }, disconnect() { connected = false }, async getPrimaryService(uuid) { assert.equal(uuid, '6e400001-b5a3-f393-e0a9-e50e24dcca9e'); return { async getCharacteristics() { return [characteristic] } } } }
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { bluetooth: { async requestDevice() { return { gatt: server } } } } })
  try {
    const connector = new DARTSLIVEHomeConnector()
    assert.equal(await connector.connect(), true)
    let game = null, received = 0, last
    let rawPacket
    const unsubscribe = await connector.subscribe((signal, raw) => { rawPacket = raw; received++; last = receiveBoardSignal(game, signal); game = last.game })
    characteristic.notify([0, 0, 81])
    assert.equal(game, null); assert.equal(last.detail, 'ゲーム開始待ち')
    game = createGame('01', ['A','B'], 701)
    // Send actual DataView notifications, rather than calling throwDart or using manual input.
    characteristic.notify([0,0,81]); assert.equal(game.players[0].score,651)
    characteristic.notify([0,0,1]); assert.equal(game.players[0].score,650)
    characteristic.notify([0,0,41]); assert.equal(game.players[0].score,648)
    characteristic.notify([0,0,81]); assert.equal(game.players[0].score,648); assert.match(last.detail,/CHANGE待ち/)
    characteristic.notify([0,0,84]); assert.equal(game.active,1); assert.equal(game.throws.length,0)
    characteristic.notify([0,0,82]); assert.equal(game.players[1].score,651)
    characteristic.notify([0,0]); assert.equal(game.players[1].score,651)
    game = createGame('01', ['A'], 701)
    characteristic.notify([0,0,20]); assert.equal(game.players[0].score,681); assert.equal(game.throws[0].ratio,1)
    characteristic.notify([0,0,60]); assert.equal(game.players[0].score,641); assert.equal(game.throws[1].ratio,2)
    characteristic.notify([0,0,80]); assert.deepEqual(rawPacket, { code: 80, hex: "00 00 50" }); assert.equal(game.players[0].score,581); assert.equal(game.throws[2].ratio,3)
    const before = received; unsubscribe(); characteristic.notify([0,0,81]); assert.equal(received,before)
    connector.disconnect(); assert.equal(connector.isConnected,false)
    console.log('PASS: mock GATT → notification DataView → shipped connector → shared Bluetooth handler → score, turn change, waiting diagnostics, short packet, unsubscribe')
  } finally {
    if (navigatorDescriptor) Object.defineProperty(globalThis,'navigator',navigatorDescriptor)
    else delete globalThis.navigator
  }
} finally { await fs.rm(temp, { recursive:true, force:true }) }
