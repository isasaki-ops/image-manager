/**
 * CSVからイベントをSupabaseに一括登録するスクリプト
 *
 * 使い方（プロジェクトルートから実行）:
 *   node --env-file=.env.local scripts/import-events-csv.mjs
 *
 * 動作:
 * - 開催案件一覧_過去12ヶ月_20260619.csv の E列（イベント名）・F列（カテゴリ）を読み込む
 * - ｜で区切られた名前は個別イベントとして登録
 * - 同名イベントは重複スキップ
 * - 各イベントのキーワードをAI（Claude haiku）で生成し、embeddingも生成して登録
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

// --- Env check ---
const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
]
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
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// --- CSV parser (handles quoted fields) ---
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

// --- AI functions ---
async function generateKeywords(eventName) {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: `以下のイベント名に含まれる語句の「ひらがな読み」を出力してください。

ルール:
- 漢字・英語・カタカナのみ対象。すでにひらがなの部分は出力しない
- ひらがなのみのイベント名の場合は何も出力しない（完全に空欄）
- 英語の単語はひらがな読みを1つだけ出力する（例: SS→えすえす、CUBE→きゅーぶ）
- 漢字・カタカナの熟語・固有名詞は全体の読みを出力し、さらに各語の読みも出力する
- 人名は複数の読み方をすべて出力する（例: 梅屋シン→うめやしん うめや しん）
- 2文字以上のまとまった語のみ出力する
- すべてスペース区切りで並べる
- 記号・数字・句読点は無視する
- ひらがなのみ出力する（説明文不要）

イベント名: ${eventName}`,
    }],
  })
  const block = response.content[0]
  if (!block || block.type !== 'text') return ''
  return block.text.trim()
}

async function generateEmbedding(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  })
  return response.data[0].embedding
}

// --- Main ---
const __dirname = dirname(fileURLToPath(import.meta.url))
const csvPath = join(__dirname, '..', '開催案件一覧_過去12ヶ月_20260619.csv')
const raw = readFileSync(csvPath, 'utf-8').replace(/^﻿/, '') // strip BOM
const lines = raw.split('\n').filter((l) => l.trim())
const rows = lines.slice(1).map(parseCSVLine) // skip header row

// Collect unique (name, category_id) pairs
// Use Map<name, category_id> — same name always has same category
const eventMap = new Map()
for (const row of rows) {
  const nameRaw = row[4] // E column (0-indexed: A=0,B=1,C=2,D=3,E=4)
  const categoryRaw = row[5] // F column
  if (!nameRaw || !categoryRaw) continue

  const categoryId = categoryRaw.trim() === '取材' ? '01' : categoryRaw.trim() === '来店' ? '02' : null
  if (!categoryId) continue

  // Split on fullwidth ｜ or ASCII |
  const names = nameRaw.split(/[｜|]/).map((n) => n.trim()).filter(Boolean)
  for (const name of names) {
    // 「収録」が含まれるパーツは登録しない（番組収録・WEB番組収録 等）
    if (name.includes('収録')) continue
    if (!eventMap.has(name)) {
      eventMap.set(name, categoryId)
    }
  }
}

console.log(`\n📋 ユニークイベント数: ${eventMap.size}件\n`)

let inserted = 0
let skipped = 0
let failed = 0
let idx = 0

for (const [name, categoryId] of eventMap) {
  idx++
  process.stdout.write(`[${idx}/${eventMap.size}] ${name} ... `)

  try {
    // Check for existing
    const { data: existing } = await supabase
      .from('events')
      .select('id')
      .eq('name', name)
      .maybeSingle()

    if (existing) {
      console.log('skip (already exists)')
      skipped++
      continue
    }

    // Generate keywords
    const keywords = (await generateKeywords(name)) || null

    // Build search_text and embedding
    const searchText = [name, keywords].filter(Boolean).join('\n')
    const embedding = await generateEmbedding(searchText)

    // Insert
    const { error } = await supabase.from('events').insert({
      category_id: categoryId,
      name,
      keywords,
      search_text: searchText,
      embedding,
    })

    if (error) {
      console.log(`ERROR: ${error.message}`)
      failed++
    } else {
      console.log('✓')
      inserted++
    }

    // Small delay to avoid rate limits
    await new Promise((r) => setTimeout(r, 150))
  } catch (err) {
    console.log(`ERROR: ${err.message}`)
    failed++
  }
}

console.log(`\n✅ 完了: 登録 ${inserted}件 / スキップ ${skipped}件 / 失敗 ${failed}件`)
