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
  file_name?: string | null
  file_size?: number | null
  file_type?: string | null
  image_width?: number | null
  image_height?: number | null
  searchQuery?: string
  showFeedback?: boolean
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ImageCard({
  id,
  r2_url,
  uploaded_at,
  memo,
  file_name,
  file_size,
  file_type,
  image_width,
  image_height,
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
    await navigator.clipboard.writeText(r2_url)
    setCopyDone(true)
    setTimeout(() => setCopyDone(false), 2000)
  }

  const handleDownload = () => {
    const a = document.createElement('a')
    a.href = `/api/images/${id}/download`
    a.download = file_name ?? `image-${id}`
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
          {!file_type?.startsWith('image/') ? (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-1">
              <span className="text-3xl">📄</span>
              <span className="text-xs">{file_type?.split('/')[1]?.toUpperCase() ?? 'FILE'}</span>
            </div>
          ) : imgError ? (
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
        <p className="text-xs font-medium text-gray-500">{formattedDate}</p>
        {file_name && (
          <p className="text-xs font-semibold text-gray-700 truncate" title={file_name}>{file_name}</p>
        )}
        {(file_type || file_size != null || (image_width && image_height)) && (
          <p className="text-xs text-gray-500 bg-gray-100 rounded px-2 py-0.5 inline-block">
            {file_type?.split('/')[1]?.toUpperCase()}
            {file_type && file_size != null && ' · '}
            {file_size != null && formatFileSize(file_size)}
            {(file_type || file_size != null) && image_width && image_height && ' · '}
            {image_width && image_height && `${image_width}×${image_height}`}
          </p>
        )}
        {memo && (
          <p className="text-sm font-medium text-gray-800 line-clamp-2">{memo.slice(0, 50)}</p>
        )}

        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={handleCopy}
            className="flex-1 min-w-0 px-2 py-1.5 text-xs font-medium bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded transition-colors truncate"
          >
            {copyDone ? 'コピー済み ✓' : 'URLコピー'}
          </button>
          <button
            onClick={handleDownload}
            className="flex-1 min-w-0 px-2 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >
            DL
          </button>
        </div>

        {showFeedback && searchQuery && (
          <div className="space-y-1.5 pt-1 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-500">フィードバックをお願いします</p>
            <div className="flex gap-1.5">
              <button
                onClick={() => handleFeedback('relevant')}
                className={`flex-1 px-2 py-1.5 text-xs font-medium rounded border transition-colors ${
                  feedbackState === 'relevant'
                    ? 'bg-green-500 border-green-500 text-white'
                    : 'bg-white border-green-400 text-green-700 hover:bg-green-50'
                }`}
              >
                ✓ 正解
              </button>
              <button
                onClick={() => handleFeedback('irrelevant')}
                className={`flex-1 px-2 py-1.5 text-xs font-medium rounded border transition-colors ${
                  feedbackState === 'irrelevant'
                    ? 'bg-red-500 border-red-500 text-white'
                    : 'bg-white border-red-400 text-red-700 hover:bg-red-50'
                }`}
              >
                ✗ 不正解
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
