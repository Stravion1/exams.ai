// Mines the NEET papers pushed to the repo into a question bank, offline.
//   bun scripts/mine-neet.mjs            report only
//   bun scripts/mine-neet.mjs --write    also write src/data/neet-*.json
//
// Two formats live in the repo:
//   full papers   "Question 1: ... Options: (a).. Answer: (b) Solution: ..."
//   PrepWiser     chapter PDFs, one question per Q-line, answer key at the end
// Nothing here calls a model: the papers already print their answers.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { normalisePrompt, promptHash, rankBank, similarity } from '../src/lib/archive.ts'

const WRITE = process.argv.includes('--write')
const ROOT = new URL('..', import.meta.url).pathname

/* ---------------------------------------------------------------- */
/* text                                                              */
/* ---------------------------------------------------------------- */

const cache = new Map()
async function textOf(path) {
  if (cache.has(path)) return cache.get(path)
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)), useSystemFonts: true }).promise
  const pages = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    let line = ''
    for (const item of content.items) {
      if (!('str' in item)) continue
      line += item.str
      line += 'hasEOL' in item && item.hasEOL ? '\n' : ' '
    }
    pages.push(line)
    page.cleanup()
  }
  doc.cleanup()
  const text = pages.join('\n')
  cache.set(path, text)
  return text
}

const tidy = (s) =>
  s
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, ' ')
    .trim()

/**
 * Formula-heavy solutions extract as glyph soup ("2 2 1 1 2 2 MR I MK"). Showing
 * that is worse than showing nothing, so keep a solution only when it reads.
 */
function readable(s) {
  if (s.length < 40) return false
  // "V V V V" and "MR I MK" are formula fragments, not an explanation.
  if (/\b[a-z]\b(\s+\b[a-z]\b){2,}/i.test(s)) return false
  // Keep anything carrying a run of real English words. The working may still
  // have formulas that did not extract cleanly around it, and the English is
  // the part that teaches, so a mixed solution beats no solution.
  if (/[a-z]{3,}(?:\s+[a-z]{3,}){3,}/i.test(s)) return true
  const words = s.split(/\s+/).filter((w) => /[a-z]{3,}/i.test(w))
  const letters = (s.match(/[a-z]/gi) ?? []).length
  return words.length >= 6 && letters / (s.replace(/\s/g, '').length || 1) > 0.55
}

function cleanBody(s, cap) {
  const out = tidy(s)
    .split(/(?<=[a-z0-9]) /i)
    .join(' ')
  const kept = out.replace(/\s+/g, ' ').trim()
  return kept.length > cap ? `${kept.slice(0, cap).trimEnd()}…` : kept
}

/* ---------------------------------------------------------------- */
/* full papers: Question N / Options / Answer / Solution             */
/* ---------------------------------------------------------------- */

/*
  NEET is fixed in shape: 50/50/100 until 2024, then 45/45/90 from 2025, always
  in the order Physics, Chemistry, Biology.
*/
const subjectByNumber = (n, cut) => (n <= cut ? 'Physics' : n <= cut * 2 ? 'Chemistry' : 'Biology')

const PHYSICS = ['Alternating Current', 'Atoms', 'Current Electricity', 'Dual Nature of Radiation and Matter', 'Electric Charges and Fields', 'Electromagnetic Induction', 'Electromagnetic Waves', 'Electrostatic Potential and Capacitance', 'Gravitation', 'Kinetic Theory', 'Laws of Motion', 'Magnetism and Matter', 'Mechanical Properties of Fluids', 'Motion in a Plane', 'Motion in a Straight Line', 'Moving Charges and Magnetism', 'Nuclei', 'Oscillations', 'Ray Optics and Optical Instruments', 'Semiconductor Electronics', 'System of Particles and Rotational Motion', 'Thermal Properties of Matter', 'Units and Measurements', 'Wave Optics', 'Waves', 'Work Energy and Power']

const CHEMISTRY = ['Alcohols Phenols and Ethers', 'Aldehydes Ketones and Carboxylic Acids', 'Amines', 'Chemical Bonding and Molecular Structure', 'Chemical Kinetics', 'Classification of Elements and Periodicity in Properties', 'Coordination Compounds', 'Electrochemistry', 'Equilibrium', 'Haloalkanes and Haloarenes', 'Hydrocarbons', 'Organic Chemistry Some Basic Principles and Techniques', 'Redox Reactions', 'Solutions', 'Some Basic Concepts of Chemistry', 'Structure of Atom', 'The d and f Block Elements', 'Thermodynamics', 'p Block Elements']

