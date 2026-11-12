const { app, BrowserWindow, dialog, session, shell } = require('electron')
const { spawn } = require('node:child_process')
const net = require('node:net')
const path = require('node:path')
const fs = require('node:fs')

let serverProcess
let mainWindow
let appUrl

function findServerFile() {
  const root = path.join(app.getAppPath(), 'desktop', 'app')
  const candidates = [path.join(root, 'server.js'), path.join(root, 'example', 'server.js')]
  return candidates.find((candidate) => fs.existsSync(candidate))
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
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
  const port = await reservePort()
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
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  serverProcess.stdout.pipe(log)
  serverProcess.stderr.pipe(log)
  serverProcess.once('error', (error) => log.write(`${error.stack || error}\n`))
  await waitForServer(appUrl)
}

function installBluetoothPicker(webContents) {
  webContents.on('select-bluetooth-device', async (event, devices, callback) => {
    event.preventDefault()
    const options = devices.map((device) => `${device.deviceName || 'Bluetooth device'}  (${device.deviceId})`)
    if (!options.length) {
      callback('')
      return
    }
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: 'Bluetoothボードを選択',
      message: '接続するダーツボードを選択してください。',
      detail: options.join('\n'),
      buttons: [...devices.map((device) => device.deviceName || device.deviceId), 'キャンセル'],
      cancelId: devices.length,
      defaultId: 0,
      noLink: true,
    })
    callback(result.response < devices.length ? devices[result.response].deviceId : '')
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

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#080c12',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  mainWindow.removeMenu()
  installBluetoothPicker(mainWindow.webContents)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && (input.key === 'F11' || (input.alt && input.key === 'Enter'))) {
      mainWindow.setFullScreen(!mainWindow.isFullScreen())
      event.preventDefault()
    }
  })
  mainWindow.once('ready-to-show', () => {
    mainWindow.setFullScreen(true)
    mainWindow.show()
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  await mainWindow.loadURL(appUrl)
}

app.whenReady().then(async () => {
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
