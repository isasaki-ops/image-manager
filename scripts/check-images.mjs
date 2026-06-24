import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { count: total } = await sb.from('images').select('*', { count: 'exact', head: true }).eq('is_active', true)
const { count: linked } = await sb.from('images').select('*', { count: 'exact', head: true }).eq('is_active', true).not('event_id', 'is', null)
const { count: unlinked } = await sb.from('images').select('*', { count: 'exact', head: true }).eq('is_active', true).is('event_id', null)

const { count: origLinked } = await sb.from('images').select('*', { count: 'exact', head: true }).eq('is_active', true).eq('image_type', 'original').not('event_id', 'is', null)
const { count: origUnlinked } = await sb.from('images').select('*', { count: 'exact', head: true }).eq('is_active', true).eq('image_type', 'original').is('event_id', null)
const { count: thumbLinked } = await sb.from('images').select('*', { count: 'exact', head: true }).eq('is_active', true).eq('image_type', '600x400').not('event_id', 'is', null)
const { count: thumbUnlinked } = await sb.from('images').select('*', { count: 'exact', head: true }).eq('is_active', true).eq('image_type', '600x400').is('event_id', null)

console.log(`全画像: ${total}件`)
console.log(`  イベント紐づき済み: ${linked}件 (${Math.round(linked/total*100)}%)`)
console.log(`  未紐づき:         ${unlinked}件 (${Math.round(unlinked/total*100)}%)`)
console.log('')
console.log(`オリジナル: 紐づき ${origLinked}件 / 未紐づき ${origUnlinked}件`)
console.log(`600×400:   紐づき ${thumbLinked}件 / 未紐づき ${thumbUnlinked}件`)
