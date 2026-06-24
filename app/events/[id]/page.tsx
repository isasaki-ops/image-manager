'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Event, ImageRecord } from '@/lib/supabase'

const CATEGORY_LABEL: Record<string, string> = { '01': '取材', '02': '来店' }
const CATEGORY_COLOR: Record<string, string> = {
  '01': 'bg-blue-100 text-blue-700',
  '02': 'bg-pink-100 text-pink-700',
}

interface ImagePair {
  original: ImageRecord
  thumbnail: ImageRecord | null
}

function pairImages(images: ImageRecord[]): { pairs: ImagePair[]; orphanThumbs: ImageRecord[] } {
  const originals = images.filter((i) => i.image_type === 'original')
  const thumbnails = images.filter((i) => i.image_type === '600x400')
  const usedIds = new Set<string>()

  const pairs: ImagePair[] = originals.map((orig) => {
    const base = orig.file_name?.replace(/\.[^.]+$/, '') ?? ''
    const thumb = thumbnails.find(
      (t) => !usedIds.has(t.id) && t.file_name === `${base}_600x400.jpg`
    )
    if (thumb) usedIds.add(thumb.id)
    return { original: orig, thumbnail: thumb ?? null }
  })

  const orphanThumbs = thumbnails.filter((t) => !usedIds.has(t.id))
  return { pairs, orphanThumbs }
}

