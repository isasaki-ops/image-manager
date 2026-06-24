'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import SearchBox from '@/components/SearchBox'
import EventGrid from '@/components/EventGrid'
import type { EventWithStats } from '@/lib/supabase'

const PAGE_SIZE = 40

export default function HomePage() {
  const [events, setEvents] = useState<EventWithStats[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchMode, setIsSearchMode] = useState(false)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadingMoreRef = useRef(false)

  const fetchEvents = useCallback(async (query: string) => {
    setIsLoading(true)
    try {
      const url = query
        ? `/api/events?q=${encodeURIComponent(query)}`
        : '/api/events?offset=0'
      const res = await fetch(url)
      const data = await res.json()
      const evts: EventWithStats[] = data.events ?? []
      setEvents(evts)
      setSearchQuery(query)
      setIsSearchMode(!!query)
      setHasMore(!query && (data.hasMore ?? false))
      setOffset(query ? 0 : PAGE_SIZE)
    } catch {
      setEvents([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore) return
    loadingMoreRef.current = true
    setIsLoadingMore(true)
    try {
      const res = await fetch(`/api/events?offset=${offset}`)
      const data = await res.json()
      const evts: EventWithStats[] = data.events ?? []
      setEvents((prev) => [...prev, ...evts])
      setHasMore(data.hasMore ?? false)
      setOffset((prev) => prev + PAGE_SIZE)
    } catch { /* ignore */ } finally {
      loadingMoreRef.current = false
      setIsLoadingMore(false)
    }
  }, [hasMore, offset])

  useEffect(() => { fetchEvents('') }, [fetchEvents])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore() },
      { rootMargin: '300px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [loadMore])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <div className="whitespace-nowrap">
            <h1 className="text-lg font-bold text-gray-800 leading-tight">EVENT MANAGER</h1>
            <p className="text-xs text-gray-400">パチンコ・パチスロ取材イベント管理</p>
          </div>
          <div className="flex-1">
            <SearchBox onSearch={fetchEvents} isLoading={isLoading} />
          </div>
          <Link
            href="/events/new"
            className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            + イベント登録
          </Link>
          <Link
            href="/upload"
            className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors whitespace-nowrap"
          >
            画像アップ
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {isSearchMode && !isLoading && (
          <p className="text-sm text-gray-500 mb-4">
            「{searchQuery}」の検索結果 — {events.length} 件
          </p>
        )}
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <EventGrid events={events} />
            <div ref={sentinelRef} className="h-1 mt-4" />
            {isLoadingMore && (
              <div className="flex justify-center py-6">
                <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {!isSearchMode && !hasMore && events.length > 0 && (
              <p className="text-center text-sm text-gray-400 py-6">全 {events.length} 件</p>
            )}
          </>
        )}
      </main>
    </div>
  )
}
