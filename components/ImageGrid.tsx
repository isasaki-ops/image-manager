import ImageCard from './ImageCard'

interface ImageItem {
  id: string
  r2_url: string
  uploaded_at: string
  memo: string | null
  ai_description?: string | null
  file_name?: string | null
  file_size?: number | null
  file_type?: string | null
  image_width?: number | null
  image_height?: number | null
}

interface ImageGridProps {
  images: ImageItem[]
  searchQuery?: string
}

export default function ImageGrid({ images, searchQuery }: ImageGridProps) {
  if (images.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-lg">画像が見つかりませんでした</p>
        {searchQuery && (
          <p className="text-sm mt-2">別のキーワードで試してみてください</p>
        )}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {images.map((img) => (
        <ImageCard
          key={img.id}
          {...img}
        />
      ))}
    </div>
  )
}
