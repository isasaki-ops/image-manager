'use client'

import { useState, useCallback } from 'react'

interface SearchBoxProps {
  onSearch: (query: string) => void
  isLoading: boolean
  initialValue?: string
}

export default function SearchBox({ onSearch, isLoading, initialValue = '' }: SearchBoxProps) {
  const [value, setValue] = useState(initialValue)

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      onSearch(value.trim())
    },
    [value, onSearch]
  )

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 w-full">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="例：取材名、キャラクター名、ライター名など"
        className="flex-1 px-4 py-2 rounded-lg border border-fuchsia-500/60 bg-black text-sm text-zinc-100 placeholder-zinc-500 shadow-[0_0_10px_rgba(217,70,239,0.15)_inset] focus:outline-none focus:border-fuchsia-400 focus:shadow-[0_0_14px_rgba(217,70,239,0.4)_inset]"
      />
      <button
        type="submit"
        disabled={isLoading}
        className="px-5 py-2 bg-black text-cyan-300 border border-cyan-400/70 rounded-lg text-sm font-bold hover:bg-cyan-400 hover:text-black hover:shadow-[0_0_14px_rgba(34,211,238,0.7)] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {isLoading ? '検索中...' : '検索'}
      </button>
      {value && (
        <button
          type="button"
          onClick={() => { setValue(''); onSearch('') }}
          className="px-3 py-2 text-zinc-500 hover:text-zinc-200 text-sm transition-colors"
        >
          クリア
        </button>
      )}
    </form>
  )
}
