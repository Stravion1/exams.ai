import { useMemo, useState } from 'react'
import { ListChecks, Repeat2, Search } from 'lucide-react'

import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { Checkbox } from '../../components/Field'
import { EmptyState } from '../../components/EmptyState'
import type { BankRow } from '../../lib/archive'
import { bankStats } from '../../lib/archive'
import type { Exam } from '../../lib/exams'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

export function BankTab({ rows, exam, onPractise }: { rows: BankRow[]; exam: Exam; onPractise: () => void }) {
  const [q, setQ] = useState('')
  const [subject, setSubject] = useState('All')
  const [repeatsOnly, setRepeatsOnly] = useState(false)
  const stats = useMemo(() => bankStats(rows), [rows])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (subject !== 'All' && r.question.subject !== subject) return false
      if (repeatsOnly && r.repeats < 2) return false
      if (!needle) return true
      return r.question.prompt.toLowerCase().includes(needle) || r.question.topic.toLowerCase().includes(needle)
    })
  }, [rows, q, subject, repeatsOnly])

  if (!rows.length) {
    return (
      <EmptyState
        icon={<ListChecks aria-hidden className="size-6" />}
        title="The bank is empty"
        body={`Add ${exam.name} papers in the Papers tab. Every question the model finds is stored here with its answer, and questions that appear in more than one paper are grouped and marked.`}
      />
    )
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Search questions</span>
          <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a question or topic…" className="field h-11 pl-10" />
        </label>
        <label className="grid gap-1">
          <span className="sr-only">Subject</span>
          <select value={subject} onChange={(e) => setSubject(e.target.value)} className="field h-11 min-w-[160px]">
            <option value="All">All subjects</option>
            {stats.subjects.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name} ({s.count})
              </option>
            ))}
          </select>
        </label>
        <Checkbox label={`Repeated only (${stats.repeats})`} checked={repeatsOnly} onChange={(e) => setRepeatsOnly(e.target.checked)} className="pb-2.5" />
        <Button variant="leaf" className="h-11" icon={<ListChecks className="size-4" />} onClick={onPractise} disabled={!filtered.length}>
          Practise these
        </Button>
      </div>

      <p className="text-[13px] text-muted" aria-live="polite">
        {filtered.length} of {rows.length} questions · most important first
      </p>

      <ol className="grid gap-3">
        {filtered.map((row, i) => (
          <BankItem key={row.question.id} row={row} index={i + 1} />
        ))}
      </ol>
    </div>
  )
}

function BankItem({ row, index }: { row: BankRow; index: number }) {
  const q = row.question
  const seen = row.papers.map((p) => p.year ?? p.paperName).join(' · ')
  return (
    <li className="rounded-[20px] border border-line bg-white/3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] tabular-nums text-faint">{index}</span>
        <Badge>{q.subject}</Badge>
        {q.topic ? <Badge tone="neutral">{q.topic}</Badge> : null}
        {row.repeats > 1 ? (
          <Badge tone="amber" icon={<Repeat2 aria-hidden className="size-3.5" />}>
            In {row.repeats} papers: {seen}
          </Badge>
        ) : (
          <Badge tone="leaf">Single paper</Badge>
        )}
      </div>

      <p className="mt-3 text-[15.5px] leading-snug">{q.prompt}</p>

      <details className="group mt-3">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-[13.5px] font-medium text-leaf-text">
          <span className="group-open:hidden">Show answer and why</span>
          <span className="hidden group-open:inline">Hide answer</span>
        </summary>
        <ol className="mt-3 grid gap-1.5">
          {q.options.map((o, n) => (
            <li
              key={`${q.id}-${n}`}
              className={
                n === q.answer
                  ? 'flex items-start gap-2.5 rounded-xl border border-leaf/40 bg-leaf-soft px-3 py-2 text-[14px]'
                  : 'flex items-start gap-2.5 rounded-xl border border-line px-3 py-2 text-[14px] text-soft'
              }
            >
              <span className="text-[12.5px] font-medium text-muted">{LETTERS[n]}</span>
              <span>{o}</span>
              {n === q.answer ? <span className="ml-auto shrink-0 text-[12px] text-leaf-text">correct</span> : null}
            </li>
          ))}
        </ol>
        {q.why ? <p className="mt-3 text-[13.5px] leading-relaxed text-muted">{q.why}</p> : null}
        <p className="mt-2 text-[12px] text-faint">From {q.paperName}</p>
      </details>
    </li>
  )
}
