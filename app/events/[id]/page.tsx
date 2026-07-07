'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import BackButton from '@/components/BackButton'
import CenterPopup from '@/components/CenterPopup'
import type { Event, ImageRecord } from '@/lib/supabase'
import { REGIONS } from '@/lib/regions'

const CATEGORY_LABEL: Record<string, string> = { '01': '取材', '02': '来店' }
const CATEGORY_COLOR: Record<string, string> = {
  '01': 'bg-black text-cyan-300 border border-cyan-400/70',
  '02': 'bg-black text-fuchsia-300 border border-fuchsia-400/70',
}
const CATEGORY_CODE_COLOR: Record<string, string> = {
  '01': 'text-cyan-300',
  '02': 'text-fuchsia-300',
}
const CATEGORY_SECTION_BORDER: Record<string, string> = {
  '01': 'border-cyan-400/50 shadow-[0_0_16px_rgba(34,211,238,0.08)]',
  '02': 'border-fuchsia-400/50 shadow-[0_0_16px_rgba(217,70,239,0.08)]',
}

function sameRegionIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const bSet = new Set(b)
  return a.every((id) => bSet.has(id))
}

// このイベント内に、対象画像と同じベース名の600×400画像が既に存在するか（重複作成の確認用の簡易チェック）
function hasSiblingThumbnail(img: ImageRecord, allImages: ImageRecord[]): boolean {
  const base = (img.file_name ?? '').replace(/\.[^.]+$/, '')
  if (!base) return false
  return allImages.some(
    (i) => i.id !== img.id && i.image_type === '600x400' && (i.file_name ?? '').startsWith(`${base}_600x400`)
  )
}

