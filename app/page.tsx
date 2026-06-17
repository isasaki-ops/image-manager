'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import SearchBox from '@/components/SearchBox'
import ImageGrid from '@/components/ImageGrid'

interface ImageItem {
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
}

export default function HomePage() {
  const [images, setImages] = useState<ImageItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchMode, setIsSearchMode] = useState(false)
  const [filter600x400, setFilter600x400] = useState(false)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadingMoreRef = useRef(false)

  const fetchImages = useCallback(async (query: string) => {
    setIsLoading(true)
    try {
      const url = query
        ? `/api/search?q=${encodeURIComponent(query)}`
        : '/api/search?offset=0'
      const res = await fetch(url)
      const data = await res.json()
      const imgs: ImageItem[] = data.images ?? []
      setImages(imgs)
      setSearchQuery(query)
      setIsSearchMode(!!query)
      setHasMore(!query && (data.hasMore ?? false))
      setOffset(query ? 0 : 40)
    } catch {
      setImages([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore) return
    loadingMoreRef.current = true
    setIsLoadingMore(true)
    try {
      const res = await fetch(`/api/search?offset=${offset}`)
      const data = await res.json()
      const imgs: ImageItem[] = data.images ?? []
      setImages((prev) => [...prev, ...imgs])
      setHasMore(data.hasMore ?? false)
      setOffset((prev) => prev + 40)
    } catch {
      // ignore
    } finally {
      loadingMoreRef.current = false
      setIsLoadingMore(false)
    }
  }, [hasMore, offset])

  useEffect(() => { fetchImages('') }, [fetchImages])

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

  const displayImages = useMemo(() =>
    filter600x400
      ? images.filter((img) => img.image_width === 600 && img.image_height === 400)
      : images,
    [images, filter600x400]
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <div className="whitespace-nowrap">
            <h1 className="text-lg font-bold text-gray-800 leading-tight">IMAGE MANAGER</h1>
            <p className="text-xs text-gray-400">パチンコ・パチスロ取材画像管理</p>
          </div>
          <div className="flex-1">
            <SearchBox onSearch={fetchImages} isLoading={isLoading} />
          </div>
          <Link
            href="/upload"
            className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            + アップロード
          </Link>
          <Link
            href="/admin"
            className="px-3 py-2 text-gray-500 hover:text-gray-700 text-sm whitespace-nowrap"
          >
            検索登録
          </Link>
        </div>
        <div className="max-w-7xl mx-auto px-4 pb-2">
          <label className="flex items-center gap-2 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={filter600x400}
              onChange={(e) => setFilter600x400(e.target.checked)}
              className="w-4 h-4 accent-blue-600"
            />
            <span className="text-sm text-gray-600">600×400のみ表示</span>
          </label>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {isSearchMode && !isLoading && (
          <p className="text-sm text-gray-500 mb-4">
            「{searchQuery}」の検索結果 — {displayImages.length} 件
          </p>
        )}
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <ImageGrid
              images={displayImages}
              searchQuery={isSearchMode ? searchQuery : undefined}
            />
            <div ref={sentinelRef} className="h-1 mt-4" />
            {isLoadingMore && (
              <div className="flex justify-center py-6">
                <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {!isSearchMode && !hasMore && images.length > 0 && (
              <p className="text-center text-sm text-gray-400 py-6">全 {images.length} 件</p>
            )}
          </>
        )}
      </main>
    </div>
  )
}
