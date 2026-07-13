import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { toHalfWidthAlnumSymbols } from '@/lib/textNormalize'

// 登録前に同名イベントの存在を確認するための専用エンドポイント（完全一致のみ）。
// POST /api/events と同じ正規化（全角英数字・記号→半角）を適用してから比較する
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const name = searchParams.get('name')?.trim()
    if (!name) return NextResponse.json({ events: [] })

    const normalizedName = toHalfWidthAlnumSymbols(name)

    const { data, error } = await getSupabaseAdmin()
      .from('events')
      .select('id, event_code, category_id, name')
      .eq('name', normalizedName)
      .limit(5)

    if (error) {
      return NextResponse.json({ error: 'Failed to check duplicates' }, { status: 500 })
    }

    return NextResponse.json({ events: data ?? [] })
  } catch (err) {
    console.error('[events/check-duplicate GET] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
