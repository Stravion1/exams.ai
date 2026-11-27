/*
  The exam archive: uploaded papers, their extracted text and every question
  the model found in them. localStorage is fine for a few slugs of app state
  but not for 20 papers of text, so this lives in IndexedDB.

  Three stores:
    papers    one row per uploaded PDF, with counts and status
    questions one row per extracted MCQ, tagged with its paper and exam
    text      the raw extracted text, kept so a paper can be re-analysed
*/

export type PaperStatus = 'queued' | 'extracting' | 'analysing' | 'done' | 'error'

export type Paper = {
  id: string
  exam: string
  name: string
  size: number
  addedAt: string
  /** Characters of text extracted from the file. */
  chars: number
  /** Pages in the PDF, when it is one. */
  pages: number | null
  /** Year read from the file name, used to label repeats. */
  year: number | null
  status: PaperStatus
  error?: string
  questionCount: number
}

export type BankQuestion = {
  id: string
  exam: string
  paperId: string
  paperName: string
  year: number | null
  subject: string
  topic: string
  prompt: string
  options: string[]
  answer: number
  why: string
  /** Normalised prompt, the key repeated questions share. */
  key: string
}

const DB_NAME = 'examsai'
const DB_VERSION = 1
const PAPERS = 'papers'
const QUESTIONS = 'questions'
const TEXT = 'text'

let dbp: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(PAPERS)) db.createObjectStore(PAPERS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(QUESTIONS)) {
        const s = db.createObjectStore(QUESTIONS, { keyPath: 'id' })
        s.createIndex('exam', 'exam')
        s.createIndex('paperId', 'paperId')
      }
      if (!db.objectStoreNames.contains(TEXT)) db.createObjectStore(TEXT, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB unavailable'))
  })
  return dbp
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB error'))
  })
}

async function tx<T>(stores: string[], mode: IDBTransactionMode, run: (t: IDBTransaction) => Promise<T> | T): Promise<T> {
  const db = await open()
  const t = db.transaction(stores, mode)
  const result = await run(t)
  await new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error ?? new Error('IndexedDB transaction failed'))
    t.onabort = () => reject(t.error ?? new Error('IndexedDB transaction aborted'))
  })
  return result
}

export function newId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export async function listPapers(exam: string): Promise<Paper[]> {
  return tx([PAPERS], 'readonly', async (t) => {
    const rows = await done(t.objectStore(PAPERS).getAll() as IDBRequest<Paper[]>)
    return rows.filter((p) => p.exam === exam).sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1))
  })
}

export async function savePaper(paper: Paper): Promise<void> {
  await tx([PAPERS], 'readwrite', (t) => {
    t.objectStore(PAPERS).put(paper)
  })
}

export async function saveText(id: string, text: string): Promise<void> {
  await tx([TEXT], 'readwrite', (t) => {
    t.objectStore(TEXT).put({ id, text })
  })
}

export async function readText(id: string): Promise<string | null> {
  return tx([TEXT], 'readonly', async (t) => {
    const row = await done(t.objectStore(TEXT).get(id) as IDBRequest<{ id: string; text: string } | undefined>)
    return row?.text ?? null
  })
}

export async function listQuestions(exam: string): Promise<BankQuestion[]> {
  return tx([QUESTIONS], 'readonly', async (t) => {
    const store = t.objectStore(QUESTIONS)
    if (store.indexNames.contains('exam')) {
      const rows = await done(store.index('exam').getAll(exam) as IDBRequest<BankQuestion[]>)
      return rows
    }
    const rows = await done(store.getAll() as IDBRequest<BankQuestion[]>)
    return rows.filter((q) => q.exam === exam)
  })
}

export async function saveQuestions(rows: BankQuestion[]): Promise<void> {
  if (!rows.length) return
  await tx([QUESTIONS], 'readwrite', (t) => {
    const store = t.objectStore(QUESTIONS)
    for (const r of rows) store.put(r)
  })
}

