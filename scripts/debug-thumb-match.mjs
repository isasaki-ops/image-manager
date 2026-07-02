import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// サムネイル5件
const { data: thumbs } = await sb.from('images').select('r2_key').eq('image_type', '600x400').limit(5)
// オリジナル5件（全件）
const { data: origs } = await sb.from('images').select('r2_key, event_id').eq('image_type', 'original').limit(10)

console.log('サムネイル:')
for (const t of thumbs) {
  const base = t.r2_key.match(/^(.+)_600x400/)?.[1]
  console.log(`  ${t.r2_key}  →  base="${base}"`)
}

console.log('\nオリジナル:')
for (const o of origs) {
  const base = o.r2_key.replace(/\.[^.]+$/, '')
  console.log(`  ${o.r2_key}  →  base="${base}"  event_id=${o.event_id ? o.event_id.slice(0,8)+'...' : 'null'}`)
}
