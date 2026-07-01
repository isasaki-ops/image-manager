'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import BackButton from '@/components/BackButton'
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
  onUnlink,
  onCreated600x400,
  isThumbnail,
  hasThumbnail,
}: {
  img: ImageRecord
  onDelete: (id: string) => void
  onUnlink: (id: string) => void
  onCreated600x400?: (newImg: ImageRecord) => void
  isThumbnail?: boolean
  hasThumbnail?: boolean
}) {
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [unlinking, setUnlinking] = useState(false)
  const [wpUploading, setWpUploading] = useState(false)
  const [wpDone, setWpDone] = useState(false)
  const [copied, setCopied] = useState(false)

  const isAlready600x400 = img.image_width === 600 && img.image_height === 400

  const sizeLabel =
    img.image_width && img.image_height
      ? `${img.image_width}×${img.image_height}`
      : '---'

  const handleCreate = async () => {
    if (hasThumbnail && !confirm('すでに600×400画像があります。新たに作成しますか？')) return
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
    if (!confirm(`「${img.file_name ?? img.id}」を削除しますか？\n元に戻せません。`)) return
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

  const handleUnlink = async () => {
    if (!confirm(`「${img.file_name ?? img.id}」のイベント紐づけを解除しますか？\n画像は削除されず未設定画像に移動します。`)) return
    setUnlinking(true)
    try {
      const res = await fetch(`/api/images/${img.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: null }),
      })
      if (!res.ok) throw new Error('解除に失敗しました')
      onUnlink(img.id)
    } catch (err) {
      alert(err instanceof Error ? err.message : '紐づけ解除に失敗しました')
      setUnlinking(false)
    }
  }

  const handleWpUpload = async () => {
    if (wpDone && !confirm('すでにWPに登録済みです。再アップロードしますか？')) return
    setWpUploading(true)
    try {
      const res = await fetch(`/api/images/${img.id}/wp-upload`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'WP登録に失敗しました')
      setWpDone(true)
      alert(`WP登録完了\n${data.wp_url}`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'WP登録に失敗しました')
    } finally {
      setWpUploading(false)
    }
  }

  const handleCopyUrl = () => {
    if (!img.r2_url) return
    navigator.clipboard.writeText(img.r2_url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-1.5">
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
      {img.r2_url && (
        <p className="text-xs text-gray-300 truncate font-mono" title={img.r2_url}>{img.r2_url}</p>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        <a
          href={`/api/images/${img.id}/download`}
          download={img.file_name ?? undefined}
          className="text-center text-xs py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
        >
          DL
        </a>
        <button
          onClick={handleCreate}
          disabled={isThumbnail || isAlready600x400 || creating}
          className={
            isThumbnail || isAlready600x400
              ? 'text-xs py-1.5 bg-gray-100 text-gray-400 rounded-lg cursor-not-allowed'
              : 'text-xs py-1.5 bg-teal-50 text-teal-600 rounded-lg hover:bg-teal-100 disabled:opacity-50 transition-colors'
          }
        >
          {creating ? '作成中…' : '600×400作成'}
        </button>
        <button
          onClick={handleCopyUrl}
          disabled={!img.r2_url}
          className="text-xs py-1.5 bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100 disabled:opacity-40 transition-colors"
        >
          {copied ? 'コピー済！' : 'URLコピー'}
        </button>
        <button
          onClick={handleWpUpload}
          disabled={wpUploading}
          className="text-xs py-1.5 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 disabled:opacity-50 transition-colors"
        >
          {wpUploading ? '登録中…' : wpDone ? 'WP登録済' : 'WP登録'}
        </button>
        <button
          onClick={handleUnlink}
          disabled={unlinking}
          className="text-xs py-1.5 bg-orange-50 text-orange-500 rounded-lg hover:bg-orange-100 disabled:opacity-50 transition-colors"
        >
          {unlinking ? '…' : '紐付け解除'}
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-xs py-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
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
  const [nameValue, setNameValue] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [keywords, setKeywords] = useState('')
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)
  const [generatingKeywords, setGeneratingKeywords] = useState(false)

  // Unlinked image picker
  const [showPicker, setShowPicker] = useState(false)
  const [unlinkedImages, setUnlinkedImages] = useState<ImageRecord[]>([])
  const [loadingUnlinked, setLoadingUnlinked] = useState(false)
  const [linkingImageId, setLinkingImageId] = useState<string | null>(null)
  const [pickerSearch, setPickerSearch] = useState('')

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
      setCategoryId(data.event.category_id ?? '')
      setNameValue(data.event.name ?? '')
    } finally {
      setIsLoading(false)
    }
  }, [id])

  useEffect(() => { fetchEvent() }, [fetchEvent])

  const isDirty = event !== null && (
    nameValue.trim() !== (event.name ?? '') ||
    keywords !== (event.keywords ?? '') ||
    memo !== (event.memo ?? '') ||
    categoryId !== (event.category_id ?? '')
  )

  const handleSave = async () => {
    if (!event || !isDirty) return
    setSaving(true)
    try {
      const body: Record<string, unknown> = {}
      if (nameValue.trim() !== event.name) body.name = nameValue.trim()
      if (keywords !== (event.keywords ?? '')) body.keywords = keywords
      if (memo !== (event.memo ?? '')) body.memo = memo
      if (categoryId !== event.category_id) body.category_id = categoryId

      const res = await fetch(`/api/events/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('保存に失敗しました')

      setEvent((prev) => prev ? {
        ...prev,
        name: 'name' in body ? (nameValue.trim() || prev.name) : prev.name,
        keywords: 'keywords' in body ? (keywords.trim() || null) : prev.keywords,
        memo: 'memo' in body ? (memo.trim() || null) : prev.memo,
        category_id: ('category_id' in body ? categoryId : prev.category_id) as '01' | '02',
      } : prev)
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    if (!event) return
    setNameValue(event.name ?? '')
    setKeywords(event.keywords ?? '')
    setMemo(event.memo ?? '')
    setCategoryId(event.category_id ?? '')
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

  const refreshImages = useCallback(async () => {
    const res = await fetch(`/api/events/${id}`)
    const data = await res.json()
    if (res.ok) setImages(data.images ?? [])
  }, [id])

  const openPicker = async () => {
    setShowPicker(true)
    setLoadingUnlinked(true)
    try {
      const res = await fetch('/api/images/unlinked')
      const data = await res.json()
      setUnlinkedImages(data.images ?? [])
    } finally {
      setLoadingUnlinked(false)
    }
  }

  const handleLinkUnlinkedImage = async (img: ImageRecord) => {
    setLinkingImageId(img.id)
    try {
      const res = await fetch(`/api/images/${img.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: id }),
      })
      if (!res.ok) throw new Error('登録に失敗しました')

      const fileName = img.file_name ?? ''
      const isThumb = fileName.includes('_600x400')
      const pairName = isThumb
        ? fileName.replace('_600x400', '')
        : (() => {
            const ext = fileName.includes('.') ? '.' + fileName.split('.').pop() : ''
            return fileName.replace(ext, '') + '_600x400.jpg'
          })()
      setUnlinkedImages((prev) => prev.filter((i) => i.id !== img.id && i.file_name !== pairName))

      await refreshImages()
    } catch (err) {
      alert(err instanceof Error ? err.message : '登録に失敗しました')
    } finally {
      setLinkingImageId(null)
    }
  }

  const handleDeleteImage = (imageId: string) => {
    setImages((prev) => prev.filter((i) => i.id !== imageId))
  }

  const handleUnlinkImage = (imageId: string) => {
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
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <BackButton />
          <button
            onClick={handleDeleteEvent}
            className="text-xs text-red-400 hover:text-red-600 whitespace-nowrap"
          >
            イベント削除
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 pb-28 space-y-6">

        {/* イベント情報 */}
        <section className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-gray-400 font-mono shrink-0">{event.event_code}</span>
            <input
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1 text-base font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400"
            />
            <div className="flex items-center gap-3 shrink-0">
              {(['01', '02'] as const).map((cid) => (
                <label key={cid} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="category"
                    value={cid}
                    checked={categoryId === cid}
                    onChange={() => setCategoryId(cid)}
                    className="accent-blue-600"
                  />
                  <span className="text-sm text-gray-700">{CATEGORY_LABEL[cid]}</span>
                </label>
              ))}
            </div>
          </div>
        </section>

        {/* 検索キーワード */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">検索キーワード</h2>
            <button
              onClick={generateKeywords}
              disabled={generatingKeywords}
              className="text-xs px-2.5 py-1 bg-teal-50 text-teal-600 rounded-lg hover:bg-teal-100 disabled:opacity-50"
            >
              {generatingKeywords ? '生成中…' : 'AI再生成'}
            </button>
          </div>
          <textarea
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            rows={3}
            placeholder="（未設定）"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 resize-none"
          />
        </section>

        {/* メモ */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">メモ</h2>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={5}
            placeholder="（未記入）"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 resize-none"
          />
        </section>

        {/* 画像 */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">
              画像
              {images.length > 0 && <span className="ml-2 text-gray-400 font-normal">{images.length}枚</span>}
            </h2>
            <div className="flex items-center gap-2">
              <Link
                href={`/upload?eventId=${id}&eventName=${encodeURIComponent(event.name)}`}
                className="text-xs px-2.5 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
              >
                アップロード
              </Link>
              <button
                onClick={showPicker ? () => { setShowPicker(false); setPickerSearch('') } : openPicker}
                className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                  showPicker
                    ? 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {showPicker ? '閉じる' : '未設定画像から登録'}
              </button>
            </div>
          </div>

          {images.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">画像が登録されていません</p>
          ) : (
            <div className="space-y-6">
              {pairs.map(({ original, thumbnail }) => (
                <div key={original.id} className="grid grid-cols-2 gap-4 pb-6 border-b border-gray-100 last:border-0 last:pb-0">
                  <ImageThumb
                    img={original}
                    onDelete={handleDeleteImage}
                    onUnlink={handleUnlinkImage}
                    onCreated600x400={handleCreated600x400}
                    hasThumbnail={!!thumbnail}
                  />
                  {thumbnail && (
                    <ImageThumb img={thumbnail} onDelete={handleDeleteImage} onUnlink={handleUnlinkImage} isThumbnail />
                  )}
                </div>
              ))}

              {/* Orphan thumbnails (600×400 without matching original) */}
              {orphanThumbs.map((img) => (
                <div key={img.id} className="grid grid-cols-2 gap-4 pb-6 border-b border-gray-100 last:border-0 last:pb-0">
                  <ImageThumb img={img} onDelete={handleDeleteImage} onUnlink={handleUnlinkImage} isThumbnail />
                  <div />
                </div>
              ))}
            </div>
          )}

          {/* Unlinked image picker */}
          {showPicker && (() => {
            // Show originals + 600x400 images that have no matching original in the unlinked list
            const originalNames = new Set(
              unlinkedImages
                .filter((i) => i.image_type === 'original')
                .map((i) => i.file_name ?? '')
            )
            const pickerImages = unlinkedImages.filter((i) => {
              if (i.image_type === 'original') return true
              const originalName = (i.file_name ?? '').replace('_600x400', '')
              return !originalNames.has(originalName)
            })
            const filtered = pickerImages.filter(
              (i) => !pickerSearch || (i.file_name ?? '').toLowerCase().includes(pickerSearch.toLowerCase())
            )
            return (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="flex items-center gap-3 mb-3">
                  <p className="text-xs font-semibold text-gray-600 shrink-0">
                    未設定画像から選択
                    {!loadingUnlinked && (
                      <span className="ml-2 text-gray-400 font-normal">{filtered.length} 件</span>
                    )}
                  </p>
                  {!loadingUnlinked && (
                    <input
                      value={pickerSearch}
                      onChange={(e) => setPickerSearch(e.target.value)}
                      placeholder="ファイル名で絞り込み…"
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}
                </div>
                {loadingUnlinked ? (
                  <div className="flex justify-center py-10">
                    <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : pickerImages.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">未設定の画像はありません</p>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    {filtered.map((img) => (
                      <div key={img.id} className="space-y-1.5">
                        <div className="w-full aspect-[3/2] bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
                          {img.r2_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={img.r2_url} alt={img.file_name ?? ''} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-300">
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" />
                              </svg>
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 truncate">{img.file_name}</p>
                        <button
                          onClick={() => handleLinkUnlinkedImage(img)}
                          disabled={linkingImageId === img.id}
                          className="w-full text-xs py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors"
                        >
                          {linkingImageId === img.id ? '登録中…' : '登録'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })()}
        </section>
      </main>

      {/* スティッキー保存バー */}
      {isDirty && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 shadow-2xl">
          <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
            <p className="text-sm text-amber-400 font-semibold">⚠ 未保存の変更があります</p>
            <div className="flex gap-3">
              <button
                onClick={handleReset}
                disabled={saving}
                className="text-sm px-4 py-2 text-gray-400 hover:text-white disabled:opacity-40 transition-colors"
              >
                変更を破棄
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="text-sm px-8 py-2.5 bg-green-500 text-white rounded-lg hover:bg-green-400 disabled:opacity-50 font-bold shadow-lg shadow-green-900/40 transition-colors"
              >
                {saving ? '保存中…' : '保存する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
