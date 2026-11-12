import { spawnSync } from 'node:child_process'
import { cp, mkdir, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const example = path.join(root, 'example')
const standalone = path.join(example, '.next', 'standalone')
const appOutput = path.join(root, 'desktop', 'app')

const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next')
const build = spawnSync(process.execPath, [nextBin, 'build'], {
  cwd: example,
  env: { ...process.env, NODE_ENV: 'production', BUILD_DESKTOP: '1' },
  stdio: 'inherit',
})

if (build.status !== 0) process.exit(build.status ?? 1)

await rm(appOutput, { recursive: true, force: true })
await mkdir(appOutput, { recursive: true })
await cp(standalone, appOutput, { recursive: true })

async function findServer(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  if (entries.some((entry) => entry.isFile() && entry.name === 'server.js')) {
    return path.join(dir, 'server.js')
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'node_modules') continue
    const found = await findServer(path.join(dir, entry.name))
    if (found) return found
  }
  return null
}

const serverFile = await findServer(appOutput)
if (!serverFile) throw new Error(`Next standalone server.js was not found under ${appOutput}`)

const serverDir = path.dirname(serverFile)
await cp(path.join(example, 'public'), path.join(serverDir, 'public'), { recursive: true, force: true })
await mkdir(path.join(serverDir, '.next'), { recursive: true })
await cp(path.join(example, '.next', 'static'), path.join(serverDir, '.next', 'static'), { recursive: true, force: true })

console.log(`Desktop app assembled: ${serverFile}`)
