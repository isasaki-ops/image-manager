import { getSupabaseAdmin } from './supabase'

// イベント内の画像の並び順（sort_order → uploaded_at）を統一して適用するための順序定義
export const IMAGE_ORDER = [
  { column: 'sort_order', options: { ascending: true, nullsFirst: false } },
  { column: 'uploaded_at', options: { ascending: true } },
] as const

export function applyImageOrder<
  T extends { order: (column: string, options: { ascending: boolean; nullsFirst?: boolean }) => T }
>(query: T): T {
  return IMAGE_ORDER.reduce((q, o) => q.order(o.column, o.options), query)
}

export async function getNextSortOrder(eventId: string | null): Promise<number> {
  if (!eventId) return 0
  const { data } = await getSupabaseAdmin()
    .from('images')
    .select('sort_order')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  return (data?.sort_order ?? -1) + 1
}