const SUBJECT_OF = Object.fromEntries([
  ...PHYSICS.map((t) => [t, 'Physics']),
  ...CHEMISTRY.map((t) => [t, 'Chemistry']),
])

/* Every chapter not named above is from the Biology syllabus. */
const subjectOfTopic = (topic) => SUBJECT_OF[topic] ?? 'Biology'

/** Split an options block on (a)(b)(c)(d) or (1)(2)(3)(4), first run only. */
function splitOptions(seg) {
  const digits = [...seg.matchAll(/\((\d)\)/g)]
  const letters = [...seg.matchAll(/\(([a-fA-F])\)/g)]
  const useLetters = letters.length > 0 && (digits.length === 0 || letters[0].index < digits[0].index)
  const marks = useLetters ? letters : digits
  if (!marks.length) return { options: [], style: useLetters ? 'letter' : 'digit' }

  const options = []
  let expected = 0
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i]
    const value = useLetters ? m[1].toLowerCase().charCodeAt(0) - 97 : Number(m[1]) - 1
    if (value !== expected) continue
    const end = i + 1 < marks.length ? marks[i + 1].index : seg.length
    options.push(tidy(seg.slice(m.index + m[0].length, end)))
    expected++
  }
  return { options, style: useLetters ? 'letter' : 'digit' }
}

const answerIndex = (token) => {
  const t = token.trim().toLowerCase()
  if (/^[a-f]$/.test(t)) return t.charCodeAt(0) - 97
  const n = Number(t)
  return Number.isInteger(n) && n >= 1 && n <= 6 ? n - 1 : -1
}

function parseFullPaper(text, meta) {
  const starts = [...text.matchAll(/Question\s+(\d+)\s*:/g)]
  const cut = Math.max(...starts.map((m) => Number(m[1])), 0) <= 180 ? 45 : 50
  const questions = []
  const seen = new Set()
  const skipped = { noAnswer: 0, fewOptions: 0, shortStem: 0, duplicate: 0, table: 0 }

  for (let i = 0; i < starts.length; i++) {
    const from = starts[i].index
    const to = i + 1 < starts.length ? starts[i + 1].index : text.length
    const block = text.slice(from, to)

    const answerAt = block.search(/\bAnswer\s*:\s*\(/i)
    const answerToken = block.match(/\bAnswer\s*:\s*\(([^)]{1,6})\)/i)?.[1]
    const solutionAt = block.search(/\bSolution\s*:/i)
    const optionsAt = block.search(/\bOptions?\s*:/i)

    if (answerAt === -1 || !answerToken) {
      skipped.noAnswer++
      continue
    }

    const stemEnd = optionsAt > -1 && optionsAt < answerAt ? optionsAt : answerAt
    const stem = tidy(block.slice(block.indexOf(':') + 1, stemEnd))
    if (normalisePrompt(stem).length < 12) {
      skipped.shortStem++
      continue
    }
    // A table that extracted as pipes has lost the rows: it cannot be practised.
    if (stem.includes('|')) {
      skipped.table++
      continue
    }

    const optionsEnd = answerAt
    const { options, style } = splitOptions(
      optionsAt > -1 ? block.slice(optionsAt, optionsEnd) : '',
    )
    const answer = style === 'digit' && /^\d$/.test(answerToken.trim()) ? Number(answerToken) - 1 : answerIndex(answerToken)

    const filled = options.filter((o) => o.length > 0)
    if (filled.length < 2 || answer < 0 || answer >= options.length || !options[answer]) {
      skipped.fewOptions++
      continue
    }

    const rawWhy =
      solutionAt > -1 && solutionAt < block.length
        ? cleanBody(block.slice(solutionAt + block.slice(solutionAt).indexOf(':') + 1), 700)
        : ''
    const why = readable(rawWhy) ? rawWhy : ''

    const key = promptHash(stem)
    if (seen.has(key)) {
      skipped.duplicate++
      continue
    }
    seen.add(key)

    questions.push({
      exam: 'neet-ug',
      paperId: meta.id,
      paperName: meta.name,
      year: meta.year,
      number: Number(starts[i][1]),
      subject: subjectByNumber(Number(starts[i][1]), cut),
      topic: '',
      prompt: stem,
      options: options.map((o) => o || '—'),
      answer,
      why,
      key,
    })
  }
  return { questions, skipped }
}

/* ---------------------------------------------------------------- */
/* PrepWiser chapter PDFs: Q-lines plus a trailing answer key        */
/* ---------------------------------------------------------------- */

