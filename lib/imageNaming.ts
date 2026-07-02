import { getSupabaseAdmin } from './supabase'
import { generateEmbedding } from './ai'

export function sanitizeEventNameForFile(eventName: string): string {
  return eventName.trim().replace(/[\\/:*?"<>|]/g, '_') || 'image'
}

export function extFromFileName(fileName: string | null | undefined, fallback = 'jpg'): string {
  if (!fileName || !fileName.includes('.')) return fallback
  return fileName.split('.').pop()!.toLowerCase()
}

function nextAvailableName(base: string, suffix: string, ext: string, existing: Set<string>): string {
  const first = `${base}${suffix}.${ext}`
  if (!existing.has(first)) return first
  let i = 2
  let candidate = `${base}${suffix}_${i}.${ext}`
  while (existing.has(candidate)) {
    i++
    candidate = `${base}${suffix}_${i}.${ext}`
  }
  return candidate
}

// original: イベント名.jpg, イベント名_2.jpg, ...
export function buildOriginalFileName(eventName: string, ext: string, existing: Set<string>): string {
  return nextAvailableName(sanitizeEventNameForFile(eventName), '', ext, existing)
}

// thumbnail: イベント名_600x400.jpg, イベント名_600x400_2.jpg, ...
export function buildThumbFileName(eventName: string, existing: Set<string>): string {
  return nextAvailableName(sanitizeEventNameForFile(eventName), '_600x400', 'jpg', existing)
}

// 既存画像をイベント名ベースのファイル名にリネーム（イベント紐付け時に使用）
export async function renameImageForEvent(imageId: string, eventId: string): Promise<void> {
  const sb = getSupabaseAdmin()
  const { data: img } = await sb
    .from('images')
    .select('file_name, image_type, memo')
    .eq('id', imageId)
    .single()
  if (!img) return

  const { data: eventRow } = await sb.from('events').select('name').eq('id', eventId).single()
  if (!eventRow?.name) return

  const { data: existingRows } = await sb.from('images').select('file_name').eq('event_id', eventId)
  const existing = new Set((existingRows ?? []).map((r) => r.file_name).filter((n): n is string => !!n))

  const isThumb = img.image_type === '600x400'
  const newFileName = isThumb
    ? buildThumbFileName(eventRow.name, existing)
    : buildOriginalFileName(eventRow.name, extFromFileName(img.file_name), existing)

  if (newFileName === img.file_name) return

  const searchText = [newFileName, img.memo].filter(Boolean).join('\n')
  let embedding: number[] | null = null
  try {
    embedding = await generateEmbedding(searchText)
  } catch {
    // 埋め込み生成に失敗してもファイル名変更自体は反映する
  }

  const update: Record<string, unknown> = { file_name: newFileName, search_text: searchText }
  if (embedding) update.embedding = embedding
  await sb.from('images').update(update).eq('id', imageId)
}
