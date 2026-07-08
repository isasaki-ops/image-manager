/**
 * 開催案件一覧CSVと現在のDB登録イベントを比較し、未登録イベントをリストアップする（読み取り専用）
 *
 * 使い方（プロジェクトルートから実行）:
 *   node --env-file=.env.local scripts/diff-events-csv.mjs
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
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

function parseCSVLine(line) {
  const fields = []
  let current = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuote = !inQuote
    } else if (ch === ',' && !inQuote) {
      fields.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current.trim())
  return fields
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const csvPath = join(__dirname, '..', '開催案件一覧_過去12ヶ月_20260707.csv')
const raw = readFileSync(csvPath, 'utf-8').replace(/^﻿/, '')
const lines = raw.split('\n').filter((l) => l.trim())
const rows = lines.slice(1).map(parseCSVLine)

// CSV内のユニークイベント（既存のimport-events-csv.mjsと同じルール）
const csvEventMap = new Map() // name -> categoryId
for (const row of rows) {
  const nameRaw = row[4]
  const categoryRaw = row[5]
  if (!nameRaw || !categoryRaw) continue

  const categoryId = categoryRaw.trim() === '取材' ? '01' : categoryRaw.trim() === '来店' ? '02' : null
  if (!categoryId) continue

  const names = nameRaw.split(/[｜|]/).map((n) => n.trim()).filter(Boolean)
  for (const name of names) {
    if (name.includes('収録')) continue
    if (!csvEventMap.has(name)) {
      csvEventMap.set(name, categoryId)
    }
  }
}

console.log(`CSV内ユニークイベント数: ${csvEventMap.size}件`)

// 現在DBに登録済みの全イベント名を取得（ページング、1000件上限対策）
const existingNames = new Set()
let offset = 0
const PAGE = 1000
for (;;) {
  const { data, error } = await supabase
    .from('events')
    .select('name')
    .range(offset, offset + PAGE - 1)
  if (error) {
    console.error('DB取得エラー:', error.message)
    process.exit(1)
  }
  for (const row of data ?? []) existingNames.add(row.name)
  if (!data || data.length < PAGE) break
  offset += PAGE
}

console.log(`DB内登録済みイベント数: ${existingNames.size}件`)

// 差分（DB未登録）
const missing = []
for (const [name, categoryId] of csvEventMap) {
  if (!existingNames.has(name)) {
    missing.push({ name, categoryId })
  }
}

missing.sort((a, b) => (a.categoryId === b.categoryId ? a.name.localeCompare(b.name, 'ja') : a.categoryId.localeCompare(b.categoryId)))

console.log(`\n未登録イベント数: ${missing.length}件\n`)
const byCat = { '01': [], '02': [] }
for (const m of missing) byCat[m.categoryId].push(m.name)

console.log(`--- 取材（${byCat['01'].length}件） ---`)
for (const n of byCat['01']) console.log(`  ${n}`)
console.log(`\n--- 来店（${byCat['02'].length}件） ---`)
for (const n of byCat['02']) console.log(`  ${n}`)

// CSV出力（確認用）
const outPath = join(__dirname, '..', '未登録イベント一覧.csv')
const csvLines = ['name,category']
for (const m of missing) {
  const catLabel = m.categoryId === '01' ? '取材' : '来店'
  csvLines.push(`"${m.name.replace(/"/g, '""')}",${catLabel}`)
}
writeFileSync(outPath, csvLines.join('\n'), 'utf-8')
console.log(`\n未登録イベント一覧.csv に出力しました`)
