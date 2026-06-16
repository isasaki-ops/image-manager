'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import SearchBox from '@/components/SearchBox'

function AiAccordion({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <span className="text-xs text-gray-500">AI解析結果</span>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-3 py-2">
          <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{text}</p>
        </div>
      )}
    </div>
  )
}

interface AdminImage {
  id: string
  r2_url: string
  uploaded_at: string
  memo: string | null
  ai_description: string | null
  is_active: boolean
  relevant_count: number
  irrelevant_count: number
  image_width: number | null
  image_height: number | null
}

export default function AdminPage() {
  const [images, setImages] = useState<AdminImage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [memos, setMemos] = useState<Record<string, string>>({})
  const [savingMemoId, setSavingMemoId] = useState<string | null>(null)
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
        const raw = data.images ?? (Array.isArray(data) ? data : [])
        const imgs: AdminImage[] = raw.map((item: AdminImage) => ({
          ...item,
          is_active: true,
          relevant_count: 0,
          irrelevant_count: 0,
        }))
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

  const handleReanalyze = async (id: string) => {
    setProcessingId(id)
    try {
      const res = await fetch('/api/admin/reanalyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (data.success) {
        setImages((prev) =>
          prev.map((img) =>
            img.id === id ? { ...img, ai_description: data.ai_description } : img
          )
        )
      }
    } finally {
      setProcessingId(null)
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
          <h1 className="text-lg font-bold text-gray-800">解析結果</h1>
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
              <div
                key={img.id}
                className={`bg-white rounded-xl border p-4 flex gap-4 ${
                  !img.is_active ? 'opacity-50 border-gray-200' : 'border-gray-200'
                }`}
              >
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
                    <span className={`text-xs px-2 py-0.5 rounded-full ${img.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {img.is_active ? '有効' : '無効'}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(img.uploaded_at).toLocaleDateString('ja-JP')}
                    </span>
                    <span className="text-xs text-green-600">✓ {img.relevant_count}</span>
                    <span className="text-xs text-red-500">✗ {img.irrelevant_count}</span>
                    {!img.ai_description && (
                      <span className="text-xs text-amber-600">AI未解析</span>
                    )}
                  </div>
                  {img.ai_description && (
                    <AiAccordion text={img.ai_description} />
                  )}
                  <textarea
                    value={memos[img.id] ?? ''}
                    onChange={(e) =>
                      setMemos((prev) => ({ ...prev, [img.id]: e.target.value }))
                    }
                    placeholder="検索キーワードを入れてください（複数ある場合はスペースで区切る）"
                    rows={1}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleReanalyze(img.id)}
                    disabled={processingId === img.id}
                    className="px-3 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 rounded transition-colors disabled:opacity-50"
                  >
                    {processingId === img.id ? '解析中...' : 'AI再解析'}
                  </button>
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
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