function parsePrepwiser(text, meta) {
  const keyText = text.slice(Math.max(0, text.search(/Answers? follow/i)))
  const answers = new Map()
  for (const m of keyText.matchAll(/(\d{1,3})\.\s*(\d)\b/g)) {
    const n = Number(m[1])
    if (!answers.has(n)) answers.set(n, Number(m[2]) - 1)
  }

  const heads = [...text.matchAll(/Q(\d+)\s+[^,\n]{2,60}?,?\s*Q(\d+)\s+Step-by-step solution/g)]
  const questions = []
  const skipped = { noAnswer: 0, fewOptions: 0, shortStem: 0, duplicate: 0, table: 0 }
  const seen = new Set()

  for (let i = 0; i < heads.length; i++) {
    const h = heads[i]
    const slug = text.slice(h.index, h.index + 400).match(/prepwiser\.in\/neet\/questions\/([a-z0-9-]+)/)?.[1]
    const slugYear = Number(slug?.match(/neet-(\d{4})/)?.[1] ?? 0) || meta.year
    const from = h.index + h[0].length
    const to = i + 1 < heads.length ? heads[i + 1].index : text.length
    const body = text.slice(from, to)

    const qn = Number(h[1])
    const answer = answers.get(qn)
    if (answer === undefined) {
      skipped.noAnswer++
      continue
    }

    /* The Q-line is followed by its solution link; the stem starts after it. */
    const urlEnd = body.match(/prepwiser\.in\/neet\/questions\/\S+/i)
    const inner = urlEnd ? body.slice(urlEnd.index + urlEnd[0].length) : body
    const { options } = splitOptions(inner)
    const cut = inner.search(/\(\d\)|\([a-fA-F]\)/)
    const stem = tidy(cut > -1 ? inner.slice(0, cut) : inner).replace(/^[›>\s]+/, '')
    if (normalisePrompt(stem).length < 12) {
      skipped.shortStem++
      continue
    }
    if (stem.includes('|')) {
      skipped.table++
      continue
    }

    const filled = options.filter((o) => o.length > 0)
    if (filled.length < 2 || answer >= options.length || !options[answer]) {
      skipped.fewOptions++
      continue
    }

    const key = promptHash(stem)
    if (seen.has(key)) {
      skipped.duplicate++
      continue
    }
    seen.add(key)

    questions.push({
      exam: 'neet-ug',
      paperId: meta.id,
      paperName: meta.name,
      year: slugYear,
      number: qn,
      subject: meta.subject,
      topic: meta.topic,
      prompt: stem,
      options,
      answer,
      why: '',
      slug: slug ?? '',
      key,
    })
  }
  return { questions, skipped }
}

/* ---------------------------------------------------------------- */
/* run                                                               */
/* ---------------------------------------------------------------- */

const FILES = readdirSync(ROOT).filter((f) => f.toLowerCase().endsWith('.pdf'))
const fullPapers = FILES.filter((f) => /^NEET (UG )?(20\d\d|2022|2023).*Question Paper/i.test(f) || /^NEET \d{4} Question Paper/i.test(f))
const prepwiser = FILES.filter((f) => /^PrepWiser_.+_NEET-PYQs\.pdf$/i.test(f))

const yearOf = (name) => Number(name.match(/(20\d\d)/)?.[1] ?? 0) || null

console.log(`pdfs=${FILES.length} fullPapers=${fullPapers.length} chapterSets=${prepwiser.length}\n`)

const bank = []
let fullTotals = { questions: 0, skipped: { noAnswer: 0, fewOptions: 0, shortStem: 0, duplicate: 0, table: 0 } }

for (const name of fullPapers) {
  const text = await textOf(join(ROOT, name))
  const meta = { id: `neet-${yearOf(name)}-full`, name, year: yearOf(name) }
  const { questions, skipped } = parseFullPaper(text, meta)
  Object.keys(fullTotals.skipped).forEach((k) => (fullTotals.skipped[k] += skipped[k]))
  fullTotals.questions += questions.length
  bank.push(...questions)
  const subs = {}
  for (const q of questions) subs[q.subject] = (subs[q.subject] ?? 0) + 1
  console.log(
    `${name.slice(0, 58).padEnd(58)} q=${String(questions.length).padStart(3)}  ${JSON.stringify(subs)}  skipped=${JSON.stringify(skipped)}`,
  )
}

console.log(`\nfull papers: ${fullTotals.questions} questions`)

