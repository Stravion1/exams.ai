import { useMemo, useState } from 'react'
import { ArrowRight, Check, CircleCheck, CircleX, ListChecks, RotateCcw, X } from 'lucide-react'

import { Button } from '../../components/Button'
import { EmptyState } from '../../components/EmptyState'
import { Notice } from '../../components/Notice'
import { ProgressBar, ScoreRing } from '../../components/Progress'
import type { BankRow } from '../../lib/archive'
import { cx } from '../../lib/cx'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

type Phase = 'setup' | 'question' | 'done'

/** A practice test built from the mined bank, most repeated questions first. */
export function PracticeTab({ rows, onBrowse }: { rows: BankRow[]; onBrowse: () => void }) {
  const [count, setCount] = useState(10)
  const [subject, setSubject] = useState('All')
  const [deck, setDeck] = useState<BankRow[]>([])
  const [phase, setPhase] = useState<Phase>('setup')
  const [i, setI] = useState(0)
  const [choice, setChoice] = useState<number | null>(null)
  const [checked, setChecked] = useState(false)
  const [answers, setAnswers] = useState<number[]>([])

  const subjects = useMemo(() => [...new Set(rows.map((r) => r.question.subject))].sort(), [rows])
  const pool = useMemo(() => rows.filter((r) => subject === 'All' || r.question.subject === subject), [rows, subject])
  const repeats = pool.filter((r) => r.repeats > 1).length

  if (!rows.length) {
    return (
      <EmptyState
        icon={<ListChecks aria-hidden className="size-6" />}
        title="Nothing to practise yet"
        body="Practise pulls questions straight from the bank, so add a paper first. Questions that repeat across papers come up first."
        action={
          <Button variant="paper" onClick={onBrowse}>
            Go to the bank
          </Button>
        }
      />
    )
  }

  const start = () => {
    const picked = [...pool].sort((a, b) => b.importance - a.importance).slice(0, count)
    if (!picked.length) return
    setDeck(picked)
    setAnswers([])
    setChoice(null)
    setChecked(false)
    setI(0)
    setPhase('question')
  }

  const row = deck[i]
  const score = answers.reduce((n, a, k) => n + (deck[k]?.question.answer === a ? 1 : 0), 0)

  if (phase === 'setup') {
    return (
      <div className="grid gap-6">
        <div className="glass rounded-[28px] p-6 sm:p-8">
          <h2 className="text-[22px] font-medium tracking-[-0.03em]">Practise from the bank</h2>
          <p className="mt-1.5 max-w-xl text-[14.5px] text-muted">
            Questions are taken most-important first, so the ones that repeat across years and carry a full explanation lead the test.
          </p>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <span className="text-[13.5px] font-medium text-soft">Subject</span>
              <select value={subject} onChange={(e) => setSubject(e.target.value)} className="field h-11">
                <option value="All">All subjects ({rows.length})</option>
                {subjects.map((s) => (
                  <option key={s} value={s}>
                    {s} ({rows.filter((r) => r.question.subject === s).length})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <span className="text-[13.5px] font-medium text-soft">How many questions</span>
              <div className="flex gap-2">
                {[10, 20, 30].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={count === n}
                    onClick={() => setCount(n)}
                    disabled={pool.length === 0}
                    className={cx(
                      'h-11 flex-1 rounded-full border text-[13.5px] transition-colors',
                      count === n ? 'border-leaf/50 bg-leaf-soft text-fg' : 'border-line-strong bg-white/4 text-soft hover:text-fg',
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p className="mt-5 text-[13px] text-faint">
            {pool.length} questions available{repeats ? ` · ${repeats} of them repeat across papers` : ''}
          </p>

          <Button variant="paper" size="lg" className="mt-6" iconRight={<ArrowRight className="size-4" />} onClick={start} disabled={!pool.length}>
            Start practice
          </Button>
        </div>
      </div>
    )
  }

  if (phase === 'question' && row) {
    const q = row.question
    const right = checked && choice === q.answer
    return (
      <div className="grid gap-6">
        <div className="flex items-center gap-4">
          <ProgressBar label="Practice progress" value={i + (checked ? 1 : 0)} max={deck.length} className="flex-1" />
          <span className="shrink-0 text-[13.5px] tabular-nums text-muted">
            {i + 1} of {deck.length}
          </span>
        </div>

        <fieldset className="glass rounded-[28px] p-6 sm:p-8">
          <legend className="sr-only">{q.prompt}</legend>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-line-strong px-3 py-1 text-[12px] text-soft">{q.subject}</span>
            {q.topic ? <span className="rounded-full border border-line-strong px-3 py-1 text-[12px] text-muted">{q.topic}</span> : null}
            {row.repeats > 1 ? (
              <span className="rounded-full border border-amber/25 bg-amber-soft px-3 py-1 text-[12px] text-amber">Repeated question</span>
            ) : null}
          </div>
          <p className="mt-4 text-[clamp(20px,2.6vw,26px)] leading-snug tracking-[-0.02em]">{q.prompt}</p>

          <div className="mt-6 grid gap-2.5">
            {q.options.map((o, n) => {
              const isRight = checked && n === q.answer
              const isWrong = checked && n === choice && n !== q.answer
              return (
                <label
                  key={`${q.id}-${n}`}
                  className={cx(
                    'flex min-h-13 cursor-pointer items-center gap-3 rounded-[16px] border px-4 py-2.5 text-[15px] transition-colors',
                    isRight ? 'border-leaf/60 bg-leaf-soft text-fg' : isWrong ? 'border-danger/50 bg-danger-soft text-fg' : choice === n ? 'border-leaf/50 bg-white/8' : 'border-line-strong bg-white/3 text-soft hover:border-leaf/30',
                    checked && 'cursor-default',
                  )}
                >
                  <input type="radio" name={q.id} className="sr-only" checked={choice === n} disabled={checked} onChange={() => setChoice(n)} />
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-line-strong text-[12.5px]">
                    {isRight ? <Check aria-hidden className="size-3.5" /> : isWrong ? <X aria-hidden className="size-3.5 text-danger" /> : LETTERS[n]}
                  </span>
                  {o}
                </label>
              )
            })}
          </div>

          {checked && (
            <Notice tone={right ? 'success' : 'error'} className="mt-5">
              <strong className="font-semibold">{right ? 'Correct.' : `Not quite: the answer is ${q.options[q.answer]}.`}</strong> {q.why}
            </Notice>
          )}
        </fieldset>

        <div className="flex justify-end">
          {!checked ? (
            <Button variant="paper" size="lg" disabled={choice === null} onClick={() => {
              setChecked(true)
              setAnswers((a) => [...a, choice ?? -1])
            }}>
              Check answer
            </Button>
          ) : (
            <Button
              variant="paper"
              size="lg"
              iconRight={<ArrowRight className="size-4" />}
              onClick={() => {
                if (i + 1 < deck.length) {
                  setI(i + 1)
                  setChoice(null)
                  setChecked(false)
                } else {
                  setPhase('done')
                }
              }}
            >
              {i + 1 < deck.length ? 'Next question' : 'See my score'}
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-6">
      <div className="glass grid justify-items-center rounded-[28px] p-8 text-center">
        <ScoreRing value={score} max={deck.length} label={`You scored ${score} out of ${deck.length}`} />
        <h2 className="mt-6 text-[26px] font-normal tracking-[-0.04em]">
          {score === deck.length ? 'Perfect score' : score / deck.length >= 0.6 ? 'Nicely done' : 'Good start'}
        </h2>
        <p className="mt-2 max-w-md text-[14.5px] text-muted">
          Every question here came from your own papers. The ones you missed are listed below with the explanation.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button variant="glass" icon={<RotateCcw className="size-4" />} onClick={start}>
            Try again
          </Button>
          <Button variant="paper" onClick={onBrowse}>
            Back to the bank
          </Button>
        </div>
      </div>

      <ol className="grid gap-2.5">
        {deck.map((r, n) => {
          const ok = answers[n] === r.question.answer
          return (
            <li key={r.question.id} className="flex items-start gap-3 rounded-[18px] border border-line bg-white/3 p-4">
              {ok ? <CircleCheck aria-label="Correct" className="mt-0.5 size-5 shrink-0 text-leaf-text" /> : <CircleX aria-label="Incorrect" className="mt-0.5 size-5 shrink-0 text-danger" />}
              <div className="text-[14px]">
                <p>{r.question.prompt}</p>
                <p className="mt-1 text-muted">
                  {ok ? r.question.options[r.question.answer] : `You said ${r.question.options[answers[n]] ?? 'nothing'}; answer: ${r.question.options[r.question.answer]}.`}{' '}
                  {r.question.why}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
