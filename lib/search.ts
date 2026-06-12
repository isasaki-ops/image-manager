import { getSupabaseAdmin, type SearchResult } from './supabase'
import { generateEmbedding } from './ai'

export async function searchImages(
  query: string,
  limit: number = 20
): Promise<SearchResult[]> {
  const queryVector = await generateEmbedding(query)

  const { data, error } = await getSupabaseAdmin().rpc('search_images', {
    query_vector: queryVector,
    match_limit: limit,
  })

  if (error) throw new Error(`Search failed: ${error.message}`)
  return (data as SearchResult[]) ?? []
}
