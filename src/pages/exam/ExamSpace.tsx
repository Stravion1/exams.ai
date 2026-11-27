import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BookOpenCheck, Clock, ListChecks, TriangleAlert } from 'lucide-react'

import { Badge, Eyebrow } from '../../components/Badge'
import { Link } from '../../lib/router'
import { Notice } from '../../components/Notice'
import { Segmented } from '../../components/Segmented'
import { useToast } from '../../components/Toast'
import { postJson } from '../../lib/api'
import {
  bankStats,
  chunkText,
  deleteExam,
  deletePaper,
  deleteQuestionsForPaper,
  listPapers,
  listQuestions,
  newId,
  promptHash,
  readText,
  rankBank,
  savePaper,
  saveQuestions,
  saveText,
  yearFromName,
} from '../../lib/archive'
import type { BankQuestion, Paper } from '../../lib/archive'
import { EXAM_BY_SLUG } from '../../lib/exams'
import { extractText } from '../../lib/pdf'
import { MAX_FILES } from '../../shared/validate'
import { AskTab } from './AskTab'
import { BankTab } from './BankTab'
import { PapersTab } from './PapersTab'
import { PracticeTab } from './PracticeTab'

export type Job = { name: string; stage: string; pct: number }

type Tab = 'papers' | 'bank' | 'practice' | 'ask'

type Mined = { subject: string; topic: string; prompt: string; options: string[]; answer: number; why: string }

/**
 * One exam's workspace: upload past papers, mine them into a question bank,
 * practise from it and ask about it. Papers and questions live in IndexedDB;
 * the model call for each chunk happens in the Worker.
 */
