'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import BackButton from '@/components/BackButton'
import type { ImageRecord, EventWithStats } from '@/lib/supabase'

const CATEGORY_LABEL: Record<string, string> = { '01': '取材', '02': '来店' }
const CATEGORY_COLOR: Record<string, string> = {
  '01': 'bg-blue-100 text-blue-700',
  '02': 'bg-pink-100 text-pink-700',
}
const SEARCH_THRESHOLD = 0.55


function ImageCard({ img, onDelete }: { img: ImageRecord; onDelete?: (id: string) => void }) {
  const [deleting, setDeleting] = useState(false)
  const sizeLabel =
    img.image_width && img.image_height ? `${img.image_width}×${img.image_height}` : '---'

  const handleDelete = async () => {
    if (!confirm(`「${img.file_name ?? img.id}」を削除しますか？\n元に戻せません。`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/images/${img.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('削除に失敗しました')
      onDelete?.(img.id)
    } catch (err) {
      alert(err instanceof Error ? err.message : '削除に失敗しました')
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-gray-500">{sizeLabel}</p>
      <div className="relative w-full aspect-[3/2] bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
        {img.r2_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img.r2_url} alt={img.file_name ?? ''} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" />
            </svg>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-400 truncate">{img.file_name}</p>
      {onDelete && (
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="w-full text-xs py-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
        >
          {deleting ? '削除中…' : '削除'}
        </button>
      )}
    </div>
  )
}

function EventPicker({
  imageId,
  pairedImageId,
  onLinked,
}: {
  imageId: string
  pairedImageId: string | null
  onLinked: (ids: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<'01' | '02' | ''>('')
  const [events, setEvents] = useState<EventWithStats[]>([])
  const [searching, setSearching] = useState(false)
  const [linking, setLinking] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const fetchEvents = useCallback(async (q: string, cat: string) => {
    if (!q.trim()) { setEvents([]); return }
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setSearching(true)
    try {
      const params = new URLSearchParams({
        q,
        threshold: String(SEARCH_THRESHOLD),
        limit: '50',
      })
      if (cat) params.set('category', cat)
      const res = await fetch(`/api/events?${params}`, { signal: ctrl.signal })
      const data = await res.json()
      setEvents(data.events ?? [])
    } catch (err) {
      if ((err as Error).name !== 'AbortError') console.error(err)
    } finally {
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => fetchEvents(query, category), 250)
    return () => clearTimeout(t)
  }, [open, query, category, fetchEvents])

  const handleLink = async (eventId: string) => {
    setLinking(true)
    try {
      const res = await fetch(`/api/images/${imageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId }),
      })
      if (!res.ok) throw new Error('紐づけに失敗しました')
      const ids = [imageId, pairedImageId].filter(Boolean) as string[]
      onLinked(ids)
    } catch (err) {
      alert(err instanceof Error ? err.message : '紐づけに失敗しました')
      setLinking(false)
    }
  }

  const handleClose = () => {
    abortRef.current?.abort()
    setOpen(false)
    setQuery('')
    setCategory('')
    setEvents([])
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full text-xs py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors font-medium"
      >
        イベントを設定
      </button>
    )
  }

  return (
    <div className="space-y-2 pt-1">
      {/* Category filter */}
      <div className="flex gap-1.5">
        {(['', '01', '02'] as const).map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
              category === cat
                ? cat === '01' ? 'bg-blue-600 text-white'
                  : cat === '02' ? 'bg-pink-500 text-white'
                  : 'bg-gray-700 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat === '' ? '全て' : CATEGORY_LABEL[cat]}
          </button>
        ))}
      </div>

      {/* Search input */}
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="イベント名で検索…"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {/* Results */}
      {query.trim() && (
        searching ? (
          <p className="text-xs text-gray-400 text-center py-4">検索中…</p>
        ) : events.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">一致するイベントがありません</p>
        ) : (
          <div className="max-h-56 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
            {events.map((e) => (
              <button
                key={e.id}
                onClick={() => handleLink(e.id)}
                disabled={linking}
                className="w-full text-left px-3 py-2 hover:bg-blue-50 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                <span className="text-xs font-mono text-gray-400 shrink-0">{e.event_code}</span>
                <span className="text-xs text-gray-800 flex-1 truncate">{e.name}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${CATEGORY_COLOR[e.category_id] ?? 'bg-gray-100 text-gray-600'}`}>
                  {CATEGORY_LABEL[e.category_id] ?? e.category_id}
                </span>
              </button>
            ))}
          </div>
        )
      )}

      <button onClick={handleClose} className="text-xs text-gray-400 hover:text-gray-600">
        キャンセル
      </button>
    </div>
  )
}

export default function UnlinkedPage() {
  const router = useRouter()
  const [images, setImages] = useState<ImageRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchUnlinked = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/images/unlinked')
      const data = await res.json()
      setImages(data.images ?? [])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchUnlinked() }, [fetchUnlinked])

  const handleLinked = (ids: string[]) => {
    setImages((prev) => prev.filter((img) => !ids.includes(img.id)))
  }

  const handleDeleted = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id))
  }

  const totalCount = images.length

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <BackButton />
          <h1 className="text-base font-bold text-gray-800">イベント未設定画像</h1>
          {!isLoading && (
            <span className="text-sm text-gray-400">{totalCount} 枚</span>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : totalCount === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-400">未設定の画像はありません</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {images.map((img) => (
              <div key={img.id} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                <ImageCard img={img} onDelete={handleDeleted} />
                <EventPicker imageId={img.id} pairedImageId={null} onLinked={handleLinked} />
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
