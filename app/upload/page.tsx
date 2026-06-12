import Link from 'next/link'
import UploadForm from '@/components/UploadForm'

export default function UploadPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-gray-500 hover:text-gray-700 text-sm">
            ← 戻る
          </Link>
          <h1 className="text-lg font-bold text-gray-800">画像アップロード</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-10">
        <UploadForm />
      </main>
    </div>
  )
}
