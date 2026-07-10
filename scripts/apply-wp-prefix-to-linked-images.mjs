/**
 * 現在イベントに紐付いている画像のファイル名先頭に、カテゴリに応じたWP登録用プレフィックスを付与する一括スクリプト
 * 取材(01)＝image01_ / 来店(02)＝image02_ / 取材かつイベント名がSS・ｓｓ・ss始まり＝imagess_
 *
 * 既にプレフィックスが付いている画像はスキップする（冪等）。
 *
 * Usage:
 *   node scripts/apply-wp-prefix-to-linked-images.mjs --dry-run   # 変換内容の確認のみ
 *   node scripts/apply-wp-prefix-to-linked-images.mjs             # 実際に更新
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

const DRY_RUN = process.argv.includes('--dry-run')

const KNOWN_PREFIXES = ['image01_', 'image02_', 'imagess_', 'image_']

function resolvePrefix(categoryId, eventName) {
  if (categoryId === '02') return 'image02_'
  if (categoryId === '01') {
    const normalized = (eventName ?? '').normalize('NFKC').trim()
    if (/^ss/i.test(normalized)) return 'imagess_'
    return 'image01_'
  }
  return 'image_'
}

async function generateEmbedding(text) {
  const res = await openai.embeddings.create({ model: 'text-embedding-3-small', input: text })
  return res.data[0].embedding
}

async function main() {
  const { data: events, error: eventsError } = await sb.from('events').select('id, name, category_id')
  if (eventsError) { console.error('イベント取得失敗:', eventsError); process.exit(1) }
  const eventById = new Map(events.map(e => [e.id, e]))

  const { data: images, error } = await sb
    .from('images')
    .select('id, file_name, memo, event_id')
    .eq('is_active', true)
    .not('event_id', 'is', null)
    .order('uploaded_at', { ascending: true })

  if (error) { console.error('画像取得失敗:', error); process.exit(1) }

  const plan = []
  for (const img of images) {
    const event = eventById.get(img.event_id)
    if (!event?.name) continue
    const fileName = img.file_name ?? ''
    if (KNOWN_PREFIXES.some(p => fileName.startsWith(p))) continue // 既にプレフィックス済みはスキップ

    const prefix = resolvePrefix(event.category_id, event.name)
    const newName = `${prefix}${fileName}`
    plan.push({ id: img.id, oldName: fileName, newName, memo: img.memo })
  }

  console.log(`対象画像数: ${plan.length}\n`)

  if (DRY_RUN) {
    for (const p of plan) console.log(`  ${p.oldName || '(no name)'}  →  ${p.newName}`)
    console.log('\n--dry-run のため実際の更新は行いません')
    return
  }

  let success = 0, fail = 0
  for (let i = 0; i < plan.length; i++) {
    const { id, oldName, newName, memo } = plan[i]
    process.stdout.write(`[${i + 1}/${plan.length}] ${oldName || '(no name)'} → ${newName} ... `)
    try {
      const searchText = [newName, memo].filter(Boolean).join('\n')
      const embedding = await generateEmbedding(searchText)
      await sb.from('images').update({ file_name: newName, search_text: searchText, embedding }).eq('id', id)
      process.stdout.write('✓\n')
      success++
    } catch (err) {
      process.stdout.write(`✗ ${err.message}\n`)
      fail++
    }
    if ((i + 1) % 50 === 0) await new Promise(r => setTimeout(r, 1000))
  }

  console.log(`\n===== 完了 =====`)
  console.log(`成功: ${success} / 失敗: ${fail}`)
}

main().catch(console.error)