function ImageThumb({
  img,
  onDelete,
  onUnlink,
  onCreated600x400,
  onRenamed,
  hasSiblingThumbnail,
}: {
  img: ImageRecord
  onDelete: (id: string) => void
  onUnlink: (id: string) => void
  onCreated600x400?: (newImg: ImageRecord) => void
  onRenamed: (id: string, fileName: string) => void
  hasSiblingThumbnail?: boolean
}) {
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [unlinking, setUnlinking] = useState(false)
  const [wpUploading, setWpUploading] = useState(false)
  const [wpDone, setWpDone] = useState(false)
  const [copied, setCopied] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(img.file_name ?? '')
  const [savingName, setSavingName] = useState(false)

  const isAlready600x400 = img.image_width === 600 && img.image_height === 400

  const sizeLabel =
    img.image_width && img.image_height
      ? `${img.image_width}×${img.image_height}`
      : '---'

  const handleCreate = async () => {
    if (hasSiblingThumbnail && !confirm('すでに600×400画像があります。新たに作成しますか？')) return
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
    if (!isAlready600x400 && !confirm('注意！600×400サイズではありません。アップロードしていいですか？')) return
    if (!confirm('ファイル名の先頭に image_ を付けてアップロードします。よろしいですか？')) return
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

  const startEditName = () => {
    setNameValue(img.file_name ?? '')
    setEditingName(true)
  }

  const handleSaveName = async () => {
    const trimmed = nameValue.trim()
    if (!trimmed || trimmed === img.file_name) {
      setEditingName(false)
      setNameValue(img.file_name ?? '')
      return
    }
    setSavingName(true)
    try {
      const res = await fetch(`/api/images/${img.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_name: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '変更に失敗しました')
      onRenamed(img.id, trimmed)
      setEditingName(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : '変更に失敗しました')
      setNameValue(img.file_name ?? '')
    } finally {
      setSavingName(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="inline-block text-xs font-bold text-cyan-300 bg-cyan-400/10 border border-cyan-400/30 rounded px-1.5 py-0.5">{sizeLabel}</p>
      <div className="relative w-full aspect-[3/2] bg-zinc-900 rounded-lg overflow-hidden border border-zinc-700">
        {img.r2_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img.r2_url} alt={img.file_name ?? ''} draggable={false} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-700">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" />
            </svg>
          </div>
        )}
      </div>
      {editingName ? (
        <input
          value={nameValue}
          onChange={(e) => setNameValue(e.target.value)}
          onBlur={handleSaveName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              setNameValue(img.file_name ?? '')
              setEditingName(false)
            }
          }}
          disabled={savingName}
          autoFocus
          className="w-full text-xs text-zinc-100 bg-black border border-cyan-400 rounded px-1 py-0.5 focus:outline-none focus:shadow-[0_0_8px_rgba(34,211,238,0.5)]"
        />
      ) : (
        <p
          onClick={startEditName}
          title="クリックしてファイル名を変更"
          className="text-xs font-medium text-zinc-200 truncate cursor-pointer hover:text-cyan-300 hover:underline"
        >
          {img.file_name}
        </p>
      )}
      {img.r2_url && (
        <p className="text-xs text-zinc-400 truncate font-mono" title={img.r2_url}>{img.r2_url}</p>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        <a
          href={`/api/images/${img.id}/download`}
          download={img.file_name ?? undefined}
          className="text-center text-xs py-1.5 bg-black text-cyan-300 border border-cyan-400/70 font-medium rounded-lg shadow-[0_0_8px_rgba(34,211,238,0.35)] hover:bg-cyan-400 hover:text-black hover:shadow-[0_0_14px_rgba(34,211,238,0.8)] transition-all"
        >
          DL
        </a>
        <button
          onClick={handleCreate}
          disabled={isAlready600x400 || creating}
          className={
            isAlready600x400
              ? 'text-xs py-1.5 bg-zinc-900 text-zinc-600 border border-zinc-800 rounded-lg cursor-not-allowed'
              : 'text-xs py-1.5 bg-black text-teal-300 border border-teal-400/70 font-medium rounded-lg shadow-[0_0_8px_rgba(45,212,191,0.35)] hover:bg-teal-400 hover:text-black hover:shadow-[0_0_14px_rgba(45,212,191,0.8)] disabled:opacity-50 transition-all'
          }
        >
          {creating ? '作成中…' : '600×400作成'}
        </button>
        <button
          onClick={handleCopyUrl}
          disabled={!img.r2_url}
          className="text-xs py-1.5 bg-black text-zinc-300 border border-zinc-500/70 font-medium rounded-lg hover:bg-zinc-200 hover:text-black hover:shadow-[0_0_14px_rgba(212,212,216,0.5)] disabled:opacity-40 transition-all"
        >
          {copied ? 'コピー済！' : 'URLコピー'}
        </button>
        <button
          onClick={handleWpUpload}
          disabled={wpUploading}
          className="text-xs py-1.5 bg-black text-violet-300 border border-violet-400/70 font-medium rounded-lg shadow-[0_0_8px_rgba(167,139,250,0.35)] hover:bg-violet-400 hover:text-black hover:shadow-[0_0_14px_rgba(167,139,250,0.8)] disabled:opacity-50 transition-all"
        >
          {wpUploading ? '登録中…' : wpDone ? 'WP登録済' : 'WP登録'}
        </button>
        <button
          onClick={handleUnlink}
          disabled={unlinking}
          className="text-xs py-1.5 bg-black text-amber-300 border border-amber-400/70 font-medium rounded-lg shadow-[0_0_8px_rgba(251,191,36,0.35)] hover:bg-amber-400 hover:text-black hover:shadow-[0_0_14px_rgba(251,191,36,0.8)] disabled:opacity-50 transition-all"
        >
          {unlinking ? '…' : '紐付け解除'}
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-xs py-1.5 bg-black text-rose-300 border border-rose-400/70 font-medium rounded-lg shadow-[0_0_8px_rgba(251,113,133,0.35)] hover:bg-rose-400 hover:text-black hover:shadow-[0_0_14px_rgba(251,113,133,0.8)] disabled:opacity-50 transition-all"
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
  const [regionIds, setRegionIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [showSavedPopup, setShowSavedPopup] = useState(false)
  const [generatingKeywords, setGeneratingKeywords] = useState(false)

  // Unlinked image picker
  const [showPicker, setShowPicker] = useState(false)
  const [unlinkedImages, setUnlinkedImages] = useState<ImageRecord[]>([])
  const [loadingUnlinked, setLoadingUnlinked] = useState(false)
  const [linkingImageId, setLinkingImageId] = useState<string | null>(null)
  const [pickerSearch, setPickerSearch] = useState('')

  // 画像の並び替え（ドラッグ&ドロップ）
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

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
      setRegionIds(data.event.region_ids ?? [])
    } finally {
      setIsLoading(false)
    }
  }, [id])

  useEffect(() => { fetchEvent() }, [fetchEvent])

  const isDirty = event !== null && (
    nameValue.trim() !== (event.name ?? '') ||
    keywords !== (event.keywords ?? '') ||
    memo !== (event.memo ?? '') ||
    categoryId !== (event.category_id ?? '') ||
    !sameRegionIds(regionIds, event.region_ids ?? [])
  )

  const toggleRegion = (regionId: string) => {
    setRegionIds((prev) =>
      prev.includes(regionId) ? prev.filter((r) => r !== regionId) : [...prev, regionId]
    )
  }

  const handleSave = async () => {
    if (!event || !isDirty) return
    setSaving(true)
    try {
      const body: Record<string, unknown> = {}
      if (nameValue.trim() !== event.name) body.name = nameValue.trim()
      if (keywords !== (event.keywords ?? '')) body.keywords = keywords
      if (memo !== (event.memo ?? '')) body.memo = memo
      if (categoryId !== event.category_id) body.category_id = categoryId
      if (!sameRegionIds(regionIds, event.region_ids ?? [])) body.region_ids = regionIds

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
        region_ids: ('region_ids' in body ? regionIds : prev.region_ids),
      } : prev)
      setShowSavedPopup(true)
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
    setRegionIds(event.region_ids ?? [])
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

  const handleRenamedImage = (imageId: string, fileName: string) => {
    setImages((prev) => prev.map((i) => (i.id === imageId ? { ...i, file_name: fileName } : i)))
  }

  const persistImageOrder = async (orderedIds: string[]) => {
    try {
      const res = await fetch(`/api/events/${id}/images/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds }),
      })
      if (!res.ok) throw new Error('並び替えに失敗しました')
    } catch (err) {
      alert(err instanceof Error ? err.message : '並び替えに失敗しました')
      await refreshImages()
    }
  }

  const handleImageDrop = (targetId: string) => {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null)
      setDragOverId(null)
      return
    }
    setImages((prev) => {
      const fromIndex = prev.findIndex((i) => i.id === draggedId)
      const toIndex = prev.findIndex((i) => i.id === targetId)
      if (fromIndex === -1 || toIndex === -1) return prev
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      persistImageOrder(next.map((i) => i.id))
      return next
    })
    setDraggedId(null)
    setDragOverId(null)
  }

  const handleDeleteEvent = async () => {
    if (!confirm(`「${event?.name}」を削除しますか？\n（紐づいている画像はイベント未設定になります）`)) return
    const res = await fetch(`/api/events/${id}`, { method: 'DELETE' })
    if (res.ok) router.push('/')
    else alert('削除に失敗しました')
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin shadow-[0_0_12px_rgba(34,211,238,0.6)]" />
      </div>
    )
  }

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-zinc-500">イベントが見つかりません</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <header className="bg-black/70 backdrop-blur border-b border-cyan-400/40">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <BackButton />
          <button
            onClick={handleDeleteEvent}
            className="text-xs text-rose-400/70 hover:text-rose-300 whitespace-nowrap transition-colors"
          >
            イベント削除
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 pb-28 space-y-6">

        {/* イベント情報 */}
        <section className={`bg-zinc-950 rounded-2xl border p-4 transition-colors ${CATEGORY_SECTION_BORDER[categoryId] ?? 'border-zinc-700'}`}>
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`text-xs font-mono shrink-0 ${CATEGORY_CODE_COLOR[categoryId] ?? 'text-zinc-400'}`}>{event.event_code}</span>
            <input
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              className="flex-1 min-w-0 bg-zinc-900 border border-zinc-600 rounded-lg px-2 py-1 text-base font-bold text-zinc-100 focus:outline-none focus:border-cyan-400 focus:shadow-[0_0_10px_rgba(34,211,238,0.35)]"
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
                    className="accent-cyan-400"
                  />
                  <span className="text-sm text-zinc-300">{CATEGORY_LABEL[cid]}</span>
                </label>
              ))}
            </div>
          </div>
        </section>

        {/* 地方 */}
        <section className="bg-zinc-950 rounded-2xl border border-cyan-400/50 shadow-[0_0_16px_rgba(34,211,238,0.08)] p-5">
          <h2 className="text-sm font-semibold text-zinc-300 mb-3">地方</h2>
          <div className="flex items-center flex-wrap gap-x-4 gap-y-2">
            {REGIONS.map(({ id: regionId, label }) => (
              <label key={regionId} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={regionIds.includes(regionId)}
                  onChange={() => toggleRegion(regionId)}
                  className="accent-cyan-400"
                />
                <span className="text-sm text-zinc-200">{label}</span>
              </label>
            ))}
            <button
              type="button"
              onClick={() => setRegionIds([])}
              disabled={regionIds.length === 0}
              className="text-xs px-2.5 py-1 bg-black text-zinc-400 border border-zinc-600 rounded-lg hover:border-rose-400 hover:text-rose-300 disabled:opacity-40 disabled:hover:border-zinc-600 disabled:hover:text-zinc-400 transition-all"
            >
              全て外す
            </button>
          </div>
        </section>

        {/* 検索キーワード */}
        <section className="bg-zinc-950 rounded-2xl border border-cyan-400/50 shadow-[0_0_16px_rgba(34,211,238,0.08)] p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-zinc-300">検索キーワード</h2>
            <button
              onClick={generateKeywords}
              disabled={generatingKeywords}
              className="text-xs px-2.5 py-1 bg-black text-teal-300 border border-teal-400/70 rounded-lg hover:bg-teal-400 hover:text-black hover:shadow-[0_0_10px_rgba(45,212,191,0.6)] disabled:opacity-50 transition-all"
            >
              {generatingKeywords ? '生成中…' : 'AI再生成'}
            </button>
          </div>
          <textarea
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            rows={3}
            placeholder="（未設定）"
            className="w-full bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-cyan-400 focus:shadow-[0_0_10px_rgba(34,211,238,0.35)] resize-none"
          />
        </section>

        {/* メモ */}
        <section className="bg-zinc-950 rounded-2xl border border-cyan-400/50 shadow-[0_0_16px_rgba(34,211,238,0.08)] p-5">
          <h2 className="text-sm font-semibold text-zinc-300 mb-3">メモ</h2>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={5}
            placeholder="（未記入）"
            className="w-full bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-cyan-400 focus:shadow-[0_0_10px_rgba(34,211,238,0.35)] resize-none"
          />
        </section>

        {/* 画像 */}
        <section className="bg-zinc-950 rounded-2xl border border-cyan-400/50 shadow-[0_0_16px_rgba(34,211,238,0.08)] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-zinc-300">
              画像
              {images.length > 0 && <span className="ml-2 text-cyan-300 font-bold">{images.length}枚</span>}
            </h2>
            <div className="flex items-center gap-2">
              <Link
                href={`/upload?eventId=${id}&eventName=${encodeURIComponent(event.name)}`}
                className="text-xs px-2.5 py-1.5 bg-black text-zinc-300 border border-zinc-600 rounded-lg hover:border-cyan-400 hover:text-cyan-300 transition-all"
              >
                アップロード
              </Link>
              <button
                onClick={showPicker ? () => { setShowPicker(false); setPickerSearch('') } : openPicker}
                className={
                  showPicker
                    ? 'text-xs px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 border border-zinc-600 hover:bg-zinc-700 transition-all'
                    : 'text-xs px-3 py-1.5 rounded-lg bg-black text-cyan-300 border border-cyan-400/70 shadow-[0_0_8px_rgba(34,211,238,0.4)] hover:bg-cyan-400 hover:text-black hover:shadow-[0_0_14px_rgba(34,211,238,0.8)] transition-all'
                }
              >
                {showPicker ? '閉じる' : '未設定画像から登録'}
              </button>
            </div>
          </div>

          {images.length === 0 ? (
            <p className="text-sm text-zinc-600 py-6 text-center">画像が登録されていません</p>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {images.map((img) => (
                <div
                  key={img.id}
                  draggable
                  onDragStart={(e) => {
                    setDraggedId(img.id)
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', img.id)
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    if (dragOverId !== img.id) setDragOverId(img.id)
                  }}
                  onDragLeave={() => setDragOverId((prev) => (prev === img.id ? null : prev))}
                  onDrop={(e) => {
                    e.preventDefault()
                    handleImageDrop(img.id)
                  }}
                  onDragEnd={() => { setDraggedId(null); setDragOverId(null) }}
                  className={`cursor-grab active:cursor-grabbing rounded-xl transition-all ${
                    draggedId === img.id ? 'opacity-40' : ''
                  } ${
                    dragOverId === img.id && draggedId !== img.id
                      ? 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-zinc-950'
                      : ''
                  }`}
                >
                  <ImageThumb
                    img={img}
                    onDelete={handleDeleteImage}
                    onUnlink={handleUnlinkImage}
                    onCreated600x400={handleCreated600x400}
                    onRenamed={handleRenamedImage}
                    hasSiblingThumbnail={hasSiblingThumbnail(img, images)}
                  />
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
              <div className="mt-6 pt-6 border-t border-zinc-800">
                <div className="flex items-center gap-3 mb-3">
                  <p className="text-xs font-semibold text-zinc-400 shrink-0">
                    未設定画像から選択
                    {!loadingUnlinked && (
                      <span className="ml-2 text-zinc-500 font-normal">{filtered.length} 件</span>
                    )}
                  </p>
                  {!loadingUnlinked && (
                    <input
                      value={pickerSearch}
                      onChange={(e) => setPickerSearch(e.target.value)}
                      placeholder="ファイル名で絞り込み…"
                      className="flex-1 bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:border-cyan-400 focus:shadow-[0_0_10px_rgba(34,211,238,0.35)]"
                    />
                  )}
                </div>
                {loadingUnlinked ? (
                  <div className="flex justify-center py-10">
                    <div className="w-6 h-6 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin shadow-[0_0_12px_rgba(34,211,238,0.6)]" />
                  </div>
                ) : pickerImages.length === 0 ? (
                  <p className="text-sm text-zinc-600 text-center py-8">未設定の画像はありません</p>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    {filtered.map((img) => (
                      <div key={img.id} className="space-y-1.5">
                        <div className="w-full aspect-[3/2] bg-zinc-900 rounded-lg overflow-hidden border border-zinc-700">
                          {img.r2_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={img.r2_url} alt={img.file_name ?? ''} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-700">
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" />
                              </svg>
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 truncate">{img.file_name}</p>
                        <button
                          onClick={() => handleLinkUnlinkedImage(img)}
                          disabled={linkingImageId === img.id}
                          className="w-full text-xs py-1.5 bg-black text-cyan-300 border border-cyan-400/70 rounded-lg hover:bg-cyan-400 hover:text-black hover:shadow-[0_0_10px_rgba(34,211,238,0.6)] disabled:opacity-50 transition-all"
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
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-black border-t border-cyan-400/60 shadow-[0_0_30px_rgba(34,211,238,0.3)]">
          <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
            <p className="text-sm text-amber-300 font-semibold">⚠ 未保存の変更があります</p>
            <div className="flex gap-3">
              <button
                onClick={handleReset}
                disabled={saving}
                className="text-sm px-4 py-2 text-zinc-400 hover:text-white disabled:opacity-40 transition-colors"
              >
                変更を破棄
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="text-sm px-8 py-2.5 bg-black text-cyan-300 border border-cyan-400 rounded-lg hover:bg-cyan-400 hover:text-black disabled:opacity-50 font-bold shadow-[0_0_18px_rgba(34,211,238,0.6)] hover:shadow-[0_0_28px_rgba(34,211,238,0.9)] transition-all"
              >
                {saving ? '保存中…' : '保存する'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSavedPopup && (
        <CenterPopup message="保存しました" onDismiss={() => setShowSavedPopup(false)} />
      )}
    </div>
  )
}
