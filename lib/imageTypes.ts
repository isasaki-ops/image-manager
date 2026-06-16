export const RESIZABLE_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/tiff', 'image/avif',
])
export const RESIZABLE_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'gif', 'tiff', 'tif', 'avif',
])

export function canResize(mimeType: string, ext: string): boolean {
  return RESIZABLE_MIME_TYPES.has(mimeType) || RESIZABLE_EXTENSIONS.has(ext.toLowerCase())
}
