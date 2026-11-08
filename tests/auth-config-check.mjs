import ts from 'typescript'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const js = ts.transpileModule(fs.readFileSync('example/src/app/api/auth-config/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText
const {GET} = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
const keys=['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']
const original=Object.fromEntries(keys.map(key=>[key,process.env[key]]))
try {
  keys.forEach(key=>delete process.env[key])
  assert.deepEqual(await (await GET()).json(),{configured:false})
  process.env.SUPABASE_URL='https://example.supabase.co'
  for(const key of ['sb_secret_example','invalid',`x.${Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')}.x`]){
    process.env.SUPABASE_PUBLISHABLE_KEY=key
    assert.deepEqual(await (await GET()).json(),{configured:false})
  }
  process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_example'
  const response=await GET()
  assert.equal(response.headers.get('Cache-Control'),'no-store')
  assert.equal((await response.json()).configured,true)
  console.log('PASS: unconfigured login and rejection of secret/service-role keys in public auth config')
} finally {keys.forEach(key=>original[key]===undefined ? delete process.env[key] : process.env[key]=original[key])}
