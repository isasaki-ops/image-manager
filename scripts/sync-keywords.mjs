// 元画像と600x400複製の検索キーワード（memo）を統一する
// 両方のキーワードをマージして同じ内容を両方に設定する
// 実行: node --env-file=.env.local scripts/sync-keywords.mjs

import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

async function generateEmbedding(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  })
  return response.data[0].embedding
}

function mergeKeywords(a, b) {
  const words = new Set([
    ...(a ?? '').split(/\s+/).filter(Boolean),
    ...(b ?? '').split(/\s+/).filter(Boolean),
  ])
  return [...words].join(' ') || null
}

async function main() {
  const { data: images, error } = await supabase
    .from('images')
    .select('id, file_name, memo')
    .eq('is_active', true)

  if (error) throw error

  // file_name → image のマップ
  const byName = new Map(images.map(img => [img.file_name, img]))

  // 600x400複製を持つペアを収集
  const pairs = []
  const seen = new Set()

  for (const img of images) {
    if (!img.file_name || seen.has(img.file_name)) continue

    if (img.file_name.includes('_600x400')) {
      // これが複製側 → 元画像を探す
      const originalName = img.file_name.replace('_600x400', '')
      const original = byName.get(originalName)
      if (original) {
        pairs.push({ original, duplicate: img })
        seen.add(original.file_name)
        seen.add(img.file_name)
      }
    } else {
      // 元画像側 → 複製を探す
      const ext = img.file_name.includes('.') ? '.' + img.file_name.split('.').pop() : ''
      const base = img.file_name.replace(ext, '')
      const dupName = `${base}_600x400.jpg`
      const duplicate = byName.get(dupName)
      if (duplicate && !seen.has(img.file_name)) {
        pairs.push({ original: img, duplicate })
        seen.add(img.file_name)
        seen.add(dupName)
      }
    }
  }

  console.log(`ペア数: ${pairs.length}件\n`)

  let success = 0, skipped = 0, failed = 0

  for (let i = 0; i < pairs.length; i++) {
    const { original, duplicate } = pairs[i]
    const merged = mergeKeywords(original.memo, duplicate.memo)

    // 両方すでに同じなら스킵
    if (original.memo === merged && duplicate.memo === merged) {
      skipped++
      continue
    }

    process.stdout.write(`[${i + 1}/${pairs.length}] ${original.file_name} ... `)
    try {
      const searchTextOrig = [original.file_name, merged].filter(Boolean).join('\n')
      const searchTextDup = [duplicate.file_name, merged].filter(Boolean).join('\n')
      const [embOrig, embDup] = await Promise.all([
        generateEmbedding(searchTextOrig),
        generateEmbedding(searchTextDup),
      ])

      await Promise.all([
        supabase.from('images').update({ memo: merged, search_text: searchTextOrig, embedding: embOrig }).eq('id', original.id),
        supabase.from('images').update({ memo: merged, search_text: searchTextDup, embedding: embDup }).eq('id', duplicate.id),
      ])

      console.log('OK')
      success++
    } catch (err) {
      console.log(`FAILED: ${err.message}`)
      failed++
    }

    await new Promise(r => setTimeout(r, 100))
  }

  console.log(`\n完了: 更新 ${success}件 / スキップ ${skipped}件 / 失敗 ${failed}件`)
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
