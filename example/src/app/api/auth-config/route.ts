export const dynamic = 'force-dynamic'
export async function GET() {
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
