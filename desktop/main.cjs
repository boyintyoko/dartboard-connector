const { app, BrowserWindow, dialog, ipcMain, session, shell } = require('electron')
const { spawn } = require('node:child_process')
const net = require('node:net')
const path = require('node:path')
const fs = require('node:fs')

let serverProcess
let mainWindow
let appUrl
let pendingBluetoothRequest = null
let pendingAuthCode = null
const protocolScheme = 'dartsroom'

const hasSingleInstance = app.requestSingleInstanceLock()
if (!hasSingleInstance) app.quit()

function deliverAuthCode(code) {
  if (!code) return
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isLoading()) {
    pendingAuthCode = code
    return
  }
  mainWindow.webContents.send('auth:callback', code)
}

function handleAuthDeepLink(value) {
  try {
    const url = new URL(value)
    if (url.protocol !== `${protocolScheme}:` || url.hostname !== 'auth' || url.pathname !== '/callback') return
    const code = url.searchParams.get('code')
    if (code && code.length < 4096) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.restore()
        mainWindow.setAlwaysOnTop(true)
        mainWindow.focus()
      }
      deliverAuthCode(code)
    }
  } catch { /* Ignore malformed protocol URLs. */ }
}

if (process.platform === 'win32' && process.argv[1]?.toLowerCase().startsWith(`${protocolScheme}:`)) {
  handleAuthDeepLink(process.argv[1])
}

if (hasSingleInstance) {
  app.on('second-instance', (_event, argv) => {
    const deepLink = argv.find((arg) => arg.toLowerCase().startsWith(`${protocolScheme}:`))
    if (deepLink) handleAuthDeepLink(deepLink)
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
  app.on('open-url', (event, url) => {
    event.preventDefault()
    handleAuthDeepLink(url)
  })
}

ipcMain.handle('auth:open-external', async (_event, value) => {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co') || url.pathname !== '/auth/v1/authorize' || url.searchParams.get('provider') !== 'google') {
      throw new Error('Google認証URLを確認できません。')
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setAlwaysOnTop(false)
      mainWindow.minimize()
    }
    await shell.openExternal(url.toString())
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error.message || 'ブラウザーを開けませんでした。' }
  }
})

ipcMain.on('auth:ready', () => {
  if (!pendingAuthCode) return
  const code = pendingAuthCode
  pendingAuthCode = null
  deliverAuthCode(code)
})

function findServerFile() {
  const unpackedRoot = path.join(process.resourcesPath, 'app.asar.unpacked', 'desktop', 'app')
  const root = fs.existsSync(unpackedRoot)
    ? unpackedRoot
    : path.join(app.getAppPath(), 'desktop', 'app')
  const candidates = [path.join(root, 'server.js'), path.join(root, 'example', 'server.js')]
  return candidates.find((candidate) => fs.existsSync(candidate))
}

function reservePort(port = 0) {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      const address = server.address()
      server.close((error) => error ? reject(error) : resolve(address.port))
    })
  })
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('ローカルゲームサーバーを起動できませんでした。')
}

