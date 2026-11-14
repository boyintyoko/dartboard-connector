export const dynamic = 'force-dynamic'
export async function GET() {
  // The packaged desktop build has no Render environment variables of its own.
  // It asks the public web deployment for the same publishable client config.
  if (process.env.DARTS_ROOM_DESKTOP === '1') {
    try {
      const response = await fetch(`${process.env.DARTS_ROOM_PUBLIC_ORIGIN || 'https://darts-room-match.onrender.com'}/api/auth-config`, {
        cache: 'no-store', signal: AbortSignal.timeout(60000),
      })
      if (!response.ok) throw new Error('Public auth config unavailable')
      const config = await response.json()
      return Response.json({
        configured: config.configured === true,
        url: typeof config.url === 'string' ? config.url : undefined,
        key: typeof config.key === 'string' ? config.key : undefined,
        googleEnabled: config.googleEnabled === true,
        providerCheckFailed: config.providerCheckFailed === true,
      }, { headers: { 'Cache-Control': 'no-store' } })
    } catch {
      return Response.json({ configured: false, providerCheckFailed: true }, { headers: { 'Cache-Control': 'no-store' } })
    }
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  // Only publishable/legacy anon keys belong in the browser. Reject secret/service keys.
  let publicKey = key?.startsWith('sb_publishable_') === true
  if (key && !publicKey) {
    try { publicKey = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'anon' } catch { /* Invalid key. */ }
  }
  if (!url || !key || !publicKey) return Response.json({ configured: false }, { headers: { 'Cache-Control': 'no-store' } })
  let googleEnabled = false, providerCheckFailed = false
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/auth/v1/settings`, {
      headers: { apikey: key }, cache: 'no-store', signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) throw new Error('Auth settings unavailable')
    const settings = await response.json()
    googleEnabled = settings.external?.google === true
  } catch { providerCheckFailed = true }
  return Response.json({ configured: true, url, key, googleEnabled, providerCheckFailed }, { headers: { 'Cache-Control': 'no-store' } })
}
