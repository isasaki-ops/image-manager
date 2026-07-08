/**
 * 登録済み全イベント名の全角英数字・記号を半角に変換するスクリプト
 *
 * 使い方（プロジェクトルートから実行）:
 *   node --env-file=.env.local scripts/normalize-fullwidth-names.mjs         # dry-run（変更対象を表示のみ）
 *   node --env-file=.env.local scripts/normalize-fullwidth-names.mjs --apply # 実際にUPDATEを実行
 *
 * 変換対象: Unicode「全角英数記号（U+FF01〜U+FF5E）」のみを対応する半角ASCIIに変換する。
 * ひらがな・カタカナ・漢字・波ダッシュ（〜/～）など、英数字記号の範囲外の文字は一切変更しない。
 * name変更に合わせて search_text（name + keywords）も再計算する。embeddingはevents検索で
 * 使用されていない（lib/search.tsはテキスト部分一致のみ）ため再生成しない。
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

function toHalfWidth(str) {
  return str.replace(/[！-～]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
  )
}

const apply = process.argv.includes('--apply')

// 全イベント取得（1000件ページング対応）
const all = []
let offset = 0
const PAGE = 1000
for (;;) {
  const { data, error } = await supabase
    .from('events')
    .select('id, name, keywords')
    .range(offset, offset + PAGE - 1)
  if (error) {
    console.error('DB取得エラー:', error.message)
    process.exit(1)
  }
  all.push(...(data ?? []))
  if (!data || data.length < PAGE) break
  offset += PAGE
}

console.log(`対象イベント数: ${all.length}件`)

const changes = []
for (const ev of all) {
  const newName = toHalfWidth(ev.name)
  if (newName !== ev.name) {
    changes.push({ id: ev.id, oldName: ev.name, newName, keywords: ev.keywords })
  }
}

console.log(`\n変更対象: ${changes.length}件\n`)
for (const c of changes) {
  console.log(`  "${c.oldName}" → "${c.newName}"`)
}

if (!apply) {
  console.log('\n(dry-run) 実際に反映するには --apply を付けて実行してください')
  process.exit(0)
}

let updated = 0
let failed = 0
for (const c of changes) {
  const searchText = [c.newName, c.keywords].filter(Boolean).join('\n')
  const { error } = await supabase
    .from('events')
    .update({ name: c.newName, search_text: searchText })
    .eq('id', c.id)
  if (error) {
    console.log(`ERROR (${c.oldName}): ${error.message}`)
    failed++
  } else {
    updated++
  }
}

console.log(`\n完了: 更新 ${updated}件 / 失敗 ${failed}件`)
