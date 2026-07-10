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
  file_name: string | null
  file_size: number | null
  file_type: string | null
  image_width: number | null
  image_height: number | null
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
  file_name: string | null
  file_size: number | null
  file_type: string | null
  image_width: number | null
  image_height: number | null
  vector_score: number
  feedback_score: number
  final_score: number
}

export type Event = {
  id: string
  event_code: string
  category_id: '01' | '02'
  name: string
  keywords: string | null
  memo: string | null
  search_text: string | null
  region_ids: string[]
  created_at: string
  updated_at: string
}

export type EventWithStats = Event & {
  image_count: number
  preview_url: string | null
}

export type ImageRecord = {
  id: string
  event_id: string | null
  image_type: string
  r2_key: string
  r2_url: string
  uploaded_at: string
  memo: string | null
  file_name: string | null
  file_size: number | null
  file_type: string | null
  image_width: number | null
  image_height: number | null
  sort_order?: number | null
  wp_file_name?: string | null
  wp_url?: string | null
  wp_registered_at?: string | null
}
