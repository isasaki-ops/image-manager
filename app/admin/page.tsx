'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import SearchBox from '@/components/SearchBox'

interface AdminImage {
  id: string
  r2_url: string
  uploaded_at: string
  memo: string | null
  file_name: string | null
  image_width: number | null
  image_height: number | null
}

export default function AdminPage() {
  const [images, setImages] = useState<AdminImage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [memos, setMemos] = useState<Record<string, string>>({})
  const [savingMemoId, setSavingMemoId] = useState<string | null>(null)
  const [generatingReadingsId, setGeneratingReadingsId] = useState<string | null>(null)
  const [filter600x400, setFilter600x400] = useState(false)

  const syncMemos = (imgs: AdminImage[]) => {
    setMemos((prev) => {
      const next = { ...prev }
      for (const img of imgs) {
        if (!(img.id in next)) next[img.id] = img.memo ?? ''
      }
      return next
    })
  }

  const handleSearch = useCallback(async (query: string) => {
    setIsLoading(true)
    try {
      if (!query) {
        const res = await fetch('/api/admin/images')
        const data = await res.json()
        const imgs: AdminImage[] = Array.isArray(data) ? data : []
        setImages(imgs)
        syncMemos(imgs)
      } else {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        const imgs: AdminImage[] = data.images ?? []
        setImages(imgs)
        syncMemos(imgs)
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { handleSearch('') }, [handleSearch])

  const displayImages = useMemo(() =>
    filter600x400
      ? images.filter((img) => img.image_width === 600 && img.image_height === 400)
      : images,
    [images, filter600x400]
  )

  const handleDelete = async (id: string) => {
    if (!confirm('この画像を削除しますか？元に戻せません。')) return
    await fetch(`/api/images/${id}`, { method: 'DELETE' })
    setImages((prev) => prev.filter((img) => img.id !== id))
  }

  const handleGenerateReadings = async (id: string) => {
    setGeneratingReadingsId(id)
    try {
      const res = await fetch('/api/admin/generate-readings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (data.readings) {
        setMemos((prev) => {
          const existing = prev[id] ?? ''
          const separator = existing ? ' ' : ''
          return { ...prev, [id]: existing + separator + data.readings }
        })
      }
    } finally {
      setGeneratingReadingsId(null)
    }
  }

  const handleSaveMemo = async (id: string) => {
    setSavingMemoId(id)
    try {
      await fetch(`/api/images/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memo: memos[id] ?? '' }),
      })
      setImages((prev) =>
        prev.map((img) =>
          img.id === id ? { ...img, memo: memos[id] ?? '' } : img
        )
      )
    } finally {
      setSavingMemoId(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-gray-500 hover:text-gray-700 text-sm">← 戻る</Link>
          <h1 className="text-lg font-bold text-gray-800">検索登録</h1>
          <span className="text-sm text-gray-500 ml-auto">{displayImages.length} 件</span>
        </div>
        <div className="max-w-7xl mx-auto px-4 pb-3 space-y-2">
          <SearchBox onSearch={handleSearch} isLoading={isLoading} />
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
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {displayImages.map((img) => (
              <div key={img.id} className="bg-white rounded-xl border border-gray-200 p-4 flex gap-4">
                <div className="flex-shrink-0 flex flex-col items-center gap-1">
                  <div className="relative w-48 h-32 bg-gray-100 rounded overflow-hidden">
                    <Image
                      src={img.r2_url}
                      alt={img.memo ?? ''}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                  {img.image_width && img.image_height && (
                    <span className="text-xs text-gray-400">{img.image_width}×{img.image_height}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-500">
                      {new Date(img.uploaded_at).toLocaleDateString('ja-JP')}
                    </span>
                  </div>
                  {img.file_name && (
                    <p className="text-xs text-gray-600 font-medium truncate" title={img.file_name}>
                      {img.file_name}
                    </p>
                  )}
                  <div>
                    <p className="text-xs text-gray-500 mb-1">検索キーワード</p>
                    <textarea
                      value={memos[img.id] ?? ''}
                      onChange={(e) =>
                        setMemos((prev) => ({ ...prev, [img.id]: e.target.value }))
                      }
                      placeholder="スペース区切りで複数入力"
                      rows={1}
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleSaveMemo(img.id)}
                    disabled={savingMemoId === img.id}
                    className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors disabled:opacity-50"
                  >
                    {savingMemoId === img.id ? '保存中...' : '保存'}
                  </button>
                  <button
                    onClick={() => handleDelete(img.id)}
                    className="px-3 py-1 text-xs bg-red-50 hover:bg-red-100 text-red-600 rounded transition-colors"
                  >
                    削除
                  </button>
                  <button
                    onClick={() => handleGenerateReadings(img.id)}
                    disabled={generatingReadingsId === img.id}
                    className="px-3 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 rounded transition-colors disabled:opacity-50"
                  >
                    {generatingReadingsId === img.id ? '生成中...' : '読み仮名生成'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
