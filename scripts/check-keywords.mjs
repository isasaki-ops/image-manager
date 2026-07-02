import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { count: total } = await sb.from('events').select('*', { count: 'exact', head: true })
const { count: withKw } = await sb.from('events').select('*', { count: 'exact', head: true }).not('keywords', 'is', null).neq('keywords', '')
const { count: noKw } = await sb.from('events').select('*', { count: 'exact', head: true }).or('keywords.is.null,keywords.eq.')

console.log(`全イベント: ${total}件`)
console.log(`キーワードあり: ${withKw}件`)
console.log(`キーワードなし/空: ${noKw}件`)

const { data: noKwList } = await sb.from('events').select('name, category_id, keywords').or('keywords.is.null,keywords.eq.').order('name').limit(30)
if (noKwList?.length) {
  console.log('\nキーワードなし一覧:')
  for (const e of noKwList) console.log(`  [${e.category_id}] ${e.name}`)
}