export function ExamSpace({ slug }: { slug: string }) {
  const exam = EXAM_BY_SLUG[slug]
  const [tab, setTab] = useState<Tab>('papers')
  const [papers, setPapers] = useState<Paper[]>([])
  const [questions, setQuestions] = useState<BankQuestion[]>([])
  const [jobs, setJobs] = useState<Record<string, Job>>({})
  const [busy, setBusy] = useState(false)
  const [aiReady, setAiReady] = useState<boolean | null>(null)
  const toast = useToast()

  const reload = useCallback(async () => {
    if (!exam) return
    const [p, q] = await Promise.all([listPapers(exam.slug), listQuestions(exam.slug)])
    setPapers(p)
    setQuestions(q)
  }, [exam])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    let live = true
    fetch('/api/ai/status')
      .then((r) => (r.ok ? (r.json() as Promise<{ configured?: boolean }>) : null))
      .then((d) => live && d && setAiReady(!!d.configured))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  const rows = useMemo(() => rankBank(questions), [questions])
  const stats = useMemo(() => bankStats(rows), [rows])

  if (!exam) {
    return (
      <div className="mx-auto max-w-xl px-5 py-24 text-center">
        <TriangleAlert aria-hidden className="mx-auto size-8 text-amber" />
        <h1 className="mt-4 text-[24px] font-medium">That exam is not in the catalogue</h1>
        <p className="mt-2 text-[15px] text-muted">Pick one from the list and its workspace will open.</p>
        <Link href="/exams" className="mt-6 inline-flex items-center gap-2 text-[14px] font-medium text-leaf-text">
          <ArrowLeft aria-hidden className="size-4" /> All exams
        </Link>
      </div>
    )
  }

  const dropJob = (id: string) =>
    setJobs((j) => {
      const next = { ...j }
      delete next[id]
      return next
    })

  async function runMiner(paper: Paper, text: string) {
    const chunks = chunkText(text, 12_000, 30)
    if (!chunks.length) {
      const failed: Paper = { ...paper, status: 'error', error: 'No readable text. A scanned PDF needs OCR, which this build does not do yet.' }
      await savePaper(failed)
      setPapers((p) => p.map((x) => (x.id === paper.id ? failed : x)))
      dropJob(paper.id)
      return
    }

    const mined: BankQuestion[] = []
    let failure = ''

    for (let i = 0; i < chunks.length; i++) {
      setJobs((j) => ({
        ...j,
        [paper.id]: { name: paper.name, stage: `Finding questions in part ${i + 1} of ${chunks.length}`, pct: 15 + Math.round((i / chunks.length) * 85) },
      }))
      const res = await postJson<{ questions: Mined[] }>('/api/analyze', {
        exam: paper.exam,
        examName: exam.name,
        paper: paper.name,
        text: chunks[i],
      })
      if (!res.ok) {
        failure = res.error
        break
      }
      for (const q of res.data.questions) {
        mined.push({
          id: `${paper.id}:${mined.length}`,
          exam: paper.exam,
          paperId: paper.id,
          paperName: paper.name,
          year: paper.year,
          subject: q.subject,
          topic: q.topic,
          prompt: q.prompt,
          options: q.options,
          answer: q.answer,
          why: q.why,
          key: promptHash(q.prompt),
        })
      }
    }

    await deleteQuestionsForPaper(paper.id)
    if (mined.length) await saveQuestions(mined)

    const finished: Paper = {
      ...paper,
      chars: text.length,
      status: mined.length ? 'done' : 'error',
      questionCount: mined.length,
      error: failure ? `${failure}${mined.length ? ` (${mined.length} questions kept from the parts that worked)` : ''}` : undefined,
    }
    await savePaper(finished)
    setPapers((p) => p.map((x) => (x.id === paper.id ? finished : x)))
    dropJob(paper.id)
    await reload()
    if (mined.length) toast(`${mined.length} questions added from ${paper.name}`)
  }

  async function addFiles(files: File[]) {
    if (!exam) return
    const list = files.slice(0, MAX_FILES)
    if (files.length > MAX_FILES) toast(`Only the first ${MAX_FILES} files were added`)
    setBusy(true)
    for (const file of list) {
      const id = newId()
      const paper: Paper = {
        id,
        exam: exam.slug,
        name: file.name,
        size: file.size,
        addedAt: new Date().toISOString(),
        chars: 0,
        pages: null,
        year: yearFromName(file.name),
        status: 'extracting',
        questionCount: 0,
      }
      await savePaper(paper)
      setPapers((p) => [paper, ...p])
      setJobs((j) => ({ ...j, [id]: { name: file.name, stage: 'Reading pages', pct: 2 } }))
      try {
        const { text, pages } = await extractText(file, (done, total) =>
          setJobs((j) => ({ ...j, [id]: { name: file.name, stage: `Reading page ${done} of ${total}`, pct: Math.round((done / total) * 15) } })),
        )
        await saveText(id, text)
        const analysing: Paper = { ...paper, pages, chars: text.length, status: 'analysing' }
        await savePaper(analysing)
        setPapers((p) => p.map((x) => (x.id === id ? analysing : x)))
        await runMiner(analysing, text)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'That file could not be read.'
        const failed: Paper = { ...paper, status: 'error', error: message }
        await savePaper(failed)
        setPapers((p) => p.map((x) => (x.id === id ? failed : x)))
        dropJob(id)
      }
    }
    setBusy(false)
  }

  async function analyseAgain(paper: Paper) {
    const text = await readText(paper.id)
    if (!text) {
      toast('The text of that paper is no longer stored. Upload it again.')
      return
    }
    await runMiner({ ...paper, status: 'analysing', questionCount: 0 }, text)
  }

  async function removePaper(paper: Paper) {
    await deletePaper(paper.id)
    await reload()
    toast(`${paper.name} removed`)
  }

  async function clearExam() {
    await deleteExam(exam!.slug)
    await reload()
    toast('All papers removed for this exam')
  }

  return (
    <div className="pb-24">
      <header className="border-b border-line px-5 pb-8 pt-10 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-6xl">
          <Link href="/exams" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-fg">
            <ArrowLeft aria-hidden className="size-3.5" /> All exams
          </Link>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <Eyebrow>{exam.category}</Eyebrow>
              <h1 className="mt-3 text-[clamp(30px,4.4vw,52px)] font-normal leading-tight tracking-[-0.04em]">{exam.name}</h1>
              <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">{exam.about}</p>
              <p className="mt-2 text-[13px] text-faint">Conducted by {exam.authority}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {exam.pattern.questions ? (
                <Badge>
                  <ListChecks aria-hidden className="mr-1 size-3.5" />
                  {exam.pattern.questions} questions
                </Badge>
              ) : null}
              {exam.pattern.minutes ? (
                <Badge>
                  <Clock aria-hidden className="mr-1 size-3.5" />
                  {exam.pattern.minutes} min
                </Badge>
              ) : null}
              <Badge tone="leaf">
                <BookOpenCheck aria-hidden className="mr-1 size-3.5" />
                {stats.total} in bank
              </Badge>
            </div>
          </div>

          <dl className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Papers" value={papers.length} />
            <Stat label="Questions mined" value={stats.total} />
            <Stat label="Repeated questions" value={stats.repeats} accent />
            <Stat label="Subjects" value={stats.subjects.length} />
          </dl>

          <div className="mt-7">
            <Segmented
              label="Exam workspace"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'papers', label: `Papers${papers.length ? ` (${papers.length})` : ''}` },
                { value: 'bank', label: `Question bank${stats.total ? ` (${stats.total})` : ''}` },
                { value: 'practice', label: 'Practice' },
                { value: 'ask', label: 'Ask' },
              ]}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:px-12">
        {aiReady === false && (
          <Notice tone="error" className="mb-6">
            <strong className="font-semibold">No model connected.</strong> Add <code className="rounded bg-black/30 px-1.5 py-0.5">AI_API_KEY</code> to
            <code className="mx-1 rounded bg-black/30 px-1.5 py-0.5">.dev.vars</code> (or run <code className="rounded bg-black/30 px-1.5 py-0.5">wrangler secret put AI_API_KEY</code>)
            and restart. Reading and mining papers needs the model.
          </Notice>
        )}

        {tab === 'papers' && (
          <PapersTab
            exam={exam}
            papers={papers}
            jobs={jobs}
            busy={busy}
            aiReady={aiReady !== false}
            onFiles={addFiles}
            onDelete={removePaper}
            onReanalyse={analyseAgain}
            onClear={clearExam}
          />
        )}
        {tab === 'bank' && <BankTab rows={rows} exam={exam} onPractise={() => setTab('practice')} />}
        {tab === 'practice' && <PracticeTab rows={rows} onBrowse={() => setTab('bank')} />}
        {tab === 'ask' && <AskTab exam={exam} rows={rows} />}
      </div>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-white/3 px-4 py-3">
      <dt className="text-[12px] text-faint">{label}</dt>
      <dd className={accent ? 'text-[22px] font-medium tabular-nums text-leaf-text' : 'text-[22px] font-medium tabular-nums'}>{value}</dd>
    </div>
  )
}
