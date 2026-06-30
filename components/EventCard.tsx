'use client'

import Link from 'next/link'
import type { EventWithStats } from '@/lib/supabase'

const CATEGORY_LABEL: Record<string, string> = { '01': '取材', '02': '来店' }
const CATEGORY_COLOR: Record<string, string> = {
  '01': 'bg-blue-100 text-blue-700',
  '02': 'bg-pink-100 text-pink-700',
}

export default function EventCard({ event }: { event: EventWithStats }) {
  return (
    <Link href={`/events/${event.id}`} className="block group">
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md hover:border-gray-300 transition-all">
        {/* Preview image */}
        <div className="w-full h-36 bg-gray-100 overflow-hidden flex items-center justify-center">
          {event.preview_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.preview_url}
              alt={event.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
            />
          ) : (
            <div className="text-gray-300 flex flex-col items-center gap-1">
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
            <span className="text-xs text-gray-400 font-mono">{event.event_code}</span>
            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${CATEGORY_COLOR[event.category_id] ?? 'bg-gray-100 text-gray-600'}`}>
                {CATEGORY_LABEL[event.category_id] ?? event.category_id}
              </span>
              <span className="text-xs text-gray-400">
                {event.image_count > 0 ? `📷 ${event.image_count}枚` : '画像なし'}
              </span>
            </div>
          </div>
          <p className="text-sm font-semibold text-gray-800 leading-snug line-clamp-2">
            {event.name}
          </p>
        </div>
      </div>
    </Link>
  )
}
