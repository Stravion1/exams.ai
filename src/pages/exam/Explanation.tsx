import { useState } from 'react'

import { Button } from '../../components/Button'
import { postJson } from '../../lib/api'
import type { BankQuestion } from '../../lib/archive'
import { promptHash, whySourceLabel } from '../../lib/archive'

/*
  One question's explanation, with the place it came from stated underneath.

  Three honest cases:
    the paper printed the working   → shown, and the paper is named
    the same question did elsewhere → shown, and that paper is named
    nothing printed                 → said plainly, with a model-written
                                      explanation offered when one is connected
  A model's explanation is cached per question and never passed off as the
  paper's own.
*/

const CACHE_KEY = 'examsai:explanations'

function readCache(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    const value = raw ? (JSON.parse(raw) as unknown) : null
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function writeCache(key: string, why: string) {
  try {
    const all = readCache()
    all[key] = why
    const keys = Object.keys(all)
    // localStorage is small; keep the most recent few hundred.
    if (keys.length > 400) delete all[keys[0]]
    localStorage.setItem(CACHE_KEY, JSON.stringify(all))
  } catch {
    /* private mode: the explanation still shows, it just will not persist */
  }
}

const AI_LABEL = 'Written by a model, not taken from the paper. Check it against your textbook.'

export function Explanation({ question, aiReady }: { question: BankQuestion; aiReady: boolean }) {
  const cacheKey = `${promptHash(question.prompt)}:${question.answer}`
  const cached = question.why ? '' : (readCache()[cacheKey] ?? '')

  const [why, setWhy] = useState(question.why || cached)
  const [mine, setMine] = useState(!question.why && Boolean(cached))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function explain() {
    setBusy(true)
    setError('')
    const res = await postJson<{ why: string }>('/api/explain', {
      prompt: question.prompt,
      options: question.options,
      answer: question.answer,
      subject: question.subject,
      topic: question.topic,
    })
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    writeCache(cacheKey, res.data.why)
    setWhy(res.data.why)
    setMine(true)
  }

  return (
    <div>
      {why ? <p className="text-[13.5px] leading-relaxed text-muted">{why}</p> : null}
      <p className="mt-1 text-[12px] text-faint">{mine ? AI_LABEL : whySourceLabel(question)}</p>

      {why ? null : aiReady ? (
        <Button variant="leaf" className="mt-3" disabled={busy} onClick={explain}>
          {busy ? 'Writing an explanation…' : 'Explain this answer'}
        </Button>
      ) : (
        <p className="mt-1 text-[12px] text-muted">Connect a model to have this one explained.</p>
      )}

      {error ? <p className="mt-1 text-[12px] text-danger">{error}</p> : null}
    </div>
  )
}
