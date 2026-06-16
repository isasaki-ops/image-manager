/**
 * 全画像を新プロンプトで再解析するスクリプト
 * - _600x400.jpg はオリジナルの解析結果をコピー（API呼び出し削減）
 * - それ以外はすべて Claude で再解析
 * Usage: node scripts/reanalyze-all.mjs
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
const vars = {}
env.split('\n').forEach(line => {
  const [k, ...v] = line.split('=')
  if (k && v.length) vars[k.trim()] = v.join('=').trim()
})

const sb = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY)
const anthropic = new Anthropic({ apiKey: vars.ANTHROPIC_API_KEY })
const openai = new OpenAI({ apiKey: vars.OPENAI_API_KEY })

const SYSTEM_PROMPT =
  'この画像はパチンコ・パチスロの取材で使うバナーやポスターです。\n画像内に書かれているテキスト・文字情報のみを書き起こしてください。\n\n取材名・イベント名・キャンペーン名・日付・場所名・出演者名・芸能人名・タレント名・機種名・店舗名など、画像内のすべての文字を正確に抽出してください。\n\n背景・色・キャラクターの外見・レイアウトなど視覚的な情報は一切含めないでください。\n文字が読み取れない、または文字がない画像の場合は「テキストなし」とだけ記載してください。'

async function analyzeImage(r2Url) {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'url', url: r2Url } },
        { type: 'text', text: 'この画像を詳細に説明してください。' },
      ],
    }],
  })
  return response.content[0].text
}

async function generateEmbedding(text) {
  const res = await openai.embeddings.create({ model: 'text-embedding-3-small', input: text })
  return res.data[0].embedding
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function main() {
  const { data: images, error } = await sb
    .from('images')
    .select('id, r2_url, file_name, file_type, memo')
    .order('uploaded_at', { ascending: true })

  if (error) { console.error('Fetch failed:', error); process.exit(1) }

  // 画像ファイルのみ対象（PSDなど非画像は除外）
  const allImages = images.filter(img =>
    img.file_type?.startsWith('image/') || img.r2_url?.match(/\.(png|jpg|jpeg|webp|gif)$/i)
  )

  // オリジナルと600x400複製を分離
  const duplicates = allImages.filter(img => img.file_name?.endsWith('_600x400.jpg'))
  const originals = allImages.filter(img => !img.file_name?.endsWith('_600x400.jpg'))

  // オリジナルのbaseName → ai_description マップ（複製更新用）
  const resultMap = new Map() // baseName → { ai_description, embedding }

  console.log(`総件数: ${allImages.length} 件`)
  console.log(`  オリジナル: ${originals.length} 件（Claude再解析）`)
  console.log(`  600×400複製: ${duplicates.length} 件（コピー）\n`)

  let success = 0, fail = 0

  // ── オリジナルを再解析 ──
  for (let i = 0; i < originals.length; i++) {
    const img = originals[i]
    const label = img.file_name || img.id
    process.stdout.write(`[${i + 1}/${originals.length}] ${label} ... `)

    try {
      const aiDescription = await analyzeImage(img.r2_url)
      const searchText = [img.file_name, aiDescription, img.memo].filter(Boolean).join('\n')
      const embedding = await generateEmbedding(searchText)

      await sb.from('images').update({ ai_description: aiDescription, search_text: searchText, embedding }).eq('id', img.id)

      // baseName を保存（複製マッチ用）
      const baseName = img.file_name?.replace(/\.[^.]+$/, '') ?? ''
      if (baseName) resultMap.set(baseName, { aiDescription, embedding: null })

      process.stdout.write(`✓\n`)
      success++
    } catch (err) {
      process.stdout.write(`✗ ${err.message}\n`)
      fail++
    }

    // rate limit 対策：3件ごとに少し待機
    if ((i + 1) % 3 === 0) await sleep(500)
  }

  console.log(`\nオリジナル完了: 成功 ${success} / 失敗 ${fail}`)
  console.log(`\n── 600×400複製を更新中 ──\n`)

  let copySuccess = 0, copyFail = 0

  for (let i = 0; i < duplicates.length; i++) {
    const img = duplicates[i]
    // "CUBEくん_600x400.jpg" → "CUBEくん"
    const baseName = img.file_name?.replace(/_600x400\.jpg$/, '') ?? ''
    process.stdout.write(`[${i + 1}/${duplicates.length}] ${img.file_name} ... `)

    // オリジナルをDBから取得（resultMapにないケース対応）
    const { data: orig } = await sb
      .from('images')
      .select('ai_description, memo')
      .eq('file_name', `${baseName}.png`)
      .maybeSingle()

    const aiDescription = orig?.ai_description ?? null
    if (!aiDescription) {
      process.stdout.write(`スキップ（元画像なし）\n`)
      copyFail++
      continue
    }

    try {
      const searchText = [img.file_name, aiDescription, img.memo].filter(Boolean).join('\n')
      const embedding = await generateEmbedding(searchText)
      await sb.from('images').update({ ai_description: aiDescription, search_text: searchText, embedding }).eq('id', img.id)
      process.stdout.write(`✓\n`)
      copySuccess++
    } catch (err) {
      process.stdout.write(`✗ ${err.message}\n`)
      copyFail++
    }

    if ((i + 1) % 5 === 0) await sleep(300)
  }

  console.log(`\n===== 完了 =====`)
  console.log(`オリジナル再解析: 成功 ${success} / 失敗 ${fail}`)
  console.log(`600×400コピー:   成功 ${copySuccess} / 失敗 ${copyFail}`)
}

main().catch(console.error)
