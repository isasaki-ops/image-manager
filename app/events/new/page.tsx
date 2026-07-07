'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import BackButton from '@/components/BackButton'
import CenterPopup from '@/components/CenterPopup'
import { REGIONS } from '@/lib/regions'

export default function NewEventPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState<'01' | '02'>('01')
  const [keywords, setKeywords] = useState('')
  const [memo, setMemo] = useState('')
  const [regionIds, setRegionIds] = useState<string[]>([])

  const toggleRegion = (id: string) => {
    setRegionIds((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    )
  }
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setIsSubmitting(true)
    setError('')

    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          category_id: categoryId,
          keywords: keywords.trim() || undefined,
          memo: memo.trim() || undefined,
          region_ids: regionIds,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create event')

      setIsDone(true)
      setTimeout(() => router.push('/'), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen">
      <header className="bg-black/70 backdrop-blur border-b border-cyan-400/40">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <BackButton />
          <h1 className="text-lg font-bold text-white [text-shadow:0_0_6px_#22d3ee,0_0_16px_rgba(34,211,238,0.5)]">イベント登録</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <form onSubmit={handleSubmit} className="bg-zinc-950 rounded-2xl border border-cyan-400/50 shadow-[0_0_20px_rgba(34,211,238,0.08)] p-6 space-y-5">

          {/* カテゴリ */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">カテゴリ</label>
            <div className="flex gap-4">
              {([['01', '取材'], ['02', '来店']] as const).map(([val, label]) => (
                <label key={val} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="category"
                    value={val}
                    checked={categoryId === val}
                    onChange={() => setCategoryId(val)}
                    className="accent-cyan-400"
                  />
                  <span className="text-sm text-zinc-200">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 地方 */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">地方</label>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {REGIONS.map(({ id, label }) => (
                <label key={id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={regionIds.includes(id)}
                    onChange={() => toggleRegion(id)}
                    className="accent-cyan-400"
                  />
                  <span className="text-sm text-zinc-200">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* イベント名 */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              イベント名 <span className="text-fuchsia-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：天下無双、バズーカ、梅屋シン来店"
              className="w-full bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-cyan-400 focus:shadow-[0_0_10px_rgba(34,211,238,0.35)]"
              required
            />
          </div>

          {/* 検索キーワード */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">
              検索キーワード
              <span className="text-xs text-zinc-500 ml-2">（検索文字をスペースで区切って入れてください。空欄の場合はAIが自動生成します）</span>
            </label>
            <textarea
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              rows={3}
              placeholder="てんかむそう てんか むそう…"
              className="w-full bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-cyan-400 focus:shadow-[0_0_10px_rgba(34,211,238,0.35)] resize-none"
            />
          </div>

          {/* メモ */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">メモ</label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={4}
              placeholder="自由記入"
              className="w-full bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-cyan-400 focus:shadow-[0_0_10px_rgba(34,211,238,0.35)] resize-none"
            />
          </div>

          {error && <p className="text-rose-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={!name.trim() || isSubmitting || isDone}
            className="w-full py-2.5 bg-black text-cyan-300 border border-cyan-400 rounded-lg font-bold shadow-[0_0_16px_rgba(34,211,238,0.5)] hover:bg-cyan-400 hover:text-black hover:shadow-[0_0_26px_rgba(34,211,238,0.85)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-black disabled:hover:text-cyan-300 transition-all"
          >
            {isDone ? '完了' : isSubmitting ? '登録中（AIキーワード生成中…）' : '登録する'}
          </button>
        </form>
      </main>

      {isDone && (
        <CenterPopup
          message="登録が完了しました。TOPに戻ります…"
          duration={1500}
          onDismiss={() => {}}
        />
      )}
    </div>
  )
}
