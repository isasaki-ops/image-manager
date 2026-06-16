'use client'

import { useState, useCallback, useRef } from 'react'
import { RESIZABLE_MIME_TYPES, RESIZABLE_EXTENSIONS } from '@/lib/imageTypes'

interface UploadResult {
  id: string
  r2_url: string
}

function fileCanResize(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return RESIZABLE_MIME_TYPES.has(file.type) || RESIZABLE_EXTENSIONS.has(ext)
}

export default function UploadForm() {
  const [isDragging, setIsDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [memo, setMemo] = useState('')
  const [createThumbnail, setCreateThumbnail] = useState(false)
  const [progress, setProgress] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')
  const [result, setResult] = useState<UploadResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = (f: File) => {
    if (f.size > 100 * 1024 * 1024) {
      setErrorMsg('ファイルサイズは100MB以下にしてください')
      return
    }
    setFile(f)
    setErrorMsg('')
    if (!fileCanResize(f)) setCreateThumbnail(false)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return

    setProgress('uploading')
    setErrorMsg('')

    const formData = new FormData()
    formData.append('file', file)
    if (memo) formData.append('memo', memo)
    formData.append('create_thumbnail', String(createThumbnail))

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      setResult(data)
      setProgress('success')
      setFile(null)
      setMemo('')
      setCreateThumbnail(false)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'アップロードに失敗しました')
      setProgress('error')
    }
  }

  const resizable = file ? fileCanResize(file) : false

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            isDragging
              ? 'border-blue-500 bg-blue-50'
              : file
              ? 'border-green-400 bg-green-50'
              : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />
          {file ? (
            <div>
              <p className="font-medium text-green-700">{file.name}</p>
              <p className="text-sm text-green-600">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          ) : (
            <div className="text-gray-500">
              <p className="text-base">ここにドラッグ&ドロップ</p>
              <p className="text-sm mt-1">または クリックしてファイルを選択</p>
              <p className="text-xs mt-2 text-gray-400">すべてのファイル形式対応（PSD含む）· 最大100MB</p>
            </div>
          )}
        </div>

        {/* Thumbnail checkbox */}
        <label className={`flex items-center gap-3 select-none ${resizable ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}`}>
          <input
            type="checkbox"
            checked={createThumbnail}
            disabled={!resizable}
            onChange={(e) => setCreateThumbnail(e.target.checked)}
            className="w-4 h-4 accent-blue-600"
          />
          <span className="text-sm text-gray-700">
            600×400で複製
            {file && !resizable && (
              <span className="ml-2 text-xs text-gray-400">（このファイル形式は非対応）</span>
            )}
          </span>
        </label>

        {errorMsg && <p className="text-red-600 text-sm">{errorMsg}</p>}

        <button
          type="submit"
          disabled={!file || progress === 'uploading'}
          className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {progress === 'uploading' ? 'アップロード中...' : 'アップロード'}
        </button>
      </form>

      {progress === 'success' && result && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-800 font-medium text-sm">アップロード完了！</p>
          <p className="text-xs text-green-600 mt-1 break-all">{result.r2_url}</p>
          <p className="text-xs text-gray-500 mt-2">
            ※ AI解析は数秒〜数十秒後に完了します
          </p>
        </div>
      )}
    </div>
  )
}
