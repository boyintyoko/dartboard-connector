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
  return Response.json({ configured: true, url, key }, { headers: { 'Cache-Control': 'no-store' } })
}
