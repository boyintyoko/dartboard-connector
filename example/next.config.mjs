import path from 'node:path'
import { fileURLToPath } from 'node:url'

const isDevelopment = process.env.NODE_ENV === 'development'
const isDesktopBuild = process.env.BUILD_DESKTOP === '1'
const exampleDir = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep a production build from replacing files used by a running dev server.
  distDir: isDevelopment ? '.next-dev' : '.next',
  ...(isDesktopBuild ? {
    output: 'standalone',
    experimental: {
      outputFileTracingRoot: path.resolve(exampleDir, '..'),
    },
  } : {}),
}

export default nextConfig
