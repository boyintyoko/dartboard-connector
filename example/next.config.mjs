const isDevelopment = process.env.NODE_ENV === 'development'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep a production build from replacing files used by a running dev server.
  distDir: isDevelopment ? '.next-dev' : '.next',
}

export default nextConfig
