/**
 * キーワードが未設定のイベントに対してAI生成して埋める
 * node --env-file=.env.local scripts/regen-missing-keywords.mjs
 */
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

async function generateKeywords(name) {
  const res = await anthropic.messages.create({
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
- 人名は複数の読み方をすべて出力する
- 2文字以上のまとまった語のみ出力する
- すべてスペース区切りで並べる
- 記号・数字・句読点は無視する
- ひらがなのみ出力する（説明文不要）

イベント名: ${name}`,
    }],
  })
  const block = res.content[0]
  if (!block || block.type !== 'text') return ''
  return block.text.trim()
}

async function generateEmbedding(text) {
  const res = await openai.embeddings.create({ model: 'text-embedding-3-small', input: text })
  return res.data[0].embedding
}

// キーワードなし/空のイベントを取得
const { data: events } = await sb
  .from('events')
  .select('id, name, keywords')
  .or('keywords.is.null,keywords.eq.')
  .order('name')

console.log(`キーワード未設定: ${events.length}件\n`)

let updated = 0
let skipped = 0

for (const event of events) {
  process.stdout.write(`${event.name} ... `)
  try {
    const keywords = (await generateKeywords(event.name)) || null
    const searchText = [event.name, keywords].filter(Boolean).join('\n')
    const embedding = await generateEmbedding(searchText)

    await sb.from('events').update({
      keywords,
      search_text: searchText,
      embedding,
      updated_at: new Date().toISOString(),
    }).eq('id', event.id)

    if (keywords) {
      console.log(`→ ${keywords}`)
      updated++
    } else {
      console.log('（ひらがなのみ・スキップ）')
      skipped++
    }

    await new Promise(r => setTimeout(r, 150))
  } catch (err) {
    console.log(`ERROR: ${err.message}`)
  }
}

console.log(`\n✅ キーワード追加: ${updated}件 / ひらがなのみ（変化なし）: ${skipped}件`)
