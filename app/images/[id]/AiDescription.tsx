'use client'

import { useState } from 'react'

export default function AiDescription({ text }: { text: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <span className="text-xs text-gray-500 uppercase tracking-wide">AI解析結果</span>
        <span className="text-gray-400 text-sm">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-5 py-4">
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{text}</p>
        </div>
      )}
    </div>
  )
}