const chapterStats = new Map()
const chapterBank = []
let chapterQuestions = 0
for (const name of prepwiser) {
  const text = await textOf(join(ROOT, name))
  const topic = name.replace(/^PrepWiser_/i, '').replace(/_NEET-PYQs\.pdf$/i, '').replace(/-/g, ' ')
  const meta = {
    id: `prepwiser-${topic.replace(/\s+/g, '-').toLowerCase()}`,
    name,
    year: null,
    topic,
    subject: subjectOfTopic(topic),
  }
  const { questions } = parsePrepwiser(text, meta)
  chapterBank.push(...questions)
  chapterQuestions += questions.length
  const years = new Set(questions.map((q) => q.year).filter(Boolean))
  chapterStats.set(topic, { topic, questions: questions.length, years: years.size, latest: Math.max(0, ...years), first: Math.min(9999, ...years) })
}

const chapters = [...chapterStats.values()].sort((a, b) => b.questions - a.questions)
console.log(`chapter sets: ${chapterQuestions} questions across ${chapters.length} chapters`)
console.log('\ntop chapters by PYQ count:')
for (const c of chapters.slice(0, 12)) console.log(`  ${String(c.questions).padStart(3)}  ${c.first}-${c.latest}  ${c.topic}`)

/* Repeats by exam year: the same stem printed in more than one NEET sitting. */
const all = [...bank, ...chapterBank]

/*
  Explanations come from two places in these PDFs. The four full papers print
  their working; the chapter sets print only an answer key, but they repeat the
  full papers' questions for 2022-2025, so those questions can borrow the
  working from the paper that printed it. Every borrowed one is marked, and the
  UI names the paper it came from.
*/
const flatText = (s) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const sameOptions = (a, b) => {
  const A = new Set(a.options.map(flatText))
  const B = new Set(b.options.map(flatText))
  let shared = 0
  for (const x of A) if (x && B.has(x)) shared++
  return shared >= 3
}

for (const q of all) if (q.why) q.whySource = 'printed'

const donors = all.filter((q) => q.why)
const donorIndex = new Map()
for (let i = 0; i < donors.length; i++) {
  for (const w of new Set(normalisePrompt(donors[i].prompt).split(' ').filter(Boolean))) {
    if (w.length < 6) continue
    const list = donorIndex.get(w)
    if (list) list.push(i)
    else donorIndex.set(w, [i])
  }
}

let inherited = 0
for (const q of all) {
  if (q.why) continue
  const tokens = new Set(normalisePrompt(q.prompt).split(' ').filter(Boolean))
  const candidates = new Set()
  for (const w of tokens) {
    if (w.length < 6) continue
    for (const i of donorIndex.get(w) ?? []) candidates.add(i)
  }

  let best = null
  let bestSim = 0
  for (const i of candidates) {
    const donor = donors[i]
    if (donor.paperId === q.paperId) continue
    const sim = similarity(q.prompt, donor.prompt)
    // Near-identical wording plus three of four options is the same question;
    // anything looser risks attaching working that does not answer this stem.
    if (sim < 0.9 || sim <= bestSim || !sameOptions(q, donor)) continue
    best = donor
    bestSim = sim
  }

  if (best) {
    q.why = best.why
    q.whySource = 'shared'
    q.whyFromPaper = best.paperId
    inherited++
  }
}

console.log(`explanations: ${donors.length} printed in the papers, ${inherited} borrowed from the same question in another paper`)

/*
  The full papers never name a chapter; the chapter sets do. Without this the
  mock test's chapter analysis collapses into one "unclassified" bucket, so a
  full-paper question borrows the chapter of the same question in a set.
*/
const topicDonors = all.filter((q) => q.topic)
const topicIndex = new Map()
for (let i = 0; i < topicDonors.length; i++) {
  for (const w of new Set(normalisePrompt(topicDonors[i].prompt).split(' ').filter(Boolean))) {
    if (w.length < 6) continue
    const list = topicIndex.get(w)
    if (list) list.push(i)
    else topicIndex.set(w, [i])
  }
}

let taggedChapters = 0
for (const q of all) {
  if (q.topic) continue
  const tokens = new Set(normalisePrompt(q.prompt).split(' ').filter(Boolean))
  const candidates = new Set()
  for (const w of tokens) {
    if (w.length < 6) continue
    for (const i of topicIndex.get(w) ?? []) candidates.add(i)
  }

  let best = null
  let bestSim = 0
  for (const i of candidates) {
    const donor = topicDonors[i]
    if (donor.subject !== q.subject) continue
    const sim = similarity(q.prompt, donor.prompt)
    if (sim < 0.85 || sim <= bestSim) continue
    best = donor
    bestSim = sim
  }

  if (best) {
    q.topic = best.topic
    taggedChapters++
  }
}

