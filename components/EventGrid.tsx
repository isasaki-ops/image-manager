import EventCard from './EventCard'
import type { EventWithStats } from '@/lib/supabase'

export default function EventGrid({
  events,
  onCardClick,
}: {
  events: EventWithStats[]
  onCardClick?: () => void
}) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-zinc-600 gap-3">
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <p className="text-sm">イベントが見つかりません</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {events.map((event) => (
        <EventCard key={event.id} event={event} onClick={onCardClick} />
      ))}
    </div>
  )
}
