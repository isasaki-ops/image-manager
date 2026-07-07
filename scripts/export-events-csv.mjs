/**
 * イベント一覧をCSVエクスポート
 * node --env-file=.env.local scripts/export-events-csv.mjs
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const OUTPUT_CSV = path.join(process.cwd(), 'イベント一覧.csv')

const CATEGORY_LABEL = { '01': '取材', '02': '来店' }
const REGION_LABEL = {
  hokkaido: '北海道',
  tohoku: '東北',
  kanto: '関東',
  tokai: '東海',
  kansai: '関西',
  kyushu: '九州',
}

const { data: events, error } = await sb
  .from('events')
  .select('event_code, category_id, name, keywords, memo, region_ids, created_at')
  .order('event_code')

if (error) {
  console.error('取得エラー:', error)
  process.exit(1)
}

const { data: images } = await sb.from('images').select('event_id')
const imageCountByEvent = {}
for (const img of images ?? []) {
  if (!img.event_id) continue
  imageCountByEvent[img.event_id] = (imageCountByEvent[img.event_id] ?? 0) + 1
}
// event_idはevents.idなので、event_code紐付けのため別途id取得
const { data: eventsWithId } = await sb.from('events').select('id, event_code')
const idByCode = Object.fromEntries((eventsWithId ?? []).map((e) => [e.event_code, e.id]))

const header = 'イベントコード,カテゴリ,イベント名,地方,検索キーワード,メモ,画像枚数,登録日時'
const rows = events.map((e) => {
  const regionLabels = (e.region_ids ?? []).map((id) => REGION_LABEL[id] ?? id).join('/')
  const imageCount = imageCountByEvent[idByCode[e.event_code]] ?? 0
  return [
    e.event_code,
    CATEGORY_LABEL[e.category_id] ?? e.category_id,
    e.name,
    regionLabels || '設定なし',
    e.keywords ?? '',
    e.memo ?? '',
    imageCount,
    e.created_at,
  ]
    .map((v) => `"${String(v).replace(/"/g, '""')}"`)
    .join(',')
})

fs.writeFileSync(OUTPUT_CSV, '﻿' + header + '\n' + rows.join('\n'), 'utf8')
console.log(`イベント一覧を出力: ${OUTPUT_CSV} (${events.length}件)`)
