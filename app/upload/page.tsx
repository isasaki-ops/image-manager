import { Suspense } from 'react'
import BackButton from '@/components/BackButton'
import UploadForm from '@/components/UploadForm'

export default function UploadPage() {
  return (
    <div className="min-h-screen">
      <header className="bg-black/70 backdrop-blur border-b border-fuchsia-400/40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <BackButton />
          <h1 className="text-lg font-bold text-white [text-shadow:0_0_6px_#d946ef,0_0_16px_rgba(217,70,239,0.5)]">画像アップロード</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-10">
        <Suspense fallback={<div className="text-center text-zinc-500 py-10">読み込み中...</div>}>
          <UploadForm />
        </Suspense>
      </main>
    </div>
  )
}
