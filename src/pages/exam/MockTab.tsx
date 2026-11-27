import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Clock3, Flag, RotateCcw, Send } from 'lucide-react'

import { Button } from '../../components/Button'
import { EmptyState } from '../../components/EmptyState'
import { ProgressBar, ScoreRing } from '../../components/Progress'
import type { BankRow } from '../../lib/archive'
import { cx } from '../../lib/cx'
import type { Exam } from '../../lib/exams'
import { Explanation } from './Explanation'

/*
  A full mock in the exam's own printed pattern: its question count, its
  duration and its marking (+4 correct, -1 wrong, 0 unattempted in NEET).

  Questions are drawn from the bank in priority order inside each subject, so a
  paper is always the most repeated and most-asked material available rather
  than a random sample. Nothing here calls a model: the bank already holds the
  answer to every question it can ask.
*/

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

/* NEET prints Biology at double weight, so its split is spelled out. */
const NEET_SECTIONS = [
  { subject: 'Physics', count: 45 },
  { subject: 'Chemistry', count: 45 },
  { subject: 'Biology', count: 90 },
]

/** Divide the paper's questions as evenly as possible over its subjects. */
const spread = (subjects: readonly string[], total: number) => {
  const each = Math.floor(total / Math.max(1, subjects.length))
  return subjects.map((subject, i) => ({ subject, count: i === subjects.length - 1 ? total - each * (subjects.length - 1) : each }))
}

/**
 * The paper this exam sets. Exams whose shape changes every year (JEE Advanced,
 * GATE) print no fixed count, so they get no mock rather than a NEET paper
 * wearing their name.
 */
function patternFor(exam: Exam) {
  const { questions, minutes, marks } = exam.pattern
  if (!questions || !minutes) return null
  // `marks` is the whole paper's total (NEET: 720), so score per question comes
  // from dividing it by the question count. Both NEET and JEE Main print +4/-1.
  const perQuestion = marks ? Math.round(marks / questions) : 4
  return {
    minutes,
    marks: perQuestion,
    // A paper that prints no negative marking gets none here either.
    penalty: exam.pattern.negative ? -1 : 0,
    sections: exam.slug === 'neet-ug' ? NEET_SECTIONS.map((s) => ({ ...s })) : spread(exam.subjects, questions),
  }
}

type Phase = 'setup' | 'running' | 'result'

const clock = (seconds: number) => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

