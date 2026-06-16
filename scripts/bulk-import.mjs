/**
 * 案件管理シートのURLを一括インポートするスクリプト
 * Usage:
 *   node scripts/bulk-import.mjs --dry-run   # 対象一覧を表示（実際には登録しない）
 *   node scripts/bulk-import.mjs             # 実際にインポート実行
 */

import ExcelJS from 'exceljs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const XLSX_FILE = join(__dirname, '..', '案件管理シート見本更新.xlsx')
const API_BASE = 'http://localhost:3000'
const DRY_RUN = process.argv.includes('--dry-run')
const DELAY_MS = 300 // リクエスト間隔

async function readRows() {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(XLSX_FILE)
  const sheet = wb.getWorksheet('画像リスト')

  const rows = []
  sheet.eachRow((row, i) => {
    if (i < 4) return

    const d = (row.getCell(4).text || '').trim()   // D列：企画名（主）
    const e = (row.getCell(5).text || '').trim()   // E列：複合❶
    const f = (row.getCell(6).text || '').trim()   // F列：複合❷
    const g = (row.getCell(7).text || '').trim()   // G列：複合❸

    const urlCell = row.getCell(9)                 // I列：URL（数式の result を使用）
    const urlVal = urlCell.value
    let url = ''
    if (urlVal && typeof urlVal === 'object' && urlVal.result) {
      url = String(urlVal.result)
    } else if (typeof urlVal === 'string' && urlVal.startsWith('http')) {
      url = urlVal
    }

    if (!url.startsWith('http')) return

    // ファイル名：D・E・F・G の順（入っている列のみ）
    const parts = [d, e, f, g].filter(Boolean)
    const baseName = parts.join('・')
    if (!baseName) return

    rows.push({ row: i, url, baseName, d, e, f, g })
  })

  return rows
}

async function importRow({ url, baseName }) {
  // 画像ダウンロード
  const imgRes = await fetch(url)
  if (!imgRes.ok) throw new Error(`Download failed: HTTP ${imgRes.status}`)
  const buffer = await imgRes.arrayBuffer()

  const ext = url.split('.').pop().split('?')[0].toLowerCase() || 'jpg'
  const contentType = imgRes.headers.get('content-type') || `image/${ext}`
  const fileName = `${baseName}.${ext}`

  // アップロード（600×400複製あり）
  const blob = new Blob([buffer], { type: contentType })
  const formData = new FormData()
  formData.append('file', blob, fileName)
  formData.append('create_thumbnail', 'true')

  const uploadRes = await fetch(`${API_BASE}/api/upload`, {
    method: 'POST',
    body: formData,
  })
  const result = await uploadRes.json()

  if (!uploadRes.ok) throw new Error(result.error || 'Upload failed')
  return { fileName, id: result.id }
}

async function main() {
  console.log(`📋 Excelファイルを読み込み中: ${XLSX_FILE}`)
  const rows = await readRows()
  console.log(`✅ 対象: ${rows.length} 件\n`)

  if (DRY_RUN) {
    console.log('=== DRY RUN（実際には登録しません）===')
    rows.forEach(({ row, baseName, url }) => {
      console.log(`  行${row}: [${baseName}]`)
      console.log(`        ${url}`)
    })
    console.log('\n--dry-run を外すと実際に登録します。')
    return
  }

  let success = 0
  let fail = 0

  for (let i = 0; i < rows.length; i++) {
    const { row, url, baseName } = rows[i]
    process.stdout.write(`[${i + 1}/${rows.length}] ${baseName} ... `)
    try {
      const { fileName, id } = await importRow({ url, baseName })
      console.log(`✓ ${fileName} (id: ${id})`)
      success++
    } catch (err) {
      console.log(`✗ ${err.message}`)
      fail++
    }
    if (i < rows.length - 1) await new Promise(r => setTimeout(r, DELAY_MS))
  }

  console.log(`\n===== 完了 =====`)
  console.log(`成功: ${success} 件 / 失敗: ${fail} 件`)
  console.log('※ AI解析はバックグラウンドで順次処理されます（数分かかる場合があります）')
}

main().catch(console.error)
