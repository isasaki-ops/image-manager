import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { getSupabaseAdmin } from '@/lib/supabase'
import CopyButton from './CopyButton'

interface Props {
  params: Promise<{ id: string }>
}

async function getImage(id: string) {
  const { data } = await getSupabaseAdmin()
    .from('images')
    .select('id, r2_url, uploaded_at, memo, ai_description, is_active')
    .eq('id', id)
    .single()
  return data
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const image = await getImage(id)
  if (!image) return { title: '画像が見つかりません' }

  return {
    title: 'パチンコ取材画像',
    description: image.ai_description ?? image.memo ?? 'パチンコ取材画像',
    openGraph: {
      title: 'パチンコ取材画像',
      description: image.ai_description ?? image.memo ?? 'パチンコ取材画像',
      images: [{ url: image.r2_url }],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'パチンコ取材画像',
      images: [image.r2_url],
    },
  }
}

export default async function ImageDetailPage({ params }: Props) {
  const { id } = await params
  const image = await getImage(id)
  if (!image) notFound()

  const formattedDate = new Date(image.uploaded_at).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  const pageUrl = `${process.env.NEXT_PUBLIC_APP_URL}/images/${id}`

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-gray-500 hover:text-gray-700 text-sm">
            ← 一覧に戻る
          </Link>
          <h1 className="text-lg font-bold text-gray-800">画像詳細</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Main image */}
        <div className="relative w-full bg-gray-100 rounded-xl overflow-hidden">
          <Image
            src={image.r2_url}
            alt={image.memo ?? '取材画像'}
            width={1200}
            height={800}
            className="w-full h-auto object-contain"
            unoptimized
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 flex-wrap">
          <a
            href={image.r2_url}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 min-w-[120px] py-3 bg-blue-600 text-white text-center rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            ダウンロード
          </a>
          <CopyButton url={pageUrl} label="ページURLをコピー" />
          <CopyButton url={image.r2_url} label="画像URLをコピー" />
        </div>

        {/* Meta */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <div>
            <span className="text-xs text-gray-500 uppercase tracking-wide">アップロード日</span>
            <p className="text-sm text-gray-800 mt-0.5">{formattedDate}</p>
          </div>
          {image.memo && (
            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wide">メモ</span>
              <p className="text-sm text-gray-800 mt-0.5 whitespace-pre-wrap">{image.memo}</p>
            </div>
          )}
          {image.ai_description && (
            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wide">AI解析結果</span>
              <p className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap leading-relaxed">
                {image.ai_description}
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
