'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { RESIZABLE_MIME_TYPES, RESIZABLE_EXTENSIONS } from '@/lib/imageTypes'

interface UploadResult {
  id: string
  r2_url: string
}

interface EventOption {
  id: string
  event_code: string
  category_id: string
  name: string
}

const CATEGORY_LABEL: Record<string, string> = { '01': '取材', '02': '来店' }

function fileCanResize(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return RESIZABLE_MIME_TYPES.has(file.type) || RESIZABLE_EXTENSIONS.has(ext)
}

export default function UploadForm() {
  const searchParams = useSearchParams()
  const presetEventId = searchParams.get('eventId')
  const presetEventName = searchParams.get('eventName')

  const [isDragging, setIsDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [createThumbnail, setCreateThumbnail] = useState(false)
  const [progress, setProgress] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')
  const [result, setResult] = useState<UploadResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Event selection
  const [selectedEventId, setSelectedEventId] = useState<string | null>(presetEventId)
  const [selectedEventName, setSelectedEventName] = useState<string | null>(presetEventName)
  const [eventSearch, setEventSearch] = useState('')
  const [eventOptions, setEventOptions] = useState<EventOption[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [searchingEvents, setSearchingEvents] = useState(false)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

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

  const searchEventOptions = useCallback(async (q: string) => {
    setSearchingEvents(true)
    try {
      const url = q.trim()
        ? `/api/events?q=${encodeURIComponent(q)}&limit=8`
        : '/api/events?limit=8'
      const res = await fetch(url)
      const data = await res.json()
      setEventOptions(data.events ?? [])
    } finally {
      setSearchingEvents(false)
    }
  }, [])

  useEffect(() => {
    if (!eventSearch.trim()) {
      setShowDropdown(false)
      setEventOptions([])
      return
    }
    setShowDropdown(true)
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => searchEventOptions(eventSearch), 250)
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current) }
  }, [eventSearch, searchEventOptions])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selectEvent = (e: EventOption) => {
    setSelectedEventId(e.id)
    setSelectedEventName(e.name)
    setEventSearch('')
    setShowDropdown(false)
  }

  const clearEvent = () => {
    setSelectedEventId(null)
    setSelectedEventName(null)
    setEventSearch('')
  }

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!file) return

    setProgress('uploading')
    setErrorMsg('')

    const formData = new FormData()
    formData.append('file', file)
    formData.append('create_thumbnail', String(createThumbnail))
    if (selectedEventId) formData.append('event_id', selectedEventId)

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      setResult(data)
      setProgress('success')
      setFile(null)
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

        {/* イベント選択 */}
        <div ref={dropdownRef} className="relative">
          <label className="block text-sm font-medium text-zinc-400 mb-1">イベント</label>
          {selectedEventId ? (
            <div className="flex items-center gap-2 border border-fuchsia-400/70 bg-black shadow-[0_0_10px_rgba(217,70,239,0.25)] rounded-lg px-3 py-2">
              <span className="flex-1 text-sm text-fuchsia-300 font-medium">{selectedEventName}</span>
              {!presetEventId && (
                <button type="button" onClick={clearEvent} className="text-fuchsia-400/70 hover:text-fuchsia-300 text-lg leading-none">×</button>
              )}
            </div>
          ) : (
            <>
              <div
                className="flex items-center gap-2 border border-zinc-700 rounded-lg px-3 py-2 cursor-text bg-black focus-within:border-fuchsia-400 focus-within:shadow-[0_0_10px_rgba(217,70,239,0.35)]"
              >
                <input
                  type="text"
                  value={eventSearch}
                  onChange={(e) => setEventSearch(e.target.value)}
                  placeholder="イベントを検索（空欄でイベント未設定）"
                  className="flex-1 text-sm text-zinc-100 outline-none bg-transparent placeholder-zinc-600"
                />
                {searchingEvents && (
                  <div className="w-3 h-3 border-2 border-fuchsia-400 border-t-transparent rounded-full animate-spin" />
                )}
              </div>
              {showDropdown && (
                <div className="absolute z-20 w-full mt-1 bg-zinc-950 border border-fuchsia-400/40 rounded-xl shadow-[0_0_20px_rgba(217,70,239,0.2)] max-h-64 overflow-y-auto">
                  <button
                    type="button"
                    onClick={clearEvent}
                    className="w-full text-left px-4 py-2.5 text-sm text-zinc-500 hover:bg-zinc-900 border-b border-zinc-800"
                  >
                    イベント未設定
                  </button>
                  {eventOptions.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => selectEvent(e)}
                      className="w-full text-left px-4 py-2.5 hover:bg-zinc-900 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-lime-400/80 font-mono">{e.event_code}</span>
                        <span className="text-xs text-zinc-500">{CATEGORY_LABEL[e.category_id]}</span>
                      </div>
                      <p className="text-sm font-medium text-zinc-200">{e.name}</p>
                    </button>
                  ))}
                  {eventOptions.length === 0 && !searchingEvents && (
                    <p className="px-4 py-3 text-sm text-zinc-500">見つかりません</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-cyan-400 bg-cyan-400/5 shadow-[0_0_20px_rgba(34,211,238,0.25)]'
              : file
              ? 'border-emerald-400 bg-emerald-400/5 shadow-[0_0_20px_rgba(52,211,153,0.2)]'
              : 'border-zinc-700 hover:border-cyan-400/60'
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
              <p className="font-medium text-emerald-300">{file.name}</p>
              <p className="text-sm text-emerald-400/70">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          ) : (
            <div className="text-zinc-500">
              <p className="text-base">ここにドラッグ&ドロップ</p>
              <p className="text-sm mt-1">または クリックしてファイルを選択</p>
              <p className="text-xs mt-2 text-zinc-600">すべてのファイル形式対応（PSD含む）· 最大100MB</p>
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
            className="w-4 h-4 accent-fuchsia-400"
          />
          <span className="text-sm text-zinc-300">
            600×400で複製
            {file && !resizable && (
              <span className="ml-2 text-xs text-zinc-600">（このファイル形式は非対応）</span>
            )}
          </span>
        </label>

        {errorMsg && <p className="text-rose-400 text-sm">{errorMsg}</p>}

        <button
          type="submit"
          disabled={!file || progress === 'uploading'}
          className="w-full py-2.5 bg-black text-fuchsia-300 border border-fuchsia-400 rounded-lg font-bold shadow-[0_0_16px_rgba(217,70,239,0.5)] hover:bg-fuchsia-400 hover:text-black hover:shadow-[0_0_26px_rgba(217,70,239,0.85)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-black disabled:hover:text-fuchsia-300 transition-all"
        >
          {progress === 'uploading' ? 'アップロード中...' : 'アップロード'}
        </button>
      </form>

      {progress === 'success' && result && (
        <div className="p-4 bg-black border border-emerald-400/60 shadow-[0_0_16px_rgba(52,211,153,0.25)] rounded-lg">
          <p className="text-emerald-300 font-medium text-sm">アップロード完了！</p>
          <p className="text-xs text-emerald-400/70 mt-1 break-all">{result.r2_url}</p>
            </div>
      )}
    </div>
  )
}