const stillUnclassified = all.filter((q) => !q.topic).length
console.log(`chapters: ${taggedChapters} full-paper questions took a chapter from a matching set, ${stillUnclassified} still unnamed`)

const byKey = new Map()
for (const q of all) {
  const k = q.key || promptHash(q.prompt)
  if (!byKey.has(k)) byKey.set(k, { years: new Set(), papers: new Set(), q })
  const g = byKey.get(k)
  if (q.year) g.years.add(q.year)
  g.papers.add(q.paperId)
}
const acrossYears = [...byKey.values()].filter((g) => g.years.size > 1).sort((a, b) => b.years.size - a.years.size)
console.log(`\nquestions printed in more than one exam year: ${acrossYears.length}`)
for (const g of acrossYears.slice(0, 5)) {
  console.log(`  ${g.years.size} years (${[...g.years].sort().join(', ')})  ${g.q.prompt.slice(0, 88)}`)
}
const withWhy = all.filter((q) => q.why).length
console.log(`readable solutions: ${withWhy} of ${all.length}`)

/*
  Near-duplicates are what actually recur in NEET: the same idea with different
  numbers. Use the app's own grouping so the report matches what students see.
*/
const rows = rankBank(all)
const repeated = rows.filter((r) => r.repeats > 1)
console.log(`\ngroups after near-duplicate merging: ${rows.length}`)
console.log(`questions that repeat across papers: ${repeated.length}`)
for (const r of repeated.slice(0, 5)) {
  console.log(`  x${r.repeats} [${r.papers.map((p) => p.year ?? '?').join(', ')}] ${r.question.prompt.slice(0, 80)}`)
}
const bySubject = {}
for (const q of all) bySubject[q.subject] = (bySubject[q.subject] ?? 0) + 1
console.log(`subjects: ${JSON.stringify(bySubject)}`)

console.log('\nsample question:')
const sample = bank.find((q) => q.why.length > 80) ?? bank[0]
if (sample) console.log(JSON.stringify(sample, null, 2).slice(0, 1400))

if (WRITE) {
  mkdirSync(join(ROOT, 'public/data'), { recursive: true })
  /*
    Compact shape: each paper's name and year are stored once in a table, and a
    question is a positional row instead of an object with eight repeated keys.
    The app recomputes id and key, so neither is shipped.
  */
  const paperIndex = new Map()
  const papers = []
  for (const q of all) {
    if (!paperIndex.has(q.paperId)) {
      paperIndex.set(q.paperId, papers.length)
      papers.push([q.paperId, q.year ?? null, q.paperName])
    }
  }
  const rows = all.map((q) => {
    const row = [paperIndex.get(q.paperId), q.subject, q.topic, q.prompt, q.options, q.answer]
    // Most questions have no readable solution: leave the slot off entirely.
    if (q.why) {
      row.push(q.why)
      // 1 marks working taken from the same question in another paper, so the
      // UI can say where it came from instead of implying the paper printed it.
      if (q.whySource === 'shared') row.push(1, paperIndex.get(q.whyFromPaper) ?? 0)
    }
    return row
  })

  const json = JSON.stringify({ v: 1, papers, rows })
  const bankPath = join(ROOT, 'public/data/neet-bank.json')
  writeFileSync(bankPath, json)

  /*
    The asset layer transparently decompresses any *.gz it serves, so a
    neet-bank.json.gz arrives in the browser as the full 1 MB anyway. The
    compressed copy therefore carries a `.jsonz` extension and the page inflates
    it with DecompressionStream; the plain JSON stays beside it as the fallback.
  */
  const gzPath = join(ROOT, 'public/data/neet-bank.jsonz')
  writeFileSync(gzPath, Bun.gzipSync(json, { level: 9 }))
  writeFileSync(join(ROOT, 'public/data/neet-topics.json'), JSON.stringify(chapters))

  const gzBytes = statSync(gzPath).size
  console.log(
    `\nwrote neet-bank.json ${(json.length / 1024).toFixed(0)} KB (fetch uses ${(gzBytes / 1024).toFixed(0)} KB gzipped), ` +
      `${all.length} questions in ${papers.length} papers, and neet-topics.json (${chapters.length})`,
  )
}
