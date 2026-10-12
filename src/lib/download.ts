export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Safari needs the URL alive for a moment after the click.
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/** Object URLs shown in another tab or frame stay valid this long (viewers may re-read them). */
const KEEP_URL_MS = 10 * 60_000

export interface PendingTab {
  /** Loads the file into the tab; false when the user closed it in the meantime. */
  show(blob: Blob): boolean
  close(): void
}

/**
 * Opens an empty tab right away – popup blockers only allow window.open inside the
 * click handler, not after an await – and shows `message` until show() loads the file.
 * Returns null when the popup was blocked.
 */
export function openPendingTab(message: string): PendingTab | null {
  let w: Window | null = null
  try {
    w = window.open('', '_blank')
  } catch {
    w = null
  }
  if (!w) return null
  const tab = w
  try {
    const doc = tab.document
    doc.title = message
    doc.body.style.cssText = 'margin:0;display:grid;place-items:center;min-height:100vh;background:#525659;color:#fff;font:16px system-ui,sans-serif'
    doc.body.textContent = message
  } catch {
    // the blank tab still works without the placeholder
  }
  return {
    show(blob) {
      if (tab.closed) return false
      const url = URL.createObjectURL(blob)
      try {
        tab.opener = null
      } catch {
        // ignore
      }
      tab.location.href = url
      setTimeout(() => URL.revokeObjectURL(url), KEEP_URL_MS)
      return true
    },
    close() {
      if (!tab.closed) tab.close()
    },
  }
}

/**
 * Whether a PDF can be printed straight from a hidden iframe: desktop Chromium
 * (Chrome, Edge, Opera, Brave) with its built-in PDF viewer. Firefox shows PDFs in a
 * privileged viewer, Safari prints the parent page, phones have no inline PDF printing.
 */
export function canPrintInFrame(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return false
  if (navigator.pdfViewerEnabled === false) return false
  return /Chrome\/|Chromium\/|Edg\//.test(ua)
}

let printFrame: HTMLIFrameElement | null = null
let printUrl = ''

/** Removes the hidden print frame (call when the print UI goes away). */
export function disposePrintFrame() {
  printFrame?.remove()
  printFrame = null
  if (printUrl) URL.revokeObjectURL(printUrl)
  printUrl = ''
}

/**
 * Loads the PDF into a hidden iframe and opens the browser's print dialog for it.
 * Resolves false when that is not possible, so the caller can fall back to a tab or download.
 * The frame stays until the next print or disposePrintFrame() – removing it earlier would
 * cancel the print job.
 */
export function printInFrame(blob: Blob): Promise<boolean> {
  disposePrintFrame()
  printUrl = URL.createObjectURL(blob)
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.tabIndex = -1
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  printFrame = frame
  return new Promise((resolve) => {
    let done = false
    const finish = (ok: boolean) => {
      if (done) return
      done = true
      resolve(ok)
    }
    setTimeout(() => finish(false), 15_000)
    frame.onload = () => {
      // The PDF viewer needs a moment after load before it can print.
      setTimeout(() => {
        if (done || printFrame !== frame) return finish(false)
        try {
          frame.contentWindow!.focus()
          frame.contentWindow!.print()
          finish(true)
        } catch (err) {
          console.warn('frame print failed', err)
          finish(false)
        }
      }, 300)
    }
    frame.src = printUrl
    document.body.appendChild(frame)
  })
}

export function timestamp(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}`
}

export function safeFilename(name: string, fallback = 'design'): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^\w\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 50)
  return cleaned || fallback
}
