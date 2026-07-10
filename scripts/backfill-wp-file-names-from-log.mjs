/**
 * bulk-wp-upload-600x400.mjs 実行ログ（成功行 "[n/total] fileName ... ✓ url"）を読み取り、
 * 対応するimagesレコードにwp_file_name/wp_url/wp_registered_at/updated_atを書き戻すワンショットスクリプト。
 *
 * migrations/010でwp_file_name列を追加する前に実行した一括登録の結果を後追いで永続化するために使う。
 *
 * Usage:
 *   node scripts/backfill-wp-file-names-from-log.mjs <ログファイルパス> --dry-run
 *   node scripts/backfill-wp-file-names-from-log.mjs <ログファイルパス>
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
const vars = {}
env.split('\n').forEach(line => {
  const [k, ...v] = line.split('=')
  if (k && v.length) vars[k.trim()] = v.join('=').trim()
})

const sb = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY)

const DRY_RUN = process.argv.includes('--dry-run')
const logPath = process.argv[2]
if (!logPath || logPath.startsWith('--')) {
  console.error('Usage: node scripts/backfill-wp-file-names-from-log.mjs <ログファイルパス> [--dry-run]')
  process.exit(1)
}

const LINE_RE = /^\[\d+\/\d+\]\s+(.+?)\s+\.\.\.\s+✓\s+(https?:\S+)\s*$/

async function main() {
  const log = readFileSync(logPath, 'utf8')
  const entries = []
  for (const line of log.split('\n')) {
    const m = LINE_RE.exec(line.trim())
    if (!m) continue
    const [, fileName, url] = m
    const wpFileName = decodeURIComponent(url.split('/').pop())
    entries.push({ fileName, url, wpFileName })
  }

  console.log(`ログから読み取った成功エントリ: ${entries.length}件\n`)

  if (DRY_RUN) {
    for (const e of entries.slice(0, 20)) console.log(`  ${e.fileName} → ${e.wpFileName}`)
    if (entries.length > 20) console.log(`  ... 他 ${entries.length - 20}件`)
    console.log('\n--dry-run のため実際の更新は行いません')
    return
  }

  let updated = 0, notFound = 0
  const now = new Date().toISOString()
  for (const e of entries) {
    const { data, error } = await sb
      .from('images')
      .update({ wp_file_name: e.wpFileName, wp_url: e.url, wp_registered_at: now, updated_at: now })
      .eq('file_name', e.fileName)
      .eq('image_type', '600x400')
      .is('wp_file_name', null)
      .select('id')

    if (error) { console.error(`✗ ${e.fileName}: ${error.message}`); continue }
    if (!data || data.length === 0) { notFound++; console.log(`(該当なし) ${e.fileName}`); continue }
    updated += data.length
  }

  console.log(`\n===== 完了 =====`)
  console.log(`更新: ${updated}件 / 該当レコードなし: ${notFound}件`)
}

main().catch(console.error)
