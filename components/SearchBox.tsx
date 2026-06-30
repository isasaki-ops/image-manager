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
        className="flex-1 px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-900 bg-white placeholder-gray-400"
      />
      <button
        type="submit"
        disabled={isLoading}
        className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isLoading ? '検索中...' : '検索'}
      </button>
      {value && (
        <button
          type="button"
          onClick={() => { setValue(''); onSearch('') }}
          className="px-3 py-2 text-gray-500 hover:text-gray-700 text-sm"
        >
          クリア
        </button>
      )}
    </form>
  )
}
