import * as pdfjs from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

/*
  Read the text out of an uploaded file in the browser, so a 40 MB paper never
  leaves the device intact — only the text the model needs is sent on.
*/

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

export type Extraction = { text: string; pages: number | null }

export const READABLE = ['pdf', 'txt', 'md', 'csv', 'json', 'rtf'] as const

export function extensionOf(name: string) {
  return (name.split('.').pop() ?? '').toLowerCase()
}

export function isReadable(name: string) {
  return (READABLE as readonly string[]).includes(extensionOf(name))
}

/** Text of a PDF, page by page, or of a plain-text file. */
export async function extractText(file: File, onPage?: (done: number, total: number) => void): Promise<Extraction> {
  const ext = extensionOf(file.name)

  if (ext !== 'pdf') {
    const text = await file.text()
    return { text, pages: null }
  }

  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await pdfjs.getDocument({ data, useSystemFonts: true }).promise
  const out: string[] = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n)
    const content = await page.getTextContent()
    let line = ''
    for (const item of content.items) {
      if (!('str' in item)) continue
      line += item.str
      line += 'hasEOL' in item && item.hasEOL ? '\n' : ' '
    }
    out.push(line.replace(/[ \t]+/g, ' ').trim())
    onPage?.(n, pdf.numPages)
    page.cleanup()
  }
  pdf.cleanup()
  return { text: out.join('\n\n'), pages: pdf.numPages }
}
