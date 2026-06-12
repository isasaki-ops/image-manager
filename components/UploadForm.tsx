'use client'

import { useState, useCallback, useRef } from 'react'

interface UploadResult {
  id: string
  r2_url: string
}

export default function UploadForm() {
  const [isDragging, setIsDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [memo, setMemo] = useState('')
  const [progress, setProgress] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')
  const [result, setResult] = useState<UploadResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = (f: File) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowed.includes(f.type)) {
      setErrorMsg('JPEG・PNG・WebP・GIF のみアップロードできます')
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      setErrorMsg('ファイルサイズは10MB以下にしてください')
      return
    }
    setFile(f)
    setErrorMsg('')
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

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      setResult(data)
      setProgress('success')
      setFile(null)
      setMemo('')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'アップロードに失敗しました')
      setProgress('error')
    }
  }

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
            accept="image/jpeg,image/png,image/webp,image/gif"
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
              <p className="text-xs mt-2 text-gray-400">JPEG / PNG / WebP / GIF · 最大10MB</p>
            </div>
          )}
        </div>

        {/* Memo */}
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="メモ（任意）：機種名、撮影場所など"
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />

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
