'use client'

import Link from 'next/link'
import type { EventWithStats } from '@/lib/supabase'
import { REGION_LABEL, REGION_COLOR, ALL_REGION_IDS, type RegionId } from '@/lib/regions'

const CATEGORY_LABEL: Record<string, string> = { '01': '取材', '02': '来店' }
const CATEGORY_COLOR: Record<string, string> = {
  '01': 'bg-black text-cyan-300 border border-cyan-400/70 shadow-[0_0_6px_rgba(34,211,238,0.5)]',
  '02': 'bg-black text-fuchsia-300 border border-fuchsia-400/70 shadow-[0_0_6px_rgba(217,70,239,0.5)]',
}
const CATEGORY_CODE_COLOR: Record<string, string> = {
  '01': 'text-cyan-300',
  '02': 'text-fuchsia-300',
}
const CATEGORY_CARD_BORDER: Record<string, string> = {
  '01': 'border-cyan-400/50 shadow-[0_0_14px_rgba(34,211,238,0.18)] hover:shadow-[0_0_26px_rgba(34,211,238,0.45)] hover:border-cyan-400',
  '02': 'border-fuchsia-400/50 shadow-[0_0_14px_rgba(217,70,239,0.18)] hover:shadow-[0_0_26px_rgba(217,70,239,0.45)] hover:border-fuchsia-400',
}

export default function EventCard({
  event,
  onClick,
}: {
  event: EventWithStats
  onClick?: () => void
}) {
  const regionIds = event.region_ids ?? []
  const isNationwide = regionIds.length >= ALL_REGION_IDS.length

  return (
    <Link href={`/events/${event.id}`} className="block group" onClick={onClick}>
      <div className={`bg-zinc-950 rounded-2xl border overflow-hidden hover:-translate-y-0.5 transition-all duration-200 ${CATEGORY_CARD_BORDER[event.category_id] ?? 'border-zinc-700 shadow-none hover:border-zinc-500'}`}>
        {/* Preview image */}
        <div className="w-full h-36 bg-zinc-900 overflow-hidden flex items-center justify-center">
          {event.preview_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.preview_url}
              alt={event.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
            />
          ) : (
            <div className="text-zinc-700 flex flex-col items-center gap-1">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M6 4h.01M4 6h16a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z" />
              </svg>
              <span className="text-xs">画像なし</span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-3 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className={`text-xs font-mono ${CATEGORY_CODE_COLOR[event.category_id] ?? 'text-zinc-400'}`}>{event.event_code}</span>
            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CATEGORY_COLOR[event.category_id] ?? 'bg-zinc-800 text-zinc-400'}`}>
                {CATEGORY_LABEL[event.category_id] ?? event.category_id}
              </span>
              <span className="text-xs text-zinc-300">
                {event.image_count > 0 ? `📷 ${event.image_count}枚` : '画像なし'}
              </span>
            </div>
          </div>
          <p className="text-sm font-semibold text-zinc-100 leading-snug line-clamp-2">
            {event.name}
          </p>
          {regionIds.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {isNationwide ? (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-black text-yellow-300 border border-yellow-400/70 shadow-[0_0_6px_rgba(250,204,21,0.5)]">
                  🌏 全国
                </span>
              ) : (
                regionIds.map((r) => (
                  <span
                    key={r}
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded bg-black border ${REGION_COLOR[r as RegionId] ?? 'text-zinc-400 border-zinc-700'}`}
                  >
                    {REGION_LABEL[r as RegionId] ?? r}
                  </span>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}
