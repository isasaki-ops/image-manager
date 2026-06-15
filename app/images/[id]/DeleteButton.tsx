'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function DeleteButton({ id }: { id: string }) {
  const [isDeleting, setIsDeleting] = useState(false)
  const router = useRouter()

  const handleDelete = async () => {
    if (!confirm('この画像を削除しますか？\nR2とデータベースから完全に削除されます。')) return

    setIsDeleting(true)
    try {
      const res = await fetch(`/api/images/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      router.push('/')
    } catch {
      alert('削除に失敗しました')
      setIsDeleting(false)
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isDeleting}
      className="flex-1 min-w-[120px] py-3 bg-red-600 text-white text-center rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
    >
      {isDeleting ? '削除中...' : '画像を削除'}
    </button>
  )
}
