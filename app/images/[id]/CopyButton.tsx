'use client'

import { useState } from 'react'

export default function CopyButton({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="flex-1 min-w-[120px] py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 text-center rounded-lg font-medium transition-colors"
    >
      {copied ? 'コピー済み ✓' : label}
    </button>
  )
}