export function MockTab({ rows, aiReady, exam }: { rows: BankRow[]; aiReady: boolean; exam: Exam }) {
  const pattern = useMemo(() => patternFor(exam), [exam])
  const [phase, setPhase] = useState<Phase>('setup')
  const [deck, setDeck] = useState<BankRow[]>([])
  const [answers, setAnswers] = useState<(number | null)[]>([])
  const [index, setIndex] = useState(0)
  const [deadline, setDeadline] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [usedSeconds, setUsedSeconds] = useState(0)
  const palette = useRef<HTMLDivElement>(null)

  /*
    A question printed twice with two different answers is not safe to mark, so
    it never reaches a paper.
  */
  const usable = useMemo(() => rows.filter((r) => !r.question.keyConflict), [rows])
  const disputed = rows.length - usable.length

  const available = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of usable) counts.set(r.question.subject, (counts.get(r.question.subject) ?? 0) + 1)
    return (pattern?.sections ?? []).map((s) => ({ ...s, have: counts.get(s.subject) ?? 0 }))
  }, [usable, pattern])

  const short = available.find((s) => s.have < s.count)
  const canStart = usable.length > 0 && !short

  useEffect(() => {
    if (phase !== 'running') return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [phase])

  const left = Math.max(0, Math.round((deadline - now) / 1000))

  useEffect(() => {
    if (phase !== 'running' || left > 0 || !pattern) return
    setUsedSeconds(pattern.minutes * 60)
    setPhase('result')
  }, [left, phase, pattern])

  function start() {
    if (!pattern) return
    const picked: BankRow[] = []
    for (const section of pattern.sections) {
      picked.push(...usable.filter((r) => r.question.subject === section.subject).slice(0, section.count))
    }
    setDeck(picked)
    setAnswers(new Array(picked.length).fill(null))
    setIndex(0)
    setDeadline(Date.now() + pattern.minutes * 60 * 1000)
    setNow(Date.now())
    setPhase('running')
  }

  function finish() {
    const seconds = (pattern?.minutes ?? 0) * 60
    setUsedSeconds(Math.min(seconds, Math.max(0, seconds - left)))
    setPhase('result')
  }

  if (!pattern) {
    return (
      <EmptyState
        icon={<Flag aria-hidden className="size-6" />}
        title="No fixed paper to mock"
        body={`${exam.name} does not print a fixed question count or duration, so there is no full paper to build here yet. Practise from the bank instead.`}
      />
    )
  }

  if (!rows.length) {
    return (
      <EmptyState
        icon={<Flag aria-hidden className="size-6" />}
        title="No questions to build a paper from"
        body={`A mock needs the bank. Upload ${exam.short} papers with their answer keys so there are enough questions per subject.`}
      />
    )
  }

  if (phase === 'setup') {
    const total = deck.length || pattern.sections.reduce((n, s) => n + s.count, 0)
    return (
      <div className="grid gap-6">
        <div className="glass rounded-[28px] p-6 sm:p-8">
          <h2 className="text-[22px] font-medium tracking-[-0.03em]">Full mock test</h2>
          <p className="mt-1.5 max-w-2xl text-[14.5px] text-muted">
            One paper in the real pattern: {pattern.minutes} minutes, +{pattern.marks} for a correct answer, {pattern.penalty}{' '}
            for a wrong one, nothing for a blank.
          </p>
          {disputed > 0 && (
            <p className="mt-2 text-[13px] text-faint">
              {disputed} questions sit in both a paper and a chapter set that disagree on the answer, so they are left out of mocks.
            </p>
          )}

          <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {available.map((s) => (
              <div key={s.subject} className="rounded-2xl border border-line bg-white/3 px-4 py-3">
                <dt className="text-[12px] text-faint">{s.subject}</dt>
                <dd className="text-[20px] font-medium tabular-nums">
                                    {s.count}{' '}
                  <span className="text-[12px] font-normal text-faint">of {s.have} in bank</span>
                </dd>
              </div>
            ))}
            <div className="rounded-2xl border border-line bg-white/3 px-4 py-3">
              <dt className="text-[12px] text-faint">Total</dt>
              <dd className="text-[20px] font-medium tabular-nums">{total}</dd>
            </div>
          </dl>

          <p className="mt-4 text-[13px] text-muted">
            Questions are picked most-important first inside each subject, so the paper is the highest-value material in your bank:
            repeats first, then the chapters that keep appearing, then the most recent.
          </p>
          {short ? (
            <p className="mt-2 text-[13px] text-amber">
              {short.subject} needs {short.count} questions and the bank has {short.have}. Add more papers for that subject first.
            </p>
          ) : null}

          <Button variant="paper" size="lg" className="mt-6" iconRight={<Clock3 className="size-4" />} disabled={!canStart} onClick={start}>
            Start the {pattern.minutes}-minute paper
          </Button>
        </div>
      </div>
    )
  }

  if (phase === 'running' && deck[index]) {
    const row = deck[index]
    const q = row.question
    const answered = answers.filter((a) => a !== null).length
    return (
      <div className="grid gap-5">
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-[20px] border border-line bg-[#0d1210]/90 p-3 backdrop-blur">
          <span className={cx('font-medium tabular-nums', left < 300 ? 'text-danger' : 'text-fg')}>{clock(left)}</span>
          <ProgressBar label="Answered" value={answered} max={deck.length} className="min-w-[140px] flex-1" />
          <span className="text-[13px] tabular-nums text-muted">
            {answered} of {deck.length} answered
          </span>
          <Button variant="leaf" icon={<Send className="size-4" />} onClick={finish}>
            Submit paper
          </Button>
        </div>

        <fieldset className="glass rounded-[28px] p-6 sm:p-8">
          <legend className="sr-only">{q.prompt}</legend>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-line-strong px-3 py-1 text-[12px] text-soft">
              Q{index + 1} · {q.subject}
            </span>
            {q.topic ? <span className="rounded-full border border-line-strong px-3 py-1 text-[12px] text-muted">{q.topic}</span> : null}
          </div>
          <p className="mt-4 text-[clamp(19px,2.4vw,24px)] leading-snug tracking-[-0.02em]">{q.prompt}</p>

          <div className="mt-6 grid gap-2.5">
            {q.options.map((option, n) => (
              <label
                key={`${q.id}-${n}`}
                className={cx(
                  'flex min-h-13 cursor-pointer items-center gap-3 rounded-[16px] border px-4 py-2.5 text-[15px] transition-colors',
                  answers[index] === n ? 'border-leaf/50 bg-white/8 text-fg' : 'border-line-strong bg-white/3 text-soft hover:border-leaf/30',
                )}
              >
                <input
                  type="radio"
                  name={`mock-${index}`}
                  className="sr-only"
                  checked={answers[index] === n}
                  onChange={() =>
                    setAnswers((a) => {
                      const next = [...a]
                      next[index] = n
                      return next
                    })
                  }
                />
                <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-line-strong text-[12.5px]">{LETTERS[n]}</span>
                {option}
              </label>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              <Button variant="glass" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
                Previous
              </Button>
              <Button variant="glass" disabled={index >= deck.length - 1} onClick={() => setIndex((i) => Math.min(deck.length - 1, i + 1))}>
                Next
              </Button>
            </div>
            {answers[index] !== null ? (
              <button
                type="button"
                className="text-[13px] text-muted underline-offset-2 hover:text-fg hover:underline"
                onClick={() =>
                  setAnswers((a) => {
                    const next = [...a]
                    next[index] = null
                    return next
                  })
                }
              >
                Clear this answer
              </button>
            ) : null}
          </div>
        </fieldset>

        <div ref={palette} className="rounded-[22px] border border-line bg-white/2 p-4">
          <p className="mb-3 text-[12.5px] text-faint">Jump to a question</p>
          <div className="grid grid-cols-10 gap-1.5 sm:grid-cols-[repeat(15,minmax(0,1fr))]">
            {deck.map((r, i) => (
              <button
                key={r.question.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-current={i === index ? 'true' : undefined}
                aria-label={`Question ${i + 1}${answers[i] === null ? ', unanswered' : ', answered'}`}
                className={cx(
                  'h-8 rounded-lg border text-[12px] tabular-nums transition-colors',
                  i === index
                    ? 'border-leaf bg-leaf-soft text-fg'
                    : answers[i] === null
                      ? 'border-line text-faint hover:text-fg'
                      : 'border-leaf/30 bg-leaf/10 text-leaf-text',
                )}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  /* result */
  let correct = 0
  let wrong = 0
  let blank = 0
  for (let i = 0; i < deck.length; i++) {
    const given = answers[i]
    if (given === null || given === undefined) blank++
    else if (given === deck[i].question.answer) correct++
    else wrong++
  }
  const score = correct * pattern.marks + wrong * pattern.penalty
  const max = deck.length * pattern.marks

  const bySubject = pattern.sections.map((s) => {
    const items = deck.map((r, i) => ({ r, i })).filter(({ r }) => r.question.subject === s.subject)
    const got = items.filter(({ r, i }) => answers[i] === r.question.answer).length
    const missed = items.filter(({ r, i }) => answers[i] !== null && answers[i] !== undefined && answers[i] !== r.question.answer).length
    return { subject: s.subject, asked: items.length, got, missed }
  })

  // Chapter-wise breakdown of everything answered wrong.
  const chapters = new Map<string, { chapter: string; subject: string; wrong: BankRow[]; asked: number }>()
  for (let i = 0; i < deck.length; i++) {
    const row = deck[i]
    const key = `${row.question.subject}|${row.question.topic || 'unknown'}`
    if (!chapters.has(key)) {
      chapters.set(key, {
        // The papers do not always name a chapter; say so rather than invent one.
        chapter: row.question.topic || 'Chapter not named in the paper',
        subject: row.question.subject,
        wrong: [],
        asked: 0,
      })
    }
    const bucket = chapters.get(key)!
    bucket.asked++
    const given = answers[i]
    if (given !== null && given !== undefined && given !== row.question.answer) bucket.wrong.push(row)
  }
  const weak = [...chapters.values()].filter((c) => c.wrong.length > 0).sort((a, b) => b.wrong.length - a.wrong.length)

  return (
    <div className="grid gap-6">
      <div className="glass grid justify-items-center rounded-[28px] p-8 text-center">
        <ScoreRing value={Math.max(0, score)} max={max} label={`${score} out of ${max}`} />
        <h2 className="mt-6 text-[26px] font-normal tracking-[-0.04em]">
          {score >= max * 0.75 ? 'That is a strong paper' : score >= max * 0.5 ? 'A workable score' : 'Plenty to gain here'}
        </h2>
        <p className="mt-2 max-w-md text-[14.5px] text-muted">
          {correct} correct, {wrong} wrong, {blank} left blank · {clock(usedSeconds)} of {pattern.minutes} minutes used.
        </p>
        <dl className="mt-6 grid w-full max-w-lg grid-cols-3 gap-3">
          {[
            { label: 'Correct', value: `+${correct * pattern.marks}` },
            { label: 'Wrong', value: `${wrong * pattern.penalty}` },
            { label: 'Blank', value: '0' },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-line bg-white/3 px-3 py-2">
              <dt className="text-[12px] text-faint">{s.label}</dt>
              <dd className="text-[18px] font-medium tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button variant="glass" icon={<RotateCcw className="size-4" />} onClick={() => setPhase('setup')}>
            Take another paper
          </Button>
        </div>
      </div>

      <section className="rounded-[24px] border border-line bg-white/2 p-5">
        <h3 className="text-[16px] font-medium">By subject</h3>
        <dl className="mt-3 grid gap-2 sm:grid-cols-3">
          {bySubject.map((s) => (
            <div key={s.subject} className="rounded-2xl border border-line bg-white/3 px-4 py-3">
              <dt className="text-[12px] text-faint">{s.subject}</dt>
              <dd className="text-[15px]">
                <span className="font-medium text-leaf-text">{s.got}</span> correct
                <span className="text-muted"> · {s.missed} wrong · {s.asked} asked</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-[24px] border border-line bg-white/2 p-5">
        <h3 className="text-[16px] font-medium">Where you lost marks</h3>
        {weak.length === 0 ? (
          <p className="mt-2 text-[14px] text-muted">Nothing wrong in this paper. Try a longer one or a harder subject.</p>
        ) : (
          <>
            <p className="mt-1.5 text-[13px] text-muted">
              Chapters ranked by how many questions you got wrong in this paper, worst first.
            </p>
            <ol className="mt-4 grid gap-2">
              {weak.map((c) => (
                <li key={`${c.subject}|${c.chapter}`} className="rounded-[18px] border border-line bg-white/3 p-4">
                  <details>
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2">
                      <span className="text-[14.5px] font-medium">{c.chapter}</span>
                      <span className="rounded-full border border-line-strong px-2 py-0.5 text-[11.5px] text-muted">{c.subject}</span>
                      <span className="ml-auto rounded-full border border-danger/40 bg-danger-soft px-2.5 py-0.5 text-[12px] text-danger">
                        {c.wrong.length} wrong of {c.asked}
                      </span>
                    </summary>
                    <div className="mt-3 grid gap-2">
                      {c.wrong.map((r) => (
                        <div key={r.question.id} className="rounded-[14px] border border-line bg-white/2 p-3">
                          <p className="text-[14px] leading-snug">{r.question.prompt}</p>
                          <p className="mt-1 text-[13px] text-muted">
                            You chose {(answers[deck.indexOf(r)] ?? 0) >= 0 ? r.question.options[answers[deck.indexOf(r)] ?? 0] : '—'} · answer:{' '}
                            <span className="text-leaf-text">{r.question.options[r.question.answer]}</span>
                          </p>
                          <div className="mt-2">
                            <Explanation question={r.question} aiReady={aiReady} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      {wrong > 0 ? (
        <p className="flex items-center gap-2 text-[12.5px] text-faint">
          <Check aria-hidden className="size-3.5" /> Every question in this paper came from the bank, with its answer key taken from the papers.
        </p>
      ) : null}
    </div>
  )
}
