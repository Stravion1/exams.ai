import { useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { ArrowUp } from 'lucide-react'

import { ChatBubble } from '../../components/ChatBubble'
import { IconButton } from '../../components/Button'
import { Notice } from '../../components/Notice'
import { TypingDots } from '../../components/TypingDots'
import { postJson } from '../../lib/api'
import type { BankRow } from '../../lib/archive'
import { examBrief } from '../../lib/exams'
import type { Exam } from '../../lib/exams'

type Msg = { id: string; from: 'you' | 'cramly'; text: string; cite?: string | null }

const uid = () => Math.random().toString(36).slice(2, 10)

/** Ask about the exam: the model gets the exam brief plus its most repeated questions. */
export function AskTab({ exam, rows }: { exam: Exam; rows: BankRow[] }) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const box = useRef<HTMLTextAreaElement>(null)

  const repeated = rows.filter((r) => r.repeats > 1).slice(0, 6)

  const chips = [
    `What does the ${exam.short} paper look like?`,
    repeated.length ? 'Which questions repeat most?' : 'Which topics should I study first?',
    'Make me a one-week revision plan',
  ]

  async function ask(text: string) {
    const question = text.trim()
    if (!question || busy) return
    setError(null)
    setDraft('')
    setBusy(true)
    const mine: Msg = { id: uid(), from: 'you', text: question }
    setMessages((m) => [...m, mine])

    const brief = examBrief(exam)
    const context = {
      title: brief.title,
      subject: brief.subject,
      summary: brief.summary,
      keyPoints: [
        ...brief.keyPoints,
        ...repeated.map((r) => `Repeated: ${r.question.prompt} (${r.repeats} papers)`),
        rows.length ? `The question bank holds ${rows.length} questions across ${new Set(rows.map((r) => r.question.subject)).size} subjects.` : '',
      ].filter(Boolean),
    }

    const res = await postJson<{ reply: { text: string; cite: string | null; suggestions: string[] } }>('/api/chat', {
      context,
      message: question,
      history: messages.slice(-8).map((m) => ({ from: m.from, text: m.text })),
    })
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setMessages((m) => [...m, { id: uid(), from: 'cramly', text: res.data.reply.text, cite: res.data.reply.cite }])
    box.current?.focus()
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void ask(draft)
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void ask(draft)
    }
  }

  return (
    <div className="grid gap-5">
      <div>
        <h2 className="text-[17px] font-medium">Ask about {exam.name}</h2>
        <p className="mt-1.5 max-w-2xl text-[14px] text-muted">
          The model answers from this exam's brief and the questions mined from your papers. Add papers to make its answers specific.
        </p>
      </div>

      <div className="grid max-h-[58vh] gap-4 overflow-y-auto rounded-[24px] border border-line bg-white/2 p-5" aria-live="polite">
        {messages.length === 0 && !busy ? (
          <p className="m-auto max-w-sm text-center text-[14px] text-faint">
            Ask anything about {exam.short}: the pattern, the marking, what to revise first, or how to use the questions you uploaded.
          </p>
        ) : null}
        {messages.map((m) => (
          <ChatBubble key={m.id} from={m.from} text={m.text} cite={m.cite ?? null} />
        ))}
        {busy && (
          <ChatBubble from="cramly">
            <TypingDots />
          </ChatBubble>
        )}
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {!busy && (
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => void ask(c)}
              className="min-h-9 rounded-full border border-line-strong bg-white/4 px-3.5 text-[13px] text-soft transition-colors hover:border-leaf/40 hover:text-fg"
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="glass flex items-end gap-2 rounded-[22px] p-2 pl-4">
        <label htmlFor="ask-exam" className="sr-only">
          Ask about {exam.name}
        </label>
        <textarea
          id="ask-exam"
          ref={box}
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          placeholder={`Ask about ${exam.short}…`}
          className="max-h-40 min-h-11 flex-1 resize-none bg-transparent py-2.5 text-[15px] outline-none placeholder:text-faint"
        />
        <IconButton type="submit" label="Send" variant="leaf" disabled={busy || !draft.trim()}>
          <ArrowUp className="size-5" />
        </IconButton>
      </form>
      <p className="text-[12.5px] text-faint">Enter to send, Shift and Enter for a new line.</p>
    </div>
  )
}
