/**
 * 既存レコードの埋め込みをファイル名込みで再生成するスクリプト
 * Usage: node scripts/reindex-embeddings.mjs
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
const vars = {}
env.split('\n').forEach(line => {
  const [k, ...v] = line.split('=')
  if (k && v.length) vars[k.trim()] = v.join('=').trim()
})

const sb = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY)
const openai = new OpenAI({ apiKey: vars.OPENAI_API_KEY })

async function generateEmbedding(text) {
  const res = await openai.embeddings.create({ model: 'text-embedding-3-small', input: text })
  return res.data[0].embedding
}

async function main() {
  const { data: images, error } = await sb
    .from('images')
    .select('id, file_name, ai_description, memo')
    .order('uploaded_at', { ascending: true })

  if (error) { console.error('Fetch failed:', error); process.exit(1) }

  console.log(`対象: ${images.length} 件\n`)
  let success = 0, skip = 0, fail = 0

  for (let i = 0; i < images.length; i++) {
    const { id, file_name, ai_description, memo } = images[i]
    const parts = [file_name, ai_description, memo].filter(Boolean)

    if (parts.length === 0) {
      process.stdout.write(`[${i+1}/${images.length}] ${file_name || id} ... スキップ（テキストなし）\n`)
      skip++
      continue
    }

    const searchText = parts.join('\n')
    process.stdout.write(`[${i+1}/${images.length}] ${file_name || id} ... `)
    try {
      const embedding = await generateEmbedding(searchText)
      await sb.from('images').update({ embedding, search_text: searchText }).eq('id', id)
      process.stdout.write('✓\n')
      success++
    } catch (err) {
      process.stdout.write(`✗ ${err.message}\n`)
      fail++
    }

    // rate limit対策
    if ((i + 1) % 50 === 0) await new Promise(r => setTimeout(r, 1000))
  }

  console.log(`\n===== 完了 =====`)
  console.log(`成功: ${success} / スキップ: ${skip} / 失敗: ${fail}`)
}

main().catch(console.error)
