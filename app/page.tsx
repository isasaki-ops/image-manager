'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import SearchBox from '@/components/SearchBox'
import ImageGrid from '@/components/ImageGrid'

interface ImageItem {
  id: string
  r2_url: string
  uploaded_at: string
  memo: string | null
  ai_description: string | null
}

export default function HomePage() {
  const [images, setImages] = useState<ImageItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchMode, setIsSearchMode] = useState(false)

  const fetchImages = useCallback(async (query: string) => {
    setIsLoading(true)
    try {
      const url = query ? `/api/search?q=${encodeURIComponent(query)}` : '/api/search'
      const res = await fetch(url)
      const data = await res.json()
      setImages(Array.isArray(data) ? data : [])
      setIsSearchMode(!!query)
      setSearchQuery(query)
    } catch {
      setImages([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchImages('')
  }, [fetchImages])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <h1 className="text-lg font-bold text-gray-800 whitespace-nowrap">
            取材画像管理
          </h1>
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
            管理
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {isSearchMode && !isLoading && (
          <p className="text-sm text-gray-500 mb-4">
            「{searchQuery}」の検索結果 — {images.length} 件
          </p>
        )}
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <ImageGrid
            images={images}
            searchQuery={isSearchMode ? searchQuery : undefined}
            showFeedback={isSearchMode}
          />
        )}
      </main>
    </div>
  )
}
