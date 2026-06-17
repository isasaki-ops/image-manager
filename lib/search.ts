import { getSupabaseAdmin, type SearchResult } from './supabase'
import { generateEmbedding } from './ai'

export async function searchImages(
  query: string,
  limit: number = 20
): Promise<SearchResult[]> {
  const [vectorResults, textResults] = await Promise.all([
    vectorSearch(query, limit),
    textSearch(query, limit),
  ])

  // テキスト一致を先頭に、ベクトル一致で補完（重複除去）
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

async function vectorSearch(query: string, limit: number): Promise<SearchResult[]> {
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

async function textSearch(query: string, limit: number): Promise<SearchResult[]> {
  const escape = (s: string) => s.replace(/[%_\\]/g, '\\$&')

  const patterns = Array.from(new Set([
    query,
    toHiragana(query),
    toKatakana(query),
  ])).map((s) => `%${escape(s)}%`)

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
