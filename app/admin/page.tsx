'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'

interface AdminImage {
  id: string
  r2_url: string
  uploaded_at: string
  memo: string | null
  ai_description: string | null
  is_active: boolean
  relevant_count: number
  irrelevant_count: number
}

export default function AdminPage() {
  const [images, setImages] = useState<AdminImage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)

  const fetchImages = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/admin/images')
      const data = await res.json()
      setImages(Array.isArray(data) ? data : [])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchImages() }, [])

  const handleDeactivate = async (id: string) => {
    if (!confirm('この画像を無効化しますか？')) return
    await fetch(`/api/images/${id}`, { method: 'DELETE' })
    setImages((prev) => prev.map((img) => img.id === id ? { ...img, is_active: false } : img))
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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-gray-500 hover:text-gray-700 text-sm">← 戻る</Link>
          <h1 className="text-lg font-bold text-gray-800">管理画面</h1>
          <span className="text-sm text-gray-500 ml-auto">{images.length} 件</span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {images.map((img) => (
              <div
                key={img.id}
                className={`bg-white rounded-xl border p-4 flex gap-4 ${
                  !img.is_active ? 'opacity-50 border-gray-200' : 'border-gray-200'
                }`}
              >
                <div className="relative w-24 h-16 flex-shrink-0 bg-gray-100 rounded overflow-hidden">
                  <Image
                    src={img.r2_url}
                    alt={img.memo ?? ''}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
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
                  {img.memo && <p className="text-sm text-gray-700 truncate">{img.memo}</p>}
                  {img.ai_description && (
                    <p className="text-xs text-gray-500 line-clamp-2">{img.ai_description}</p>
                  )}
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleReanalyze(img.id)}
                    disabled={processingId === img.id}
                    className="px-3 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 rounded transition-colors disabled:opacity-50"
                  >
                    {processingId === img.id ? '解析中...' : 'AI再解析'}
                  </button>
                  {img.is_active && (
                    <button
                      onClick={() => handleDeactivate(img.id)}
                      className="px-3 py-1 text-xs bg-red-50 hover:bg-red-100 text-red-600 rounded transition-colors"
                    >
                      無効化
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
