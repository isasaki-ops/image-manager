import { getSupabaseAdmin, type SearchResult, type Event } from './supabase'
import { generateEmbedding } from './ai'

export async function searchImages(
  query: string,
  limit: number = 20
): Promise<SearchResult[]> {
  const [vectorResults, textResults] = await Promise.all([
    vectorSearchImages(query, limit),
    textSearchImages(query, limit),
  ])

  const seen = new Set<string>()
  const merged: SearchResult[] = []

  for (const item of textResults) {
    if (!seen.has(item.id)) {
      seen.add(item.id)
      merged.push(item)
    }
  }
  for (const item of vectorResults) {
    if (!seen.has(item.id)) {
      seen.add(item.id)
      merged.push(item)
    }
  }

  return merged.slice(0, limit)
}

// イベント検索はあいまい検索（ベクトル類似度）を行わず、イベント名・キーワードに
// 検索語が実際に含まれているかどうかのみで判定する
export async function searchEvents(
  query: string,
  limit: number = 20,
  options?: { categoryId?: string; regionIds?: string[] }
): Promise<Event[]> {
  return textSearchEvents(query, limit, options?.categoryId, options?.regionIds)
}

async function vectorSearchImages(query: string, limit: number): Promise<SearchResult[]> {
  try {
    const queryVector = await generateEmbedding(query)
    const { data, error } = await getSupabaseAdmin().rpc('search_images', {
      query_vector: queryVector,
      match_limit: limit,
    })
    if (error) return []
    return (data as SearchResult[]) ?? []
  } catch {
    return []
  }
}

function toHiragana(str: string): string {
  return str.replace(/[ァ-ヶ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  )
}

function toKatakana(str: string): string {
  return str.replace(/[ぁ-ゖ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) + 0x60)
  )
}

function buildPatterns(query: string): string[] {
  return Array.from(new Set([query, toHiragana(query), toKatakana(query)]))
}

async function textSearchImages(query: string, limit: number): Promise<SearchResult[]> {
  const escape = (s: string) => s.replace(/[%_\\]/g, '\\$&')
  const patterns = buildPatterns(query).map((s) => `%${escape(s)}%`)
  const cols = ['file_name', 'memo']
  const orClause = patterns
    .flatMap((p) => cols.map((col) => `${col}.ilike.${p}`))
    .join(',')

  const { data } = await getSupabaseAdmin()
    .from('images')
    .select('id, r2_url, uploaded_at, memo, ai_description, file_name, file_size, file_type, image_width, image_height')
    .eq('is_active', true)
    .or(orClause)
    .order('uploaded_at', { ascending: false })
    .limit(limit)

  return (data ?? []).map((item) => ({
    ...item,
    vector_score: 1,
    feedback_score: 0,
    final_score: 1,
  }))
}

async function textSearchEvents(
  query: string,
  limit: number,
  categoryId?: string,
  regionIds?: string[]
): Promise<Event[]> {
  const escape = (s: string) => s.replace(/[%_\\]/g, '\\$&')
  const patterns = buildPatterns(query).map((s) => `%${escape(s)}%`)
  const cols = ['name', 'keywords']
  const orClause = patterns
    .flatMap((p) => cols.map((col) => `${col}.ilike.${p}`))
    .join(',')

  let q = getSupabaseAdmin()
    .from('events')
    .select('id, event_code, category_id, name, keywords, memo, search_text, region_ids, created_at, updated_at')
    .or(orClause)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (categoryId) q = q.eq('category_id', categoryId)
  if (regionIds && regionIds.length > 0) q = q.overlaps('region_ids', regionIds)

  const { data } = await q
  return (data as Event[]) ?? []
}
