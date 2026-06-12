import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Service role client for server-side operations (bypasses RLS)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey)

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
