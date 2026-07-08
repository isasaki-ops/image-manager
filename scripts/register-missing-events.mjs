/**
 * 未登録イベント一覧.csv からイベントをSupabaseに一括登録するスクリプト
 *
 * 使い方（プロジェクトルートから実行）:
 *   node --env-file=.env.local scripts/register-missing-events.mjs
 *
 * 動作:
 * - 未登録イベント一覧.csv（name,category列）を読み込む
 * - 各イベントについて存在チェック（念のため二重登録防止）
 * - AI（Claude haiku）でキーワード生成、OpenAIでembedding生成して登録
 * - region_ids は新規登録時のデフォルトである空配列で登録
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

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

// lib/ai.ts の generateKeywordsFromEventName と同一プロンプト
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

例）
イベント名: 天下無双 → てんかむそう てんか むそう
イベント名: SS・蓮くん取材 → えすえす れんくん しゅざい
イベント名: バズーカ → ばずーか
イベント名: 梅屋シン来店 → うめやしんらいてん うめや しん らいてん
イベント名: ぱちレポ〜トレンドリサーチ〜 → （空欄）

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

const __dirname = dirname(fileURLToPath(import.meta.url))
const csvPath = join(__dirname, '..', '未登録イベント一覧.csv')
const raw = readFileSync(csvPath, 'utf-8').replace(/^﻿/, '')
const lines = raw.split('\n').filter((l) => l.trim())
const rows = lines.slice(1).map(parseCSVLine)

const events = rows
  .map((row) => ({ name: row[0], categoryLabel: row[1] }))
  .filter((e) => e.name && e.categoryLabel)
  .map((e) => ({
    name: e.name,
    categoryId: e.categoryLabel === '取材' ? '01' : e.categoryLabel === '来店' ? '02' : null,
  }))
  .filter((e) => e.categoryId)

console.log(`\n登録対象: ${events.length}件\n`)

let inserted = 0
let skipped = 0
let failed = 0
let idx = 0

for (const { name, categoryId } of events) {
  idx++
  process.stdout.write(`[${idx}/${events.length}] ${name} ... `)

  try {
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

    const keywords = (await generateKeywords(name)) || null
    const searchText = [name, keywords].filter(Boolean).join('\n')
    const embedding = await generateEmbedding(searchText)

    const { error } = await supabase.from('events').insert({
      category_id: categoryId,
      name,
      keywords,
      search_text: searchText,
      embedding,
      region_ids: [],
    })

    if (error) {
      console.log(`ERROR: ${error.message}`)
      failed++
    } else {
      console.log('✓')
      inserted++
    }

    await new Promise((r) => setTimeout(r, 150))
  } catch (err) {
    console.log(`ERROR: ${err.message}`)
    failed++
  }
}

console.log(`\n完了: 登録 ${inserted}件 / スキップ ${skipped}件 / 失敗 ${failed}件`)
