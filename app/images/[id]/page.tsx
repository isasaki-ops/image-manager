import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { getSupabaseAdmin } from '@/lib/supabase'
import CopyButton from './CopyButton'
import DeleteButton from './DeleteButton'
import AiDescription from './AiDescription'

interface Props {
  params: Promise<{ id: string }>
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function getImage(id: string) {
  const { data } = await getSupabaseAdmin()
    .from('images')
    .select('id, r2_url, uploaded_at, memo, ai_description, is_active, file_name, file_size, file_type, image_width, image_height')
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
          {image.file_type?.startsWith('image/') ? (
            <Image
              src={image.r2_url}
              alt={image.memo ?? '取材画像'}
              width={1200}
              height={800}
              className="w-full h-auto object-contain"
              unoptimized
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
              <span className="text-6xl">📄</span>
              <span className="text-lg font-medium">{image.file_name}</span>
              <span className="text-sm">{image.file_type}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 flex-wrap">
          <CopyButton url={image.r2_url} label="画像URLをコピー" />
          <a
            href={`/api/images/${id}/download`}
            download={image.file_name ?? `image-${id}`}
            className="flex-1 min-w-[120px] py-3 bg-blue-600 text-white text-center rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            ダウンロード
          </a>
          <DeleteButton id={id} />
        </div>

        {/* Meta */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <div>
            <span className="text-xs text-gray-500 uppercase tracking-wide">アップロード日</span>
            <p className="text-sm text-gray-800 mt-0.5">{formattedDate}</p>
          </div>
          {image.file_name && (
            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wide">ファイル名</span>
              <p className="text-sm text-gray-800 mt-0.5 break-all">{image.file_name}</p>
            </div>
          )}
          <div>
            <span className="text-xs text-gray-500 uppercase tracking-wide">画像URL</span>
            <p className="text-sm text-blue-600 mt-0.5 break-all">
              <a href={image.r2_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {image.r2_url}
              </a>
            </p>
          </div>
          {(image.file_type || image.file_size != null || (image.image_width && image.image_height)) && (
            <div className="flex gap-6 flex-wrap">
              {image.file_type && (
                <div>
                  <span className="text-xs text-gray-500 uppercase tracking-wide">形式</span>
                  <p className="text-sm text-gray-800 mt-0.5">{image.file_type.split('/')[1]?.toUpperCase()}</p>
                </div>
              )}
              {image.file_size != null && (
                <div>
                  <span className="text-xs text-gray-500 uppercase tracking-wide">ファイルサイズ</span>
                  <p className="text-sm text-gray-800 mt-0.5">{formatFileSize(image.file_size)}</p>
                </div>
              )}
              {image.image_width && image.image_height && (
                <div>
                  <span className="text-xs text-gray-500 uppercase tracking-wide">解像度</span>
                  <p className="text-sm text-gray-800 mt-0.5">{image.image_width}×{image.image_height}</p>
                </div>
              )}
            </div>
          )}
          {image.memo && (
            <div>
              <span className="text-xs text-gray-500 uppercase tracking-wide">メモ</span>
              <p className="text-sm text-gray-800 mt-0.5 whitespace-pre-wrap">{image.memo}</p>
            </div>
          )}
          {image.ai_description && (
            <AiDescription text={image.ai_description} />
          )}
        </div>
      </main>
    </div>
  )
}