export async function deleteQuestionsForPaper(paperId: string): Promise<void> {
  await tx([QUESTIONS], 'readwrite', (t) => {
    const qs = t.objectStore(QUESTIONS)
    const req = qs.getAll() as IDBRequest<BankQuestion[]>
    req.onsuccess = () => {
      for (const q of req.result) if (q.paperId === paperId) qs.delete(q.id)
    }
  })
}

export async function deletePaper(id: string): Promise<void> {
  await tx([PAPERS, QUESTIONS, TEXT], 'readwrite', (t) => {
    t.objectStore(PAPERS).delete(id)
    t.objectStore(TEXT).delete(id)
    const qs = t.objectStore(QUESTIONS)
    const req = qs.getAll() as IDBRequest<BankQuestion[]>
    req.onsuccess = () => {
      for (const q of req.result) if (q.paperId === id) qs.delete(q.id)
    }
  })
}

export async function deleteExam(exam: string): Promise<void> {
  const papers = await listPapers(exam)
  for (const p of papers) await deletePaper(p.id)
}

/* ------------------------------------------------------------------ */
/* Pure helpers — no IndexedDB, so they can be tested on their own.    */
/* ------------------------------------------------------------------ */

/**
 * Words that carry no subject matter. Stripping them makes two versions of the
 * same question (one worded differently) collapse to the same text, which is
 * what makes repeat detection work.
 *
 * Deliberately NOT in here: negation, conditionals and polarity words. "Which is
 * NOT correct" and "Which is correct" are opposite questions, and "if" changes
 * what is being asked, so those words must survive normalisation.
 */
const STOP = new Set([
  'which', 'what', 'who', 'whom', 'whose', 'when', 'where', 'why', 'how', 'the', 'a', 'an', 'of', 'for', 'in', 'on', 'at', 'to',
  'and', 'or', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'it', 'its', 'that', 'this', 'these', 'those', 'with', 'by',
  'from', 'as', 'following', 'statement', 'statements', 'define', 'defined', 'name', 'named', 'state', 'given', 'give', 'find',
  'calculate', 'select', 'choose', 'option', 'options', 'question', 'questions', 'according', 'respect', 'can', 'will', 'would',
  'should', 'do', 'does', 'has', 'have', 'then', 'than', 'into',
])

/** Canonical token added to a negated stem, so polarity is compared, not lost. */
const NEG_MARK = '~neg'

/**
 * Every way an MCQ stem flips meaning: negation, exceptions, and the "pick the
 * wrong one" phrasing that is common in Indian exam papers.
 */
const NEGATION = /\b(?:not|never|none|no|cannot|except|excluding|neither|nor|incorrect|false|least|without)\b|n['’]t\b/i

/** True when the question asks for the false/incorrect/exceptional option. */
export function isNegative(s: string) {
  return NEGATION.test(s)
}

/**
 * "Which of the following is the SI unit of force?" → "si unit force"
 * "Which of these is NOT correct?" → "not correct ~neg"
 */
export function normalisePrompt(s: string) {
  const base = s
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .join(' ')
  if (!isNegative(s)) return base
  return base ? `${base} ${NEG_MARK}` : NEG_MARK
}

function fnv(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0).toString(36)
}

/**
 * A cheap stable hash of the normalised prompt. Polarity is part of the hash, so
 * a question and its negated twin can never share a key.
 */
export function promptHash(s: string) {
  const content = normalisePrompt(s)
  const words = content.split(' ').filter((w) => w && w !== NEG_MARK)
  // A stem made only of boilerplate ("which of these is correct") loses every
  // content word. Fall back to the full text for those, or every such stem in
  // the bank would look identical to every other one.
  const basis = words.length >= 2 ? content : s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  return fnv(basis)
}

function tokens(s: string) {
  return new Set(normalisePrompt(s).split(' ').filter(Boolean))
}

/** How many meaningful words two prompts have in common. */
export function sharedWords(a: string, b: string) {
  const A = tokens(a)
  const B = tokens(b)
  let shared = 0
  for (const w of A) if (B.has(w)) shared++
  return shared
}