function ImageThumb({
  img,
  onDelete,
  onCreated600x400,
  showCreate,
}: {
  img: ImageRecord
  onDelete: (id: string) => void
  onCreated600x400?: (newImg: ImageRecord) => void
  showCreate?: boolean
}) {
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleCreate = async () => {
    setCreating(true)
    try {
      const res = await fetch(`/api/images/${img.id}/duplicate`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (onCreated600x400) {
        onCreated600x400({
          id: data.id,
          r2_url: data.r2_url,
          event_id: img.event_id,
          image_type: '600x400',
          r2_key: '',
          uploaded_at: new Date().toISOString(),
          memo: img.memo,
          file_name: img.file_name ? img.file_name.replace(/\.[^.]+$/, '') + '_600x400.jpg' : null,
          file_size: null,
          file_type: 'image/jpeg',
          image_width: 600,
          image_height: 400,
        })
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '作成に失敗しました')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('この画像を削除しますか？')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/images/${img.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('削除に失敗しました')
      onDelete(img.id)
    } catch (err) {
      alert(err instanceof Error ? err.message : '削除に失敗しました')
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-2">
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
      <div className="flex gap-2">
        <a
          href={`/api/images/${img.id}/download`}
          download={img.file_name ?? undefined}
          className="flex-1 text-center text-xs py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
        >
          DL
        </a>
        {showCreate && (
          <button
            onClick={handleCreate}
            disabled={creating}
            className="flex-1 text-xs py-1.5 bg-teal-50 text-teal-600 rounded-lg hover:bg-teal-100 disabled:opacity-50 transition-colors"
          >
            {creating ? '作成中…' : '600×400'}
          </button>
        )}
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="flex-1 text-xs py-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
        >
          {deleting ? '…' : '削除'}
        </button>
      </div>
    </div>
  )
}

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [event, setEvent] = useState<Event | null>(null)
  const [images, setImages] = useState<ImageRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingKeywords, setEditingKeywords] = useState(false)
  const [editingMemo, setEditingMemo] = useState(false)
  const [keywords, setKeywords] = useState('')
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState<'keywords' | 'memo' | null>(null)
  const [generatingKeywords, setGeneratingKeywords] = useState(false)

  const fetchEvent = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/events/${id}`)
      const data = await res.json()
      if (!res.ok) return
      setEvent(data.event)
      setImages(data.images ?? [])
      setKeywords(data.event.keywords ?? '')
      setMemo(data.event.memo ?? '')
    } finally {
      setIsLoading(false)
    }
  }, [id])

  useEffect(() => { fetchEvent() }, [fetchEvent])

  const saveField = async (field: 'keywords' | 'memo', value: string) => {
    setSaving(field)
    try {
      await fetch(`/api/events/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      setEvent((prev) => prev ? { ...prev, [field]: value } : prev)
      if (field === 'keywords') setEditingKeywords(false)
      if (field === 'memo') setEditingMemo(false)
    } finally {
      setSaving(null)
    }
  }

  const generateKeywords = async () => {
    if (!event) return
    setGeneratingKeywords(true)
    try {
      await fetch(`/api/events/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: '' }),
      })
      await fetchEvent()
    } finally {
      setGeneratingKeywords(false)
    }
  }

  const handleDeleteImage = (imageId: string) => {
    setImages((prev) => prev.filter((i) => i.id !== imageId))
  }

  const handleCreated600x400 = (newImg: ImageRecord) => {
    setImages((prev) => [...prev, newImg])
  }

  const handleDeleteEvent = async () => {
    if (!confirm(`「${event?.name}」を削除しますか？\n（紐づいている画像はイベント未設定になります）`)) return
    const res = await fetch(`/api/events/${id}`, { method: 'DELETE' })
    if (res.ok) router.push('/')
    else alert('削除に失敗しました')
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">イベントが見つかりません</p>
      </div>
    )
  }

  const { pairs, orphanThumbs } = pairImages(images)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-gray-500 hover:text-gray-700 text-sm">
            ← 一覧
          </Link>
          <div className="flex-1 flex items-center gap-3 min-w-0">
            <span className="text-xs text-gray-400 font-mono shrink-0">{event.event_code}</span>
            <h1 className="text-lg font-bold text-gray-800 truncate">{event.name}</h1>
            <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded ${CATEGORY_COLOR[event.category_id] ?? 'bg-gray-100 text-gray-600'}`}>
              {CATEGORY_LABEL[event.category_id] ?? event.category_id}
            </span>
          </div>
          <button
            onClick={handleDeleteEvent}
            className="text-xs text-red-400 hover:text-red-600 whitespace-nowrap"
          >
            削除
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* 検索キーワード */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">検索キーワード</h2>
            <div className="flex gap-2">
              <button
                onClick={generateKeywords}
                disabled={generatingKeywords}
                className="text-xs px-2.5 py-1 bg-teal-50 text-teal-600 rounded-lg hover:bg-teal-100 disabled:opacity-50"
              >
                {generatingKeywords ? '生成中…' : 'AI再生成'}
              </button>
              {!editingKeywords && (
                <button
                  onClick={() => setEditingKeywords(true)}
                  className="text-xs px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
                >
                  編集
                </button>
              )}
            </div>
          </div>
          {editingKeywords ? (
            <div className="space-y-2">
              <textarea
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => saveField('keywords', keywords)}
                  disabled={saving === 'keywords'}
                  className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving === 'keywords' ? '保存中…' : '保存'}
                </button>
                <button
                  onClick={() => { setKeywords(event.keywords ?? ''); setEditingKeywords(false) }}
                  className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
                >
                  キャンセル
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-600 whitespace-pre-wrap">
              {event.keywords || <span className="text-gray-400">（未設定）</span>}
            </p>
          )}
        </section>

        {/* メモ */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">メモ</h2>
            {!editingMemo && (
              <button
                onClick={() => setEditingMemo(true)}
                className="text-xs px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
              >
                編集
              </button>
            )}
          </div>
          {editingMemo ? (
            <div className="space-y-2">
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                rows={5}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => saveField('memo', memo)}
                  disabled={saving === 'memo'}
                  className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving === 'memo' ? '保存中…' : '保存'}
                </button>
                <button
                  onClick={() => { setMemo(event.memo ?? ''); setEditingMemo(false) }}
                  className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
                >
                  キャンセル
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-600 whitespace-pre-wrap">
              {event.memo || <span className="text-gray-400">（未記入）</span>}
            </p>
          )}
        </section>

        {/* 画像 */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">
              画像
              {images.length > 0 && <span className="ml-2 text-gray-400 font-normal">{images.length}枚</span>}
            </h2>
            <Link
              href={`/upload?eventId=${id}&eventName=${encodeURIComponent(event.name)}`}
              className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              + 画像をアップロード
            </Link>
          </div>

          {images.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">画像が登録されていません</p>
          ) : (
            <div className="space-y-6">
              {pairs.map(({ original, thumbnail }) => (
                <div key={original.id} className="grid grid-cols-2 gap-4 pb-6 border-b border-gray-100 last:border-0 last:pb-0">
                  {/* Original */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">オリジナル</p>
                    <ImageThumb
                      img={original}
                      onDelete={handleDeleteImage}
                      showCreate={!thumbnail}
                      onCreated600x400={handleCreated600x400}
                    />
                  </div>
                  {/* 600×400 */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">600×400</p>
                    {thumbnail ? (
                      <ImageThumb img={thumbnail} onDelete={handleDeleteImage} />
                    ) : (
                      <div className="w-full aspect-[3/2] bg-gray-50 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center">
                        <p className="text-xs text-gray-400">未作成</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Orphan thumbnails (600×400 without matching original) */}
              {orphanThumbs.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-3">600×400のみ</p>
                  <div className="grid grid-cols-3 gap-4">
                    {orphanThumbs.map((img) => (
                      <ImageThumb key={img.id} img={img} onDelete={handleDeleteImage} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
