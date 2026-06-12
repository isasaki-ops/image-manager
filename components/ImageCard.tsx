'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'

interface ImageCardProps {
  id: string
  r2_url: string
  uploaded_at: string
  memo: string | null
  ai_description?: string | null
  searchQuery?: string
  showFeedback?: boolean
}

export default function ImageCard({
  id,
  r2_url,
  uploaded_at,
  memo,
  searchQuery,
  showFeedback = false,
}: ImageCardProps) {
  const [imgError, setImgError] = useState(false)
  const [feedbackState, setFeedbackState] = useState<'relevant' | 'irrelevant' | null>(null)
  const [copyDone, setCopyDone] = useState(false)

  const formattedDate = new Date(uploaded_at).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  const handleCopy = async () => {
    const url = `${process.env.NEXT_PUBLIC_APP_URL}/images/${id}`
    await navigator.clipboard.writeText(url)
    setCopyDone(true)
    setTimeout(() => setCopyDone(false), 2000)
  }

  const handleDownload = () => {
    const a = document.createElement('a')
    a.href = r2_url
    a.download = `image-${id}`
    a.target = '_blank'
    a.click()
  }

  const handleFeedback = async (type: 'relevant' | 'irrelevant') => {
    if (!searchQuery) return
    setFeedbackState(type)
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_id: id, query_text: searchQuery, feedback: type }),
      })
    } catch {
      // silently fail — UI already updated
    }
  }

  return (
    <div className="group bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <Link href={`/images/${id}`}>
        <div className="relative aspect-video bg-gray-100 overflow-hidden">
          {imgError ? (
            <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
              画像を読み込めません
            </div>
          ) : (
            <Image
              src={r2_url}
              alt={memo ?? '取材画像'}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              onError={() => setImgError(true)}
              unoptimized
            />
          )}
        </div>
      </Link>

      <div className="p-3 space-y-2">
        <p className="text-xs text-gray-500">{formattedDate}</p>
        {memo && (
          <p className="text-sm text-gray-700 line-clamp-2">{memo.slice(0, 50)}</p>
        )}

        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={handleCopy}
            className="flex-1 min-w-0 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors truncate"
          >
            {copyDone ? 'コピー済み ✓' : 'URLコピー'}
          </button>
          <button
            onClick={handleDownload}
            className="flex-1 min-w-0 px-2 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 rounded transition-colors"
          >
            DL
          </button>
        </div>

        {showFeedback && searchQuery && (
          <div className="flex gap-1.5">
            <button
              onClick={() => handleFeedback('relevant')}
              className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
                feedbackState === 'relevant'
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-100 hover:bg-green-100 text-gray-600'
              }`}
            >
              ✓ 正解
            </button>
            <button
              onClick={() => handleFeedback('irrelevant')}
              className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
                feedbackState === 'irrelevant'
                  ? 'bg-gray-400 text-white'
                  : 'bg-gray-100 hover:bg-red-100 text-gray-600'
              }`}
            >
              ✗ 違う
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
