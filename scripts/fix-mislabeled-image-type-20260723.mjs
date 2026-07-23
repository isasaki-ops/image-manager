/**
 * 2026-07-23: エクスポートAPI(pachinko-crm/申請アプリ連携)で「600x400画像なし」と
 * 判定されていた52件のうち、実寸は600x400ピクセルなのにimage_typeが'original'の
 * ままだった33件を対象に、image_typeを'600x400'へ修正するワンショットスクリプト。
 *
 * トリミングやWP登録は行わない（ラベル修正のみ）。WP未登録のものは別途登録が必要。
 *
 * Usage:
 *   node --env-file=.env.local scripts/fix-mislabeled-image-type-20260723.mjs --dry-run
 *   node --env-file=.env.local scripts/fix-mislabeled-image-type-20260723.mjs
 */

import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const DRY_RUN = process.argv.includes('--dry-run')

const TARGET_CODES = [
  '01-0001', '01-0005', '01-0007', '01-0033', '01-0057', '01-0059', '01-0060',
  '01-0081', '01-0082', '01-0115', '01-0125', '01-0128', '01-0130', '01-0132',
  '01-0148', '01-0149', '01-0150', '01-0189', '01-0212', '01-0251', '01-0293',
  '01-0299', '01-0310', '01-0350', '01-0354', '01-0379', '01-0380', '01-0384',
  '01-0385', '01-0386', '01-0387', '01-0388', '01-0390',
]

async function main() {
  const { data: events, error } = await sb
    .from('events')
    .select('id, event_code, name')
    .in('event_code', TARGET_CODES)
  if (error) { console.error(error); process.exit(1) }

  const { data: images, error: imgErr } = await sb
    .from('images')
    .select('id, event_id, image_type, is_active, image_width, image_height, wp_file_name')
    .in('event_id', events.map(e => e.id))
    .eq('is_active', true)
  if (imgErr) { console.error(imgErr); process.exit(1) }

  let fixed = 0, skipped = 0, fail = 0

  for (const code of TARGET_CODES) {
    const ev = events.find(e => e.event_code === code)
    if (!ev) { console.log(`${code}: イベントが見つかりません、スキップ`); skipped++; continue }
    const img = images.find(i => i.event_id === ev.id)
    if (!img) { console.log(`${code}: 画像が見つかりません、スキップ`); skipped++; continue }

    if (img.image_type === '600x400') {
      console.log(`${code} (${ev.name}): 既にimage_type=600x400、スキップ`)
      skipped++
      continue
    }
    if (img.image_width !== 600 || img.image_height !== 400) {
      console.log(`${code} (${ev.name}): 寸法が600x400ではない(${img.image_width}x${img.image_height})、スキップ`)
      skipped++
      continue
    }

    console.log(`${code} (${ev.name}): image_type '${img.image_type}' → '600x400' に修正${img.wp_file_name ? ' [WP登録済み]' : ' [WP未登録]'}`)
    if (!DRY_RUN) {
      const { error: updErr } = await sb
        .from('images')
        .update({ image_type: '600x400', updated_at: new Date().toISOString() })
        .eq('id', img.id)
      if (updErr) { console.log(`  ERROR: ${updErr.message}`); fail++; continue }
    }
    fixed++
  }

  console.log('\n===== 完了 =====')
  console.log(`修正: ${fixed} / スキップ: ${skipped} / 失敗: ${fail}`)
  if (DRY_RUN) console.log('--dry-run のため実際の書き込みは行っていません')
}

main().catch(console.error)
