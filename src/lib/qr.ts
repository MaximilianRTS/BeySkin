import { encode } from 'uqr'

/** Quiet zone in modules – the QR spec asks for 4 so phone cameras find the code. */
const QUIET = 4

export interface QrCode {
  /** Side length in modules, quiet zone included. */
  size: number
  /** SVG path of all dark modules (one unit = one module). */
  path: string
}

/**
 * Encodes text as QR code. Throws when it does not fit (> ~2900 bytes at level L).
 * Error correction is raised automatically as long as the code doesn't grow.
 */
export function makeQr(text: string): QrCode {
  const qr = encode(text, { ecc: 'L', boostEcc: true, border: QUIET })
  let path = ''
  qr.data.forEach((row, y) => {
    // Horizontal runs keep the path short even for large codes.
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue
      let end = x
      while (end + 1 < row.length && row[end + 1]) end++
      path += `M${x} ${y}h${end - x + 1}v1h${x - end - 1}z`
      x = end
    }
  })
  return { size: qr.size, path }
}

/** Standalone SVG file (black on white, quiet zone included). */
export function qrSvg(qr: QrCode, px = 8): string {
  const s = qr.size * px
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${qr.size} ${qr.size}" shape-rendering="crispEdges"><rect width="${qr.size}" height="${qr.size}" fill="#fff"/><path d="${qr.path}" fill="#000"/></svg>`
}

export async function qrPng(qr: QrCode, px = 10): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = qr.size * px
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.scale(px, px)
  ctx.fillStyle = '#000'
  ctx.fill(new Path2D(qr.path))
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'))
}
