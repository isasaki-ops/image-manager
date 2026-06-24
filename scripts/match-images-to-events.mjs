/**
 * 元ファイル名をイベント名とマッチングしてevent_idを設定する
 *
 * 使い方:
 *   node --env-file=.env.local scripts/match-images-to-events.mjs          # dry-run（確認のみ）
 *   node --env-file=.env.local scripts/match-images-to-events.mjs --apply  # 実際に適用
 */

import { createClient } from '@supabase/supabase-js'

const DRY_RUN = !process.argv.includes('--apply')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// ============================================================
// ユーティリティ
// ============================================================

/** search_textの1行目からファイル名（拡張子なし）を取得 */
function extractOriginalName(searchText) {
  if (!searchText) return null
  const firstLine = searchText.split('\n')[0].trim()
  return firstLine.replace(/\.(png|jpg|jpeg|gif|webp|PNG|JPG|JPEG)$/, '').trim()
}

/** 文字列を正規化 */
function normalize(str) {
  if (!str) return ''
  return str
    .replace(/　/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[「」【】〔〕（）()]/g, '')
    .replace(/[、。・,\.]/g, '')
    .replace(/[＆&]/g, '')
    .replace(/[:：]/g, '')    // コロン除去（「勝又:」→「勝又」）
    .replace(/取材$/, '')
    .replace(/来店$/, '')
    .trim()
}

/** 完全一致（正規化後） */
function isExactMatch(a, b) {
  const na = normalize(a)
  const nb = normalize(b)
  if (!na || !nb) return false
  return na === nb
}

/**
 * 高品質な部分一致:
 * - 短い方が3文字以上
 * - 短い方の長さが長い方の30%以上
 * - 短い方が長い方に含まれる
 */
function isQualityPartialMatch(a, b) {
  const na = normalize(a)
  const nb = normalize(b)
  if (!na || !nb) return false

  const shorter = na.length <= nb.length ? na : nb
  const longer  = na.length <= nb.length ? nb : na

  // 最小文字数チェック（2文字以下での誤マッチ防止）
  if (shorter.length < 3) return false

  // 長さ比率チェック（短い方が長い方の30%以上）
  if (shorter.length / longer.length < 0.3) return false

  return longer.includes(shorter)
}

/**
 * 部分一致の中でもっとも一致率が高い（短い方 / 長い方）イベントを返す
 * 一致率が高い＝より具体的なイベントに紐づけられる
 */
function findBestPartialMatch(extracted, events) {
  let best = null
  let bestRatio = 0
  for (const e of events) {
    if (isQualityPartialMatch(extracted, e.name)) {
      const na = normalize(extracted)
      const nb = normalize(e.name)
      const ratio = Math.min(na.length, nb.length) / Math.max(na.length, nb.length)
      if (ratio > bestRatio) {
        bestRatio = ratio
        best = e
      }
    }
  }
  return best
}

// ============================================================
// メイン
// ============================================================

console.log(DRY_RUN ? '🔍 DRY-RUN モード（実際には更新しません）' : '✏️  APPLY モード（DBを更新します）')
console.log('')

const { data: events } = await sb.from('events').select('id, event_code, category_id, name')
console.log(`イベント総数: ${events.length}件`)

const { data: images } = await sb
  .from('images')
  .select('id, r2_key, search_text, image_type')
  .eq('is_active', true)
  .is('event_id', null)
  .eq('image_type', 'original')
console.log(`未紐づきオリジナル画像: ${images.length}件\n`)

// --- マッチング ---
const exactMatched   = []  // { image, event, extractedName }
const partialMatched = []  // { image, event, extractedName }
const unmatched      = []  // { image, extractedName }

for (const img of images) {
  const extracted = extractOriginalName(img.search_text)

  const exact = events.find(e => isExactMatch(extracted, e.name))
  if (exact) {
    exactMatched.push({ image: img, event: exact, extractedName: extracted })
    continue
  }

  const partial = findBestPartialMatch(extracted, events)
  if (partial) {
    partialMatched.push({ image: img, event: partial, extractedName: extracted })
    continue
  }

  unmatched.push({ image: img, extractedName: extracted })
}

const allMatched = [...exactMatched, ...partialMatched]

console.log('========================================')
console.log(`✅ 完全一致: ${exactMatched.length}件`)
console.log(`🔶 部分一致: ${partialMatched.length}件（品質フィルタ済み）`)
console.log(`❌ 未マッチ: ${unmatched.length}件`)
console.log('========================================\n')

// 部分一致の詳細
if (partialMatched.length > 0) {
  console.log('--- 部分一致の詳細 ---')
  for (const m of partialMatched) {
    console.log(`  [${m.event.event_code}] "${m.extractedName}" → "${m.event.name}"`)
  }
  console.log('')
}

// 未マッチ一覧
if (unmatched.length > 0) {
  console.log(`--- 未マッチ ${unmatched.length}件 ---`)
  for (const u of unmatched) {
    console.log(`  "${u.extractedName}"`)
  }
  console.log('')
}

// --- APPLY ---
if (!DRY_RUN && allMatched.length > 0) {
  console.log(`\n📝 ${allMatched.length}件のオリジナル画像にevent_idを設定します...`)

  const byEvent = new Map()
  for (const m of allMatched) {
    if (!byEvent.has(m.event.id)) byEvent.set(m.event.id, [])
    byEvent.get(m.event.id).push(m.image.id)
  }

  let updated = 0
  let failed = 0
  for (const [eventId, imageIds] of byEvent) {
    const { error } = await sb.from('images').update({ event_id: eventId }).in('id', imageIds)
    if (error) {
      console.log(`  ERROR (event ${eventId}): ${error.message}`)
      failed += imageIds.length
    } else {
      updated += imageIds.length
    }
  }
  console.log(`\n✅ 完了: 更新 ${updated}件 / 失敗 ${failed}件`)
  console.log('\n次のステップ: 600×400サイズの画像を同じevent_idで紐づけるには')
  console.log('  node --env-file=.env.local scripts/match-thumbnails-to-events.mjs --apply')
} else if (!DRY_RUN) {
  console.log('マッチした画像がないため更新しません')
} else {
  console.log('\n💡 問題なければ --apply を付けて再実行してください')
}
