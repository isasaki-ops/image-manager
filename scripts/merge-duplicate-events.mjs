/**
 * 全角/半角の表記ゆれで重複登録されていた同名イベントを統合するスクリプト
 *
 * 使い方（プロジェクトルートから実行）:
 *   node --env-file=.env.local scripts/merge-duplicate-events.mjs         # dry-run
 *   node --env-file=.env.local scripts/merge-duplicate-events.mjs --apply # 実際に統合を実行
 *
 * 動作:
 * - name が完全一致する複数イベントをグループ化
 * - 各グループ内で event_code が最も若い（＝先に作成された）イベントを残す
 * - 他のイベントの画像を残すイベントへ付け替え（sort_orderは既存の続きに採番）
 * - 画像付け替え後、重複イベント自体を削除
 */

import { createClient } from '@supabase/supabase-js'

const required = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing env: ${key}`)
    process.exit(1)
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const apply = process.argv.includes('--apply')

const all = []
let offset = 0
for (;;) {
  const { data, error } = await supabase
    .from('events')
    .select('id, name, event_code, region_ids')
    .range(offset, offset + 999)
  if (error) {
    console.error('DB取得エラー:', error.message)
    process.exit(1)
  }
  all.push(...(data ?? []))
  if (!data || data.length < 1000) break
  offset += 1000
}

const byName = new Map()
for (const e of all) {
  if (!byName.has(e.name)) byName.set(e.name, [])
  byName.get(e.name).push(e)
}
const groups = [...byName.entries()].filter(([, v]) => v.length > 1)

console.log(`重複グループ数: ${groups.length}\n`)

let totalMoved = 0
let totalDeleted = 0

for (const [name, list] of groups) {
  const sorted = [...list].sort((a, b) => a.event_code.localeCompare(b.event_code))
  const keep = sorted[0]
  const drops = sorted.slice(1)

  console.log(`"${name}"`)
  console.log(`  残す: ${keep.event_code} (${keep.id})`)

  const { data: keepImages } = await supabase
    .from('images')
    .select('sort_order')
    .eq('event_id', keep.id)
  let nextSortOrder = Math.max(0, ...(keepImages ?? []).map((i) => i.sort_order ?? 0)) + 1

  for (const drop of drops) {
    const { data: dropImages } = await supabase
      .from('images')
      .select('id, sort_order, uploaded_at')
      .eq('event_id', drop.id)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('uploaded_at', { ascending: true })

    console.log(`  統合: ${drop.event_code} (${drop.id}) — 画像${dropImages?.length ?? 0}枚を移動`)

    if (apply) {
      for (const img of dropImages ?? []) {
        const { error } = await supabase
          .from('images')
          .update({ event_id: keep.id, sort_order: nextSortOrder })
          .eq('id', img.id)
        if (error) {
          console.log(`    ERROR (画像 ${img.id}): ${error.message}`)
        } else {
          nextSortOrder++
          totalMoved++
        }
      }

      // region_idsのユニオン（両者が異なる地方タグを持つ場合に備えて）
      const unionRegions = Array.from(new Set([...(keep.region_ids ?? []), ...(drop.region_ids ?? [])]))
      if (unionRegions.length !== (keep.region_ids ?? []).length) {
        await supabase.from('events').update({ region_ids: unionRegions }).eq('id', keep.id)
      }

      const { error: delError } = await supabase.from('events').delete().eq('id', drop.id)
      if (delError) {
        console.log(`    ERROR (イベント削除 ${drop.id}): ${delError.message}`)
      } else {
        totalDeleted++
      }
    } else {
      totalMoved += dropImages?.length ?? 0
      totalDeleted++
    }
  }
  console.log('')
}

console.log(`${apply ? '完了' : '(dry-run) 見込み'}: 画像移動 ${totalMoved}枚 / イベント削除 ${totalDeleted}件`)
if (!apply) console.log('実際に反映するには --apply を付けて実行してください')
