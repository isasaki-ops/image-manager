// 全画像のファイル名から読み仮名を生成してmemo・search_text・embeddingを更新する
// 実行: node --env-file=.env.local scripts/reanalyze-all.mjs

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

async function generateReadings(fileName) {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: `以下のファイル名に含まれる語句の「ひらがな読み」を、できるだけ多くのパターンで出力してください。

ルール:
- 漢字・英語・カタカナのみ対象（すでにひらがなの部分は出力しない）
- 熟語・固有名詞はまず全体の読みを出力する（例: きょうきのえん）
- さらに各漢字の音読み・訓読みをそれぞれ個別にも出力する（例: くるう きょう おに き うたげ えん）
- 英語はカタカナ読みをひらがなに変換して出力する
- 人名は読み方が複数ある場合はすべて出力する（例: しょうくん のぼるくん）
- すべてスペース区切りで並べる
- 拡張子・記号・数字は無視する
- ひらがなのみ出力する（説明文・記号は不要）

ファイル名: ${fileName}`,
    }],
  })
  return response.content[0].text.trim()
}

async function generateEmbedding(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  })
  return response.data[0].embedding
}

async function main() {
  const { data: images, error } = await supabase
    .from('images')
    .select('id, file_name, memo')
    .eq('is_active', true)
    .order('uploaded_at', { ascending: true })

  if (error) throw error

  console.log(`${images.length}件を処理します\n`)

  let success = 0
  let failed = 0
  const failures = []

  for (let i = 0; i < images.length; i++) {
    const img = images[i]
    const label = img.file_name ?? img.id
    process.stdout.write(`[${i + 1}/${images.length}] ${label} ... `)

    try {
      const readings = await generateReadings(img.file_name ?? '')
      const combinedMemo = [img.memo, readings].filter(Boolean).join(' ') || null
      const searchText = [img.file_name, combinedMemo].filter(Boolean).join('\n')
      const embedding = await generateEmbedding(searchText)

      const { error: updateError } = await supabase
        .from('images')
        .update({ memo: combinedMemo, search_text: searchText, embedding })
        .eq('id', img.id)

      if (updateError) throw updateError

      console.log(`OK [${readings}]`)
      success++
    } catch (err) {
      console.log(`FAILED: ${err.message}`)
      failed++
      failures.push({ id: img.id, file_name: label, error: err.message })
    }

    if (i < images.length - 1) {
      await new Promise((r) => setTimeout(r, 500))
    }
  }

  console.log(`\n完了: 成功 ${success}件 / 失敗 ${failed}件`)
  if (failures.length > 0) {
    console.log('\n失敗一覧:')
    for (const f of failures) {
      console.log(`  ${f.file_name}: ${f.error}`)
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