async function startLocalServer() {
  const serverFile = findServerFile()
  if (!serverFile) throw new Error('アプリのゲームファイルが見つかりません。再インストールしてください。')
  // Keep the renderer origin stable so Supabase's PKCE verifier and login
  // session in localStorage survive app restarts. Fall back if another app
  // already owns the preferred local port.
  let port
  try { port = await reservePort(39173) } catch { port = await reservePort() }
  appUrl = `http://127.0.0.1:${port}`
  const logPath = path.join(app.getPath('userData'), 'server.log')
  const log = fs.createWriteStream(logPath, { flags: 'a' })
  serverProcess = spawn(process.execPath, [serverFile], {
    cwd: path.dirname(serverFile),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      HOSTNAME: '127.0.0.1',
      PORT: String(port),
      DARTS_ROOM_DESKTOP: '1',
      DARTS_ROOM_PUBLIC_ORIGIN: 'https://darts-room-match.onrender.com',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  serverProcess.stdout.pipe(log)
  serverProcess.stderr.pipe(log)
  serverProcess.once('error', (error) => log.write(`${error.stack || error}\n`))
  await waitForServer(appUrl)
}

function installBluetoothPicker(webContents) {
  webContents.on('select-bluetooth-device', (event, devices, callback) => {
    event.preventDefault()
    if (!pendingBluetoothRequest) {
      pendingBluetoothRequest = {
        callback,
        devices: new Map(),
        showTimer: null,
        emptyTimer: null,
        dialogOpen: false,
      }
    }
    const request = pendingBluetoothRequest
    request.callback = callback
    for (const device of devices) request.devices.set(device.deviceId, device)

    const finish = (deviceId = '') => {
      if (pendingBluetoothRequest !== request) return
      clearTimeout(request.showTimer)
      clearTimeout(request.emptyTimer)
      pendingBluetoothRequest = null
      request.callback(deviceId)
    }

    if (request.devices.size > 0) {
      clearTimeout(request.emptyTimer)
      if (request.showTimer || request.dialogOpen) return
      request.showTimer = setTimeout(async () => {
        request.showTimer = null
        if (pendingBluetoothRequest !== request || request.dialogOpen) return
        const found = [...request.devices.values()]
        request.dialogOpen = true
        try {
          const result = await dialog.showMessageBox(mainWindow, {
            type: 'question',
            title: 'Bluetoothボードを選択',
            message: '接続するダーツボードを選択してください。',
            detail: found.map((device) => device.deviceName || '名前のないBluetooth機器').join('\n'),
            buttons: [...found.map((device) => device.deviceName || 'Bluetooth機器'), 'キャンセル'],
            cancelId: found.length,
            defaultId: 0,
            noLink: true,
          })
          finish(result.response < found.length ? found[result.response].deviceId : '')
        } catch {
          finish('')
        }
      }, 900)
      return
    }

    if (!request.emptyTimer) {
      request.emptyTimer = setTimeout(async () => {
        if (pendingBluetoothRequest !== request || request.devices.size > 0) return
        await dialog.showMessageBox(mainWindow, {
          type: 'warning',
          title: 'Bluetoothボードが見つかりません',
          message: 'DARTSLIVE HOMEが見つかりませんでした。',
          detail: 'ボードの電源を入れてPCの近くに置き、他のアプリとの接続を切ってから再試行してください。WindowsのBluetoothもオンにしてください。',
          buttons: ['OK'],
          noLink: true,
        })
        finish('')
      }, 15000)
    }
  })
}

function installBluetoothPairingHandler(targetSession) {
  targetSession.setBluetoothPairingHandler(async (details, callback) => {
    if (details.pairingKind === 'providePin') {
      await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Bluetooth PINが必要です',
        message: 'このボードからPIN入力を求められました。',
        detail: 'DARTSLIVE HOMEの通常接続ではPIN入力は必要ありません。WindowsのBluetooth設定でボードをペアリングしてから、もう一度接続してください。',
        buttons: ['OK'],
        noLink: true,
      })
      callback({ confirmed: false })
      return
    }

    const detail = details.pairingKind === 'confirmPin'
      ? `ボードに表示されたPINが「${details.pin}」と一致することを確認してください。`
      : 'DARTSLIVE HOMEとのBluetoothペアリングを許可しますか？'
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: 'Bluetoothペアリング',
      message: detail,
      buttons: ['許可', 'キャンセル'],
      cancelId: 1,
      defaultId: 0,
      noLink: true,
    })
    callback({ confirmed: result.response === 0 })
  })
}

function allowAppPermissions(targetSession) {
  const isAppOrigin = (origin) => {
    try { return new URL(origin).origin === appUrl } catch { return false }
  }
  targetSession.setPermissionCheckHandler((_contents, permission, origin) => {
    return isAppOrigin(origin) && ['bluetooth', 'media'].includes(permission)
  })
  targetSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    const origin = details.requestingUrl || contents.getURL()
    callback(isAppOrigin(origin) && ['bluetooth', 'media'].includes(permission))
  })
}

async function createWindow() {
  const targetSession = session.defaultSession
  allowAppPermissions(targetSession)
  installBluetoothPairingHandler(targetSession)

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#080c12',
    autoHideMenuBar: true,
    show: false,
    kiosk: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  mainWindow.removeMenu()
  installBluetoothPicker(mainWindow.webContents)
  mainWindow.once('ready-to-show', () => {
    mainWindow.setAlwaysOnTop(true)
    mainWindow.show()
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  await mainWindow.loadURL(appUrl)
}

app.whenReady().then(async () => {
  if (process.platform === 'win32' && process.defaultApp) {
    app.setAsDefaultProtocolClient(protocolScheme, process.execPath, [path.resolve(process.argv[1])])
  } else {
    app.setAsDefaultProtocolClient(protocolScheme)
  }
  try {
    await startLocalServer()
    await createWindow()
  } catch (error) {
    dialog.showErrorBox('Darts Roomを起動できません', error.message || String(error))
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && appUrl) createWindow()
})

app.on('before-quit', () => {
  if (serverProcess && !serverProcess.killed) serverProcess.kill()
})

app.on('window-all-closed', () => app.quit())
