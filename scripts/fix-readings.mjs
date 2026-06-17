// 問題1: ひらがなのみファイルのmemoをクリア
// 問題2: 英語含みファイルを改良プロンプトで再生成
// 実行: node --env-file=.env.local scripts/fix-readings.mjs

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// 問題1: 説明文が入ってしまったひらがなのみファイル名
const CLEAR_MEMO_FILES = [
  'まっちゃん.png', 'まっちゃん_600x400.jpg',
  'つむぎちゃん.png',
  'うずまきちゃん.png',
  'みら☆くる.png',
  'らんちゃん。.png',
  'とらちゃん。.png',
  'すずか.png', 'すずか_600x400.jpg',
  'しおねえ.png', 'しおねえ_600x400.jpg',
  'さやか_600x400.jpg',
  'れいたす.png', 'れいたす_600x400.jpg',
  'みずほ。.png',
  'みーちゃん。.png', 'みーちゃん。_600x400.jpg',
  'さやぴこ.png', 'さやぴこ_600x400.jpg',
  'かつなり_600x400.jpg',
  'くり.png', 'くり_600x400.jpg',
  'れむ.png',
]

const PROMPT = `以下のファイル名に含まれる語句の「ひらがな読み」を出力してください。

ルール:
- 漢字・英語・カタカナのみ対象。すでにひらがなの部分は出力しない
- ひらがなのみのファイル名の場合は何も出力しない（説明文も不要、完全に空欄）
- 英語の単語はひらがな読みを1つだけ出力する（例: CUBE→きゅーぶ、SYNERGY→しなじー、PRIDE→ぷらいど）
- 漢字・カタカナの熟語・固有名詞は全体の読みを出力し、さらに各語の音読み・訓読みも出力する
- 人名は複数の読み方をすべて出力する（例: 昇くん→しょうくん のぼるくん）
- 2文字以上のまとまった語のみ出力する。1文字だけのひらがなは出力しない
- すべてスペース区切りで並べる
- 拡張子・記号・数字は無視する
- ひらがなのみ出力する（説明文・記号は不要）

例）
ファイル名: 狂鬼の宴.png → きょうきのえん くるう きょう おに うたげ えん
ファイル名: CUBEくん.png → きゅーぶくん きゅーぶ
ファイル名: POWERFUL SYNERGY.png → ぱわふるしなじー ぱわふる しなじー
ファイル名: 天パーくん.png → てんぱーくん てんぱー
ファイル名: 昇くん.png → しょうくん のぼるくん
ファイル名: まっちゃん.png → （空欄）`

async function generateReadings(fileName) {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: `${PROMPT}\n\nファイル名: ${fileName}`,
    }],
  })
  const text = response.content[0].text.trim()
  // 説明文・空欄表記が返ってきた場合は空にする
  if (!text || text.includes('空欄') || text.includes('含まれていない') || text.includes('ありません') || text.includes('ないため')) {
    return ''
  }
  return text
}

async function generateEmbedding(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  })
  return response.data[0].embedding
}

// ファイル名に英字が含まれているか
function hasEnglish(fileName) {
  return /[A-Za-z]/.test(fileName)
}

async function main() {
  // 問題1: memoクリア
  console.log('=== 問題1: 説明文混入ファイルのmemoクリア ===\n')
  for (const fileName of CLEAR_MEMO_FILES) {
    process.stdout.write(`  ${fileName} ... `)
    try {
      const { data: img } = await supabase
        .from('images')
        .select('id, file_name')
        .eq('file_name', fileName)
        .single()

      if (!img) { console.log('not found'); continue }

      const searchText = img.file_name
      const embedding = await generateEmbedding(searchText)
      await supabase.from('images').update({ memo: null, search_text: searchText, embedding }).eq('id', img.id)
      console.log('OK')
    } catch (err) {
      console.log(`FAILED: ${err.message}`)
    }
    await new Promise(r => setTimeout(r, 100))
  }

  // 問題2: 英字含みファイルを再生成
  console.log('\n=== 問題2: 英字含みファイルの読み仮名再生成 ===\n')
  const { data: images } = await supabase
    .from('images')
    .select('id, file_name, memo')
    .eq('is_active', true)
    .order('uploaded_at', { ascending: true })

  const targets = (images ?? []).filter(img => hasEnglish(img.file_name ?? ''))
  console.log(`対象: ${targets.length}件\n`)

  let success = 0, failed = 0
  for (let i = 0; i < targets.length; i++) {
    const img = targets[i]
    process.stdout.write(`[${i + 1}/${targets.length}] ${img.file_name} ... `)
    try {
      const readings = await generateReadings(img.file_name ?? '')
      // 既存memoから旧読み仮名を除き、新しい読み仮名のみ使う
      const combinedMemo = readings || null
      const searchText = [img.file_name, combinedMemo].filter(Boolean).join('\n')
      const embedding = await generateEmbedding(searchText)
      await supabase.from('images').update({ memo: combinedMemo, search_text: searchText, embedding }).eq('id', img.id)
      console.log(`OK [${readings || '（空）'}]`)
      success++
    } catch (err) {
      console.log(`FAILED: ${err.message}`)
      failed++
    }
    await new Promise(r => setTimeout(r, 500))
  }

  console.log(`\n完了: 成功 ${success}件 / 失敗 ${failed}件`)
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
