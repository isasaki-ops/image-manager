'use client'

import { useRouter } from 'next/navigation'

export default function BackButton({ fallback = '/' }: { fallback?: string }) {
  const router = useRouter()
  return (
    <button
      onClick={() => {
        if (typeof window !== 'undefined' && window.history.length > 1) {
          window.history.back()
        } else {
          router.push(fallback)
        }
      }}
      className="text-gray-500 hover:text-gray-700 text-sm"
    >
      ← 戻る
    </button>
  )
}
