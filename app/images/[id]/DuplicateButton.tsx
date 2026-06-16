'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function DuplicateButton({ id, disabled }: { id: string; disabled?: boolean }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [newId, setNewId] = useState<string | null>(null)

  const handleDuplicate = async () => {
    setState('loading')
    try {
      const res = await fetch(`/api/images/${id}/duplicate`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setNewId(data.id)
      setState('done')
    } catch {
      setState('error')
    }
  }

  if (state === 'done' && newId) {
    return (
      <Link
        href={`/images/${newId}`}
        className="flex-1 min-w-[120px] py-3 bg-green-600 text-white text-center rounded-lg font-medium hover:bg-green-700 transition-colors"
      >
        複製完了 → 詳細を開く
      </Link>
    )
  }

  if (disabled) {
    return (
      <span className="flex-1 min-w-[120px] py-3 bg-purple-300 text-white text-center rounded-lg font-medium cursor-not-allowed select-none">
        600×400で複製
      </span>
    )
  }

  return (
    <button
      onClick={handleDuplicate}
      disabled={state === 'loading'}
      className="flex-1 min-w-[120px] py-3 bg-purple-600 text-white text-center rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-50"
    >
      {state === 'loading' ? '複製中...' : state === 'error' ? '失敗（再試行）' : '600×400で複製'}
    </button>
  )
}
