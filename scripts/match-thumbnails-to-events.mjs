/**
 * 600×400サムネイルを対応するオリジナル画像と同じevent_idで紐づける
 * file_nameカラムで照合: "烈ちゃん・蓮くん_600x400.jpg" → "烈ちゃん・蓮くん.png"
 *
 * 使い方:
 *   node --env-file=.env.local scripts/match-thumbnails-to-events.mjs          # dry-run
 *   node --env-file=.env.local scripts/match-thumbnails-to-events.mjs --apply  # 適用
 */

import { createClient } from '@supabase/supabase-js'

const DRY_RUN = !process.argv.includes('--apply')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

console.log(DRY_RUN ? '🔍 DRY-RUN モード' : '✏️  APPLY モード')
console.log('')

// サムネイルのfile_nameサンプルを確認
const { data: thumbSamples } = await sb
  .from('images')
  .select('r2_key, file_name')
  .eq('image_type', '600x400')
  .is('event_id', null)
  .not('file_name', 'is', null)
  .limit(5)

console.log('サムネイルfile_nameサンプル:')
for (const s of thumbSamples ?? []) console.log(`  r2_key=${s.r2_key}  file_name=${s.file_name}`)
console.log('')

// 全サムネイル（未紐づき）
const { data: thumbnails } = await sb
  .from('images')
  .select('id, r2_key, file_name')
  .eq('image_type', '600x400')
  .is('event_id', null)
console.log(`未紐づきサムネイル: ${thumbnails?.length}件`)

// event_idが設定済みのオリジナル画像（file_nameで照合）
const { data: originals } = await sb
  .from('images')
  .select('id, file_name, event_id')
  .eq('image_type', 'original')
  .not('event_id', 'is', null)
  .not('file_name', 'is', null)
console.log(`紐づき済みオリジナル: ${originals?.length}件\n`)

// オリジナルのfile_nameベース（拡張子なし）→ event_idのマップ
const originalMap = new Map()
for (const o of originals ?? []) {
  const base = o.file_name.replace(/\.[^.]+$/, '')
  originalMap.set(base, o.event_id)
}

// サムネイルのfile_nameからオリジナルのベース名を取得
// 例: "烈ちゃん・蓮くん_600x400.jpg" → "烈ちゃん・蓮くん"
function guessOriginalBase(fileName) {
  if (!fileName) return null
  // _600x400 を削除して拡張子も削除
  const withoutExt = fileName.replace(/\.[^.]+$/, '')
  const withoutSuffix = withoutExt.replace(/_600x400$/, '')
  return withoutSuffix || null
}

let matched = 0
let unmatched = 0
const toUpdate = [] // { id, event_id }

for (const thumb of thumbnails ?? []) {
  const origBase = guessOriginalBase(thumb.file_name)
  if (!origBase) { unmatched++; continue }

  const eventId = originalMap.get(origBase)
  if (eventId) {
    toUpdate.push({ id: thumb.id, event_id: eventId })
    matched++
  } else {
    unmatched++
  }
}

console.log('========================================')
console.log(`✅ マッチ: ${matched}件`)
console.log(`❌ 未マッチ: ${unmatched}件（オリジナルが未紐づきor file_nameなし）`)
console.log('========================================\n')

if (!DRY_RUN && toUpdate.length > 0) {
  console.log(`📝 ${toUpdate.length}件のサムネイルにevent_idを設定します...`)

  const byEvent = new Map()
  for (const u of toUpdate) {
    if (!byEvent.has(u.event_id)) byEvent.set(u.event_id, [])
    byEvent.get(u.event_id).push(u.id)
  }

  let updated = 0
  let failed = 0
  for (const [eventId, ids] of byEvent) {
    const { error } = await sb.from('images').update({ event_id: eventId }).in('id', ids)
    if (error) {
      console.log(`  ERROR: ${error.message}`)
      failed += ids.length
    } else {
      updated += ids.length
    }
  }
  console.log(`\n✅ 完了: 更新 ${updated}件 / 失敗 ${failed}件`)
} else if (!DRY_RUN) {
  console.log('マッチしたサムネイルがないため更新しません')
} else if (matched > 0) {
  console.log('💡 問題なければ --apply を付けて再実行してください')
}