/** Jaccard overlap of the meaningful words in two prompts, 0 to 1. */
export function similarity(a: string, b: string) {
  const A = tokens(a)
  const B = tokens(b)
  if (!A.size || !B.size) return 0
  const shared = sharedWords(a, b)
  return shared / (A.size + B.size - shared)
}

/** Read a year like 2024 out of a file name. */
export function yearFromName(name: string): number | null {
  const m = name.match(/\b(19|20)\d{2}\b/g)
  if (!m) return null
  const years = m.map(Number).filter((y) => y >= 1990 && y <= new Date().getFullYear() + 1)
  return years.length ? Math.max(...years) : null
}

export type BankRow = {
  question: BankQuestion
  /** 1 when it appears once, 2+ when the same question shows up again. */
  repeats: number
  /** Every paper the question was seen in, newest first. */
  papers: { paperId: string; paperName: string; year: number | null }[]
  /** Higher means study this first. */
  importance: number
}

/**
 * Group the bank by repeated question and rank it. Near-duplicates (same idea,
 * wording changed) are merged with a similarity threshold so a reworded repeat
 * still counts as a repeat.
 */
export function rankBank(questions: BankQuestion[], threshold = 0.78): BankRow[] {
  const groups: { key: string; items: BankQuestion[] }[] = []
  const exact = new Map<string, number>()

  for (const q of questions) {
    // Recompute rather than trusting `key`: rows mined before the matching rules
    // changed must be grouped by the current rules, not the old ones.
    const key = q.prompt.trim() ? promptHash(q.prompt) : q.key || ''
    const hit = exact.get(key)
    if (hit !== undefined) {
      groups[hit].items.push(q)
      continue
    }
    // Near-duplicates must share at least two content words, so two short
    // questions that only share one word are not merged by accident.
    const near = groups.findIndex((g) => {
      if (sharedWords(g.items[0].prompt, q.prompt) < 2) return false
      return similarity(g.items[0].prompt, q.prompt) >= threshold
    })
    if (near !== -1) {
      groups[near].items.push(q)
      exact.set(key, near)
      continue
    }
    exact.set(key, groups.length)
    groups.push({ key, items: [q] })
  }

  const rows: BankRow[] = groups.map((g) => {
    const seen = new Map<string, { paperId: string; paperName: string; year: number | null }>()
    for (const q of g.items) seen.set(q.paperId, { paperId: q.paperId, paperName: q.paperName, year: q.year })
    const papers = [...seen.values()].sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
    const repeats = papers.length
    const newest = papers[0]?.year ?? 0
    return {
      question: g.items[0],
      repeats,
      papers,
      // A repeat is the strongest signal, then recency, then the length of the
      // explanation (a well-explained question is usually a real one).
      importance: repeats * 10 + Math.min(3, Math.max(0, newest - 2020)) + Math.min(3, Math.round(g.items[0].why.length / 120)),
    }
  })

  return rows.sort((a, b) => b.importance - a.importance || a.question.prompt.localeCompare(b.question.prompt))
}

/** Counts for the exam dashboard. */
export function bankStats(rows: BankRow[]) {
  const subjects = new Map<string, number>()
  let repeats = 0
  let total = 0
  for (const r of rows) {
    subjects.set(r.question.subject, (subjects.get(r.question.subject) ?? 0) + 1)
    total++
    if (r.repeats > 1) repeats++
  }
  return {
    total,
    repeats,
    subjects: [...subjects.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
  }
}

/** Break extracted text into model-sized chunks on paragraph boundaries. */
export function chunkText(text: string, size = 12_000, max = 30): string[] {
  const clean = text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  if (!clean) return []
  if (clean.length <= size) return [clean]
  const chunks: string[] = []
  let i = 0
  while (i < clean.length && chunks.length < max) {
    let end = Math.min(clean.length, i + size)
    if (end < clean.length) {
      const cut = clean.lastIndexOf('\n\n', end)
      if (cut > i + size * 0.5) end = cut
    }
    chunks.push(clean.slice(i, end).trim())
    i = end
  }
  return chunks.filter(Boolean)
}
