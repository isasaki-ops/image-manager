'use client'

import { useEffect } from 'react'

export default function CenterPopup({
  message,
  onDismiss,
  duration = 1800,
}: {
  message: string
  onDismiss: () => void
  duration?: number
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, duration)
    return () => clearTimeout(timer)
  }, [onDismiss, duration])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 pointer-events-none">
      <div className="bg-black border border-emerald-400 rounded-2xl px-8 py-6 shadow-[0_0_40px_rgba(52,211,153,0.5)] max-w-sm mx-4">
        <p className="text-emerald-300 text-base font-bold text-center [text-shadow:0_0_10px_rgba(52,211,153,0.6)]">
          {message}
        </p>
      </div>
    </div>
  )
}
