import sharp from 'sharp'
export { RESIZABLE_MIME_TYPES, RESIZABLE_EXTENSIONS, canResize } from './imageTypes'

export async function cropTo600x400(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize(600, 400, { fit: 'fill' })
    .jpeg({ quality: 90 })
    .toBuffer()
}
