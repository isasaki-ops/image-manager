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
      className="text-zinc-500 hover:text-cyan-300 text-sm transition-colors"
    >
      ← 戻る
    </button>
  )
}
