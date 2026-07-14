import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('C:/dev/image-manager/.env.local', 'utf8')
const vars = {}
env.split('\n').forEach(line => {
  const [k, ...v] = line.split('=')
  if (k && v.length) vars[k.trim()] = v.join('=').trim()
})

const sb = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY)

const codes = `02-0013 02-0014 02-0018 02-0019 02-0032 02-0033 02-0035 02-0038 02-0040 02-0041
02-0048 02-0049 02-0050 02-0052 02-0053 02-0054 02-0056 02-0057 02-0059
02-0060 02-0061 02-0062 02-0063 02-0068 02-0069 02-0070 02-0075 02-0080
02-0083 02-0084 02-0086 02-0090 02-0094 02-0103 02-0104 02-0106 02-0108
02-0109 02-0112 02-0117 02-0118 02-0119 02-0120 02-0121 02-0125 02-0126
02-0127 02-0130 02-0131 02-0132 02-0141 02-0142 02-0144 02-0145 02-0146
02-0147 02-0148 02-0149 02-0152 02-0153 02-0154 02-0157 02-0158 02-0160
02-0164`.split(/\s+/).filter(Boolean)

console.log(`対象イベント数: ${codes.length}`)

const { data: events, error } = await sb
  .from('events')
  .select('id, event_code, name')
  .in('event_code', codes)

if (error) { console.error(error); process.exit(1) }

const foundCodes = new Set(events.map(e => e.event_code))
const notFound = codes.filter(c => !foundCodes.has(c))
if (notFound.length) console.log('DBに見つからないコード:', notFound.join(', '))

const eventIds = events.map(e => e.id)
const { data: images, error: imgErr } = await sb
  .from('images')
  .select('id, event_id, image_type, is_active, wp_file_name, file_name, image_width, image_height, file_type')
  .in('event_id', eventIds)

if (imgErr) { console.error(imgErr); process.exit(1) }

const byEvent = new Map()
for (const img of images) {
  if (!byEvent.has(img.event_id)) byEvent.set(img.event_id, [])
  byEvent.get(img.event_id).push(img)
}

let onlyOriginal = 0, hasThumbNoWp = 0, notActive = 0, noImages = 0, other = 0
for (const ev of events) {
  const imgs = (byEvent.get(ev.id) || []).filter(i => i.is_active)
  const inactiveCount = (byEvent.get(ev.id) || []).length - imgs.length
  const types = imgs.map(i => i.image_type)
  const thumb = imgs.find(i => i.image_type === '600x400')
  let status
  if (imgs.length === 0) { status = '画像なし(active)'; noImages++ }
  else if (!thumb) { status = `600x400なし(active画像:${imgs.length}件, type=${types.join(',')})`; onlyOriginal++ }
  else if (!thumb.wp_file_name) { status = '600x400あり・WP未登録'; hasThumbNoWp++ }
  else { status = 'WP登録済(export対象のはず？要再確認)'; other++ }
  if (inactiveCount > 0) status += ` [非activeが${inactiveCount}件]`
  console.log(`${ev.event_code}\t${ev.name}\t${status}`)
}

console.log('\n===== 集計 =====')
console.log(`active画像なし: ${noImages}`)
console.log(`600x400なし: ${onlyOriginal}`)
console.log(`600x400ありWP未登録: ${hasThumbNoWp}`)
console.log(`WP登録済(export条件は満たしているはず): ${other}`)

console.log('\n===== カテゴリ02の全イベントコード範囲確認 =====')
const { data: allCat02 } = await sb.from('events').select('event_code').eq('category_id', '02').order('event_code')
const allCodes = allCat02.map(e => e.event_code)
console.log(`カテゴリ02合計: ${allCodes.length}件`)
console.log(`最小: ${allCodes[0]} / 最大: ${allCodes[allCodes.length-1]}`)
// 0001~0170の中で欠番になっているものを列挙
const existingNums = new Set(allCodes.map(c => parseInt(c.split('-')[1], 10)))
const gaps = []
for (let i = 1; i <= 170; i++) if (!existingNums.has(i)) gaps.push(`02-${String(i).padStart(4,'0')}`)
console.log(`1~170の欠番数: ${gaps.length}`)
console.log('欠番一覧:', gaps.join(', '))

console.log('\n===== 14件の元画像の詳細 =====')
const targetCodes = ['02-0013','02-0018','02-0019','02-0035','02-0056','02-0061','02-0068','02-0108','02-0117','02-0118','02-0126','02-0127','02-0130','02-0148']
const { data: targetEvents } = await sb.from('events').select('id, event_code, name').in('event_code', targetCodes)
const idByCode = new Map(targetEvents.map(e => [e.event_code, e.id]))
const { data: origImgs } = await sb.from('images').select('id, event_id, file_name, file_type, image_width, image_height, r2_url, wp_file_name').in('event_id', targetEvents.map(e=>e.id)).eq('is_active', true)
for (const code of targetCodes) {
  const id = idByCode.get(code)
  const img = origImgs.find(i => i.event_id === id)
  console.log(`${code}\t${img?.file_name}\t${img?.file_type}\t${img?.image_width}x${img?.image_height}`)
}
