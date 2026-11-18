/**
 * Minimal PNG decoder for screenshot comparison.
 *
 * Extracted from `check_surface_snapshot.ts` so the visual-baseline set and the surface
 * snapshot compare pixels the same way. Two copies of a decoder is two chances for the
 * tolerance rules to disagree about what 'the same picture' means.
 */
import { inflateSync } from 'node:zlib'

export type DecodedPng = { width: number; height: number; rgba: Buffer }

/** Decode the 8-bit RGB/RGBA screenshots produced by Chromium into canonical RGBA pixels. */
export function decodePng(buffer: Buffer): DecodedPng {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  if (buffer.length < signature.length || !buffer.subarray(0, 8).equals(signature)) {
    throw new Error('not a PNG image')
  }

  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let interlace = 0
  const imageData: Buffer[] = []
  let offset = 8

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    if (dataEnd + 4 > buffer.length) throw new Error('truncated PNG chunk')
    const data = buffer.subarray(dataStart, dataEnd)

    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      interlace = data[12]
    } else if (type === 'IDAT') {
      imageData.push(data)
    } else if (type === 'IEND') {
      break
    }
    offset = dataEnd + 4
  }

  if (!width || !height || bitDepth !== 8 || ![2, 6].includes(colorType) || interlace !== 0) {
    throw new Error(
      `unsupported PNG format: ${width}x${height}, depth=${bitDepth}, ` +
        `color=${colorType}, interlace=${interlace}`,
    )
  }

  const bytesPerPixel = colorType === 6 ? 4 : 3
  const rowBytes = width * bytesPerPixel
  const stride = rowBytes + 1
  const filtered = inflateSync(Buffer.concat(imageData))
  if (filtered.length !== stride * height) throw new Error('PNG scanline data has an unexpected size')

  const pixels = Buffer.alloc(rowBytes * height)
  for (let y = 0; y < height; y += 1) {
    const sourceStart = y * stride + 1
    const targetStart = y * rowBytes
    const filter = filtered[sourceStart - 1]

    for (let x = 0; x < rowBytes; x += 1) {
      const raw = filtered[sourceStart + x]
      const left = x >= bytesPerPixel ? pixels[targetStart + x - bytesPerPixel] : 0
      const up = y > 0 ? pixels[targetStart + x - rowBytes] : 0
      const upperLeft = y > 0 && x >= bytesPerPixel ? pixels[targetStart + x - rowBytes - bytesPerPixel] : 0
      let predictor = 0

      if (filter === 1) predictor = left
      else if (filter === 2) predictor = up
      else if (filter === 3) predictor = Math.floor((left + up) / 2)
      else if (filter === 4) {
        const p = left + up - upperLeft
        const leftDistance = Math.abs(p - left)
        const upDistance = Math.abs(p - up)
        const upperLeftDistance = Math.abs(p - upperLeft)
        predictor = leftDistance <= upDistance && leftDistance <= upperLeftDistance
          ? left
          : upDistance <= upperLeftDistance
            ? up
            : upperLeft
      } else if (filter !== 0) {
        throw new Error(`unsupported PNG filter ${filter}`)
      }

      pixels[targetStart + x] = (raw + predictor) & 0xff
    }
  }

  if (colorType === 6) return { width, height, rgba: pixels }

  const rgba = Buffer.alloc(width * height * 4)
  for (let source = 0, target = 0; source < pixels.length; source += 3, target += 4) {
    rgba[target] = pixels[source]
    rgba[target + 1] = pixels[source + 1]
    rgba[target + 2] = pixels[source + 2]
    rgba[target + 3] = 255
  }
  return { width, height, rgba }
}
