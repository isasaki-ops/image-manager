'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Link from 'next/link'
import SearchBox from '@/components/SearchBox'
import EventGrid from '@/components/EventGrid'
import type { EventWithStats } from '@/lib/supabase'
import { REGIONS, ALL_REGION_IDS, isValidRegionId, NONE_REGION_PARAM } from '@/lib/regions'

const PAGE_SIZE = 40
const CATEGORIES = [
  { id: '01', label: '取材' },
  { id: '02', label: '来店' },
] as const

const parseCatFilter = (sp: URLSearchParams): Set<string> => {
  const cat = sp.get('cat')
  if (cat === '01' || cat === '02') return new Set([cat])
  return new Set(['01', '02'])
}

const parseRegionFilter = (sp: URLSearchParams): Set<string> => {
  const region = sp.get('region')
  if (!region) return new Set(ALL_REGION_IDS)
  if (region === NONE_REGION_PARAM) return new Set()
  const ids = region.split(',').filter(isValidRegionId)
  return ids.length > 0 ? new Set(ids) : new Set(ALL_REGION_IDS)
}

export default function HomePage() {
  const [events, setEvents] = useState<EventWithStats[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchMode, setIsSearchMode] = useState(false)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [catFilter, setCatFilter] = useState<Set<string>>(
    () => (typeof window !== 'undefined' ? parseCatFilter(new URLSearchParams(window.location.search)) : new Set(['01', '02']))
  )
  const [regionFilter, setRegionFilter] = useState<Set<string>>(
    () => (typeof window !== 'undefined' ? parseRegionFilter(new URLSearchParams(window.location.search)) : new Set(ALL_REGION_IDS))
  )
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({})
  const [regionCounts, setRegionCounts] = useState<Record<string, number>>({})
  const [searchBoxKey, setSearchBoxKey] = useState(0)
  const [searchBoxInitial, setSearchBoxInitial] = useState<string | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadingMoreRef = useRef(false)
  // fetchEvents実行中はloadMoreを止めるための同期フラグ（stateのクロージャ遅延による競合を防ぐ）
  const fetchInFlightRef = useRef(false)
  const initialQuery = useMemo(
    () => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('q') ?? '' : ''),
    []
  )

  const buildCategoryParam = (filter: Set<string>) =>
    filter.size === 1 ? [...filter][0] : undefined

  const buildRegionParam = (filter: Set<string>): string | undefined => {
    if (filter.size === 0) return NONE_REGION_PARAM
    if (filter.size >= ALL_REGION_IDS.length) return undefined
    return [...filter].join(',')
  }

  const fetchEvents = useCallback(async (
    query: string,
    filter: Set<string> = catFilter,
    regFilter: Set<string> = regionFilter
  ) => {
    // URLに検索条件を保持（戻るボタンで復元できるよう）
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      if (query) url.searchParams.set('q', query)
      else url.searchParams.delete('q')
      const categoryParam = buildCategoryParam(filter)
      if (categoryParam) url.searchParams.set('cat', categoryParam)
      else url.searchParams.delete('cat')
      const regionParam = buildRegionParam(regFilter)
      if (regionParam) url.searchParams.set('region', regionParam)
      else url.searchParams.delete('region')
      window.history.replaceState(window.history.state, '', url.toString())
    }
    fetchInFlightRef.current = true
    setIsLoading(true)
    try {
      const categoryParam = buildCategoryParam(filter)
      const regionParam = buildRegionParam(regFilter)
      const filterSuffix =
        (categoryParam ? `&category=${categoryParam}` : '') +
        (regionParam ? `&region=${encodeURIComponent(regionParam)}` : '')
      const url = query
        ? `/api/events?q=${encodeURIComponent(query)}${filterSuffix}`
        : `/api/events?offset=0${filterSuffix}`
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
      fetchInFlightRef.current = false
    }
  }, [catFilter, regionFilter])

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || fetchInFlightRef.current || isSearchMode || !hasMore) return
    loadingMoreRef.current = true
    setIsLoadingMore(true)
    try {
      const categoryParam = buildCategoryParam(catFilter)
      const regionParam = buildRegionParam(regionFilter)
      const filterSuffix =
        (categoryParam ? `&category=${categoryParam}` : '') +
        (regionParam ? `&region=${encodeURIComponent(regionParam)}` : '')
      const res = await fetch(`/api/events?offset=${offset}${filterSuffix}`)
      const data = await res.json()
      const evts: EventWithStats[] = data.events ?? []
      setEvents((prev) => [...prev, ...evts])
      setHasMore(data.hasMore ?? false)
      setOffset((prev) => prev + PAGE_SIZE)
    } catch { /* ignore */ } finally {
      loadingMoreRef.current = false
      setIsLoadingMore(false)
    }
  }, [hasMore, offset, catFilter, regionFilter, isSearchMode])

  const restoreScroll = (y: number) => {
    // レイアウト確定後にスクロールするため2フレーム待つ
    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.scrollTo(0, y))
    })
  }

  // 保存されたoffset分をページ単位で再取得し、無限スクロールの続きから復元する
  const restoreInfiniteScroll = async (targetOffset: number, scrollY: number) => {
    fetchInFlightRef.current = true
    setIsLoading(true)
    try {
      const categoryParam = buildCategoryParam(catFilter)
      const regionParam = buildRegionParam(regionFilter)
      const filterSuffix =
        (categoryParam ? `&category=${categoryParam}` : '') +
        (regionParam ? `&region=${encodeURIComponent(regionParam)}` : '')
      const collected: EventWithStats[] = []
      let more = false
      const total = Math.max(PAGE_SIZE, targetOffset)
      for (let off = 0; off < total; off += PAGE_SIZE) {
        const res = await fetch(`/api/events?offset=${off}${filterSuffix}`)
        const data = await res.json()
        const evts: EventWithStats[] = data.events ?? []
        collected.push(...evts)
        more = data.hasMore ?? false
        if (evts.length < PAGE_SIZE) break
      }
      setEvents(collected)
      setOffset(collected.length)
      setHasMore(more)
      restoreScroll(scrollY)
    } catch {
      setEvents([])
    } finally {
      setIsLoading(false)
      fetchInFlightRef.current = false
    }
  }

  // カード詳細から「戻る」で復元できるよう、離脱時の読み込み件数とスクロール位置を保存する
  const saveScrollState = () => {
    if (typeof window === 'undefined') return
    try {
      sessionStorage.setItem('topScrollState', JSON.stringify({
        url: window.location.pathname + window.location.search,
        offset,
        scrollY: window.scrollY,
      }))
    } catch { /* ignore */ }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let cached: { url: string; offset: number; scrollY: number } | null = null
    try {
      const raw = sessionStorage.getItem('topScrollState')
      if (raw) cached = JSON.parse(raw)
    } catch { /* ignore */ }

    const currentUrl = window.location.pathname + window.location.search
    if (!cached || cached.url !== currentUrl) {
      fetchEvents(initialQuery)
      return
    }
    sessionStorage.removeItem('topScrollState')

    if (initialQuery) {
      fetchEvents(initialQuery).then(() => restoreScroll(cached!.scrollY))
      return
    }

    restoreInfiniteScroll(cached.offset, cached.scrollY)
  }, [])

  useEffect(() => {
    const handlePopState = () => {
      const sp = new URLSearchParams(window.location.search)
      const q = sp.get('q') ?? ''
      const filter = parseCatFilter(sp)
      const regFilter = parseRegionFilter(sp)
      setSearchBoxInitial(q)
      setSearchBoxKey((k) => k + 1)
      setCatFilter(filter)
      setRegionFilter(regFilter)
      fetchEvents(q, filter, regFilter)
      fetchRegionCounts(filter)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchEvents])

  // カテゴリ件数は地方フィルターに関わらず常に総数。地方件数は「現在選択中のカテゴリ」で絞った上で集計する
  const fetchCategoryCounts = useCallback(async () => {
    try {
      const res = await fetch('/api/events/counts')
      setCategoryCounts(await res.json())
    } catch { /* ignore */ }
  }, [])

  const fetchRegionCounts = useCallback(async (filter: Set<string> = catFilter) => {
    const categoryParam = buildCategoryParam(filter)
    const suffix = categoryParam ? `?category=${categoryParam}` : ''
    try {
      const res = await fetch(`/api/events/region-counts${suffix}`)
      setRegionCounts(await res.json())
    } catch { /* ignore */ }
  }, [catFilter])

  useEffect(() => {
    fetchCategoryCounts()
    fetchRegionCounts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const handleCatToggle = (id: string) => {
    setCatFilter((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        if (next.size === 1) return prev // 最低1つは残す
        next.delete(id)
      } else {
        next.add(id)
      }
      fetchEvents(searchQuery, next, regionFilter)
      fetchRegionCounts(next)
      return next
    })
  }

  // 地方チェックを全て外した状態は「設定なし」（地方未設定イベント）の絞り込みとして扱う
  const handleRegionToggle = (id: string) => {
    setRegionFilter((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      fetchEvents(searchQuery, catFilter, next)
      return next
    })
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 bg-black/70 backdrop-blur border-b border-cyan-400/40 shadow-[0_0_24px_rgba(34,211,238,0.15)]">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <button
            onClick={(e) => {
              e.preventDefault()
              setSearchBoxInitial('')
              setSearchBoxKey((k) => k + 1)
              fetchEvents('')
            }}
            className="whitespace-nowrap shrink-0 hover:opacity-80 transition-opacity"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="イベントマネージャー" className="h-10 w-auto object-contain" />
          </button>
          <div className="flex-1 max-w-md">
            <SearchBox
              key={searchBoxKey}
              onSearch={fetchEvents}
              isLoading={isLoading}
              initialValue={searchBoxInitial ?? initialQuery}
            />
          </div>
          <div className="flex items-center gap-2.5">
            <Link
              href="/events/new"
              className="px-5 py-2.5 bg-black text-cyan-300 border border-cyan-400 rounded-xl text-base font-bold shadow-[0_0_16px_rgba(34,211,238,0.55)] hover:bg-cyan-400 hover:text-black hover:shadow-[0_0_26px_rgba(34,211,238,0.9)] transition-all whitespace-nowrap"
            >
              + イベント登録
            </Link>
            <Link
              href="/upload"
              className="px-5 py-2.5 bg-black text-fuchsia-300 border border-fuchsia-400 rounded-xl text-base font-bold shadow-[0_0_16px_rgba(217,70,239,0.55)] hover:bg-fuchsia-400 hover:text-black hover:shadow-[0_0_26px_rgba(217,70,239,0.9)] transition-all whitespace-nowrap"
            >
              画像アップロード
            </Link>
          </div>
          <Link
            href="/unlinked"
            className="px-3 py-2 bg-black text-lime-300 border border-lime-400/50 rounded-xl text-sm font-medium hover:border-lime-400 hover:shadow-[0_0_12px_rgba(163,230,53,0.5)] transition-all whitespace-nowrap"
          >
            未設定画像一覧
          </Link>
        </div>

        {/* カテゴリフィルター */}
        <div className="max-w-7xl mx-auto px-4 pb-2 flex items-center gap-5">
          {CATEGORIES.map(({ id, label }) => (
            <label key={id} className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={catFilter.has(id)}
                onChange={() => handleCatToggle(id)}
                className="w-4 h-4 accent-cyan-400"
              />
              <span className="text-sm text-zinc-300">{label}</span>
              <span className="text-xs text-zinc-300">({categoryCounts[id] ?? 0}件)</span>
            </label>
          ))}
        </div>

        {/* 地方フィルター（全て外すと「設定なし」＝地方未設定イベントの絞り込みになる） */}
        <div className="max-w-7xl mx-auto px-4 pb-3 flex items-center gap-5 flex-wrap">
          {REGIONS.map(({ id, label }) => (
            <label key={id} className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={regionFilter.has(id)}
                onChange={() => handleRegionToggle(id)}
                className="w-4 h-4 accent-cyan-400"
              />
              <span className="text-sm text-zinc-300">{label}</span>
              <span className="text-xs text-zinc-300">({regionCounts[id] ?? 0}件)</span>
            </label>
          ))}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {isSearchMode && !isLoading && (
          <p className="text-sm text-zinc-400 mb-4">
            「{searchQuery}」の検索結果 — {events.length} 件
          </p>
        )}
        {isLoading && (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin shadow-[0_0_12px_rgba(34,211,238,0.6)]" />
          </div>
        )}
        {/* sentinelはローディング中もDOMに残し、IntersectionObserverの監視対象を維持する */}
        <div className={isLoading ? 'hidden' : ''}>
          <EventGrid events={events} onCardClick={saveScrollState} />
          {isLoadingMore && (
            <div className="flex justify-center py-6">
              <div className="w-6 h-6 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin shadow-[0_0_12px_rgba(34,211,238,0.6)]" />
            </div>
          )}
          {!isSearchMode && !hasMore && events.length > 0 && (
            <p className="text-center text-sm text-zinc-500 py-6">全 {events.length} 件</p>
          )}
        </div>
        <div ref={sentinelRef} className="h-1 mt-4" />
      </main>
    </div>
  )
}
