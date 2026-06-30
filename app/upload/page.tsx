import { Suspense } from 'react'
import BackButton from '@/components/BackButton'
import UploadForm from '@/components/UploadForm'

export default function UploadPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <BackButton />
          <h1 className="text-lg font-bold text-gray-800">画像アップロード</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-10">
        <Suspense fallback={<div className="text-center text-gray-400 py-10">読み込み中...</div>}>
          <UploadForm />
        </Suspense>
      </main>
    </div>
  )
}
