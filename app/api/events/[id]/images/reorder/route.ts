import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { orderedIds } = await req.json()

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return NextResponse.json({ error: 'orderedIds is required' }, { status: 400 })
    }

    const { count } = await getSupabaseAdmin()
      .from('images')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', id)

    if (count !== orderedIds.length) {
      return NextResponse.json({ error: '画像件数が一致しません。ページを再読み込みしてください' }, { status: 400 })
    }

    await Promise.all(
      orderedIds.map((imageId: string, index: number) =>
        getSupabaseAdmin()
          .from('images')
          .update({ sort_order: index })
          .eq('id', imageId)
          .eq('event_id', id)
      )
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[events/id/images/reorder PATCH] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
