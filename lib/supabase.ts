import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Lazy singletons — created on first call so module evaluation at build time doesn't throw
let _supabase: SupabaseClient | null = null
let _supabaseAdmin: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _supabase
}

export function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabaseAdmin
}

export type Image = {
  id: string
  r2_key: string
  r2_url: string
  uploaded_at: string
  memo: string | null
  ai_description: string | null
  search_text: string | null
  is_active: boolean
}

export type ImageFeedback = {
  id: string
  image_id: string
  query_text: string
  feedback: 'relevant' | 'irrelevant'
  created_at: string
}

export type SearchResult = {
  id: string
  r2_url: string
  uploaded_at: string
  memo: string | null
  ai_description: string | null
  vector_score: number
  feedback_score: number
  final_score: number
}
