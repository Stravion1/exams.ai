import { useMemo, useState } from 'react'
import { ArrowRight, BookOpenCheck, Clock, ListChecks, Search } from 'lucide-react'

import { Badge, Eyebrow } from '../components/Badge'
import { Link } from '../lib/router'
import { CATEGORIES, searchExams } from '../lib/exams'
import type { Exam, ExamCategory } from '../lib/exams'
import { cx } from '../lib/cx'

/** The exam catalogue: every exam the app can build a question bank for. */
export function Exams() {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<ExamCategory | 'All'>('All')
  const results = useMemo(() => searchExams(q, cat), [q, cat])

  return (
    <div className="pb-24">
      <section className="border-b border-line px-5 pb-12 pt-14 sm:px-8 lg:px-12 lg:pb-16 lg:pt-20">
        <div className="mx-auto max-w-6xl">
          <Eyebrow>Exam workspaces</Eyebrow>
          <h1 className="mt-5 max-w-3xl text-[clamp(34px,5vw,64px)] font-normal leading-[1.02] tracking-[-0.05em]">
            Pick your exam. Add the papers. Get the bank.
          </h1>
          <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-muted">
            Every exam has its own workspace. Upload past papers with answer keys and the AI reads them, extracts every
            question, marks the ones that repeat across years, and turns the whole bank into practice tests.
          </p>

          <div className="mt-9 flex flex-col gap-4">
            <label className="relative block max-w-xl">
              <span className="sr-only">Search exams</span>
              <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-4.5 -translate-y-1/2 text-faint" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search NEET, JEE, CAT, SSC, UPSC, banking, state PSC…"
                className="field h-13 pl-12"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {(['All', ...CATEGORIES] as (ExamCategory | 'All')[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCat(c)}
                  aria-pressed={cat === c}
                  className={cx(
                    'min-h-10 rounded-full border px-4 text-[13.5px] transition-colors',
                    cat === c ? 'border-leaf/50 bg-leaf-soft text-fg' : 'border-line-strong bg-white/4 text-soft hover:text-fg',
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-12 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-6xl">
          <p className="text-[13.5px] text-muted" aria-live="polite">
            {results.length} {results.length === 1 ? 'exam' : 'exams'}
            {cat !== 'All' ? ` in ${cat}` : ''}
            {q ? ` matching “${q}”` : ''}
          </p>

          {results.length === 0 ? (
            <div className="mt-6 rounded-[26px] border border-dashed border-line-strong px-6 py-14 text-center">
              <h2 className="text-[19px] font-medium">No exam matches that</h2>
              <p className="mx-auto mt-2 max-w-md text-[14.5px] text-muted">
                Try NEET, JEE, CAT, SSC, UPSC or banking. More exams are added by putting one entry in
                <code className="mx-1 rounded bg-white/8 px-1.5 py-0.5 text-[13px]">src/lib/exams.ts</code>.
              </p>
            </div>
          ) : (
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((e) => (
                <li key={e.slug}>
                  <ExamCard exam={e} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}

function ExamCard({ exam }: { exam: Exam }) {
  return (
    <Link
      href={`/exams/${exam.slug}`}
      className="group flex h-full flex-col rounded-[24px] border border-line bg-white/3 p-5 transition-colors hover:border-leaf/40 hover:bg-white/5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-[20px] font-medium tracking-[-0.03em]">{exam.name}</h2>
          <p className="mt-1 line-clamp-2 text-[13px] text-faint">{exam.authority}</p>
        </div>
        <Badge tone={exam.category === 'Medical' ? 'leaf' : 'neutral'} className="shrink-0">
          {exam.category}
        </Badge>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] text-muted">
        {exam.pattern.questions ? (
          <span className="inline-flex items-center gap-1.5">
            <ListChecks aria-hidden className="size-3.5" /> {exam.pattern.questions} Q
          </span>
        ) : null}
        {exam.pattern.minutes ? (
          <span className="inline-flex items-center gap-1.5">
            <Clock aria-hidden className="size-3.5" /> {exam.pattern.minutes} min
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1.5">
          <BookOpenCheck aria-hidden className="size-3.5" /> {exam.years.length} paper years
        </span>
      </div>

      <p className="mt-3 line-clamp-2 text-[13.5px] leading-relaxed text-soft">{exam.about}</p>

      <span className="mt-4 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-leaf-text">
        Open workspace
        <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  )
}
