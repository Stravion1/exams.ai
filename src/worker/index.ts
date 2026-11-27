import { Hono } from 'hono'

import { PACK_BY_ID, answer, packForFile } from '../shared/packs'
import { fileKind, validateAnalyze, validateContact, validateEmail, validateLogin, validateQuestion, validateSignup, validateUpload } from '../shared/validate'
import { AiError, aiConfig, askModel, buildPack, contextOfPack, explainAnswer, extractQuestions, probe, readContext, readHistory } from './ai'

/*
  The Worker in front of the static site. Every form posts here and gets the
  same validation the browser runs (src/shared/validate.ts). The library itself
  still lives in localStorage, but the tutor and the study packs are generated
  by a real model as soon as AI_API_KEY is set (see src/worker/ai.ts).
*/
type Env = { ASSETS: Fetcher; AI_API_KEY?: string; AI_BASE_URL?: string; AI_MODEL?: string }

const app = new Hono<{ Bindings: Env }>()

async function body<T>(c: { req: { json: <J>() => Promise<J> } }): Promise<Partial<T> | null> {
  try {
    const v = await c.req.json<unknown>()
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Partial<T>) : null
  } catch {
    return null
  }
}

const invalidJson = { error: 'Send a JSON object.' }
const fields = 'Check the highlighted fields.'
const failed = (err: unknown, fallback: string) => (err instanceof AiError ? err.message : fallback)

app.get('/api/health', (c) => c.json({ ok: true, ai: aiConfig(c.env) !== null }))

/** Whether a model is wired up. `?probe=1` makes one tiny call to prove the key works. */
app.get('/api/ai/status', async (c) => {
  const cfg = aiConfig(c.env)
  if (!cfg) return c.json({ ok: true, configured: false, mode: 'demo', model: null })
  const info = { ok: true, configured: true, mode: 'live', model: cfg.model }
  if (c.req.query('probe') === undefined) return c.json(info)
  try {
    await probe(cfg)
    return c.json({ ...info, probe: 'ok' })
  } catch (err) {
    return c.json({ ...info, probe: 'failed', error: failed(err, 'The model could not be reached.') })
  }
})

app.post('/api/signup', async (c) => {
  const b = await body<Record<string, unknown>>(c)
  if (!b) return c.json(invalidJson, 400)
  const errors = validateSignup(b)
  if (Object.keys(errors).length) return c.json({ error: fields, errors }, 422)
  return c.json({ ok: true, user: { name: String(b.name).trim(), email: String(b.email).trim().toLowerCase(), level: b.level } })
})

// Demo sign-in: validates the shape only. Replace with your auth provider.
app.post('/api/login', async (c) => {
  const b = await body<Record<string, unknown>>(c)
  if (!b) return c.json(invalidJson, 400)
  const errors = validateLogin(b)
  if (Object.keys(errors).length) return c.json({ error: fields, errors }, 422)
  const email = String(b.email).trim().toLowerCase()
  const name = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
  return c.json({ ok: true, user: { name, email, level: 'University' } })
})

app.post('/api/subscribe', async (c) => {
  const b = await body<{ email: string }>(c)
  if (!b) return c.json(invalidJson, 400)
  const error = validateEmail(b.email)
  if (error) return c.json({ error, errors: { email: error } }, 422)
  return c.json({ ok: true })
})

app.post('/api/contact', async (c) => {
  const b = await body<Record<string, unknown>>(c)
  if (!b) return c.json(invalidJson, 400)
  const errors = validateContact(b)
  if (Object.keys(errors).length) return c.json({ error: fields, errors }, 422)
  return c.json({ ok: true })
})

// Read an upload: the model writes its study pack, or the demo picks a hand-written one.
app.post('/api/upload', async (c) => {
  const b = await body<{ name: string; size: number; text?: string }>(c)
  if (!b) return c.json(invalidJson, 400)
  const error = validateUpload(b)
  if (error) return c.json({ error }, 422)
  const name = String(b.name).trim()
  const seed = packForFile(name)
  const document = {
    id: crypto.randomUUID(),
    name,
    kind: fileKind(name),
    size: b.size,
    packId: seed.id,
    addedAt: new Date().toISOString(),
  }

  const cfg = aiConfig(c.env)
  if (!cfg) return c.json({ ok: true, ai: false, document })

  try {
    const pack = await buildPack(cfg, {
      title: name.replace(/\.[a-z0-9]+$/i, ''),
      subject: seed.subject,
      notes: typeof b.text === 'string' ? b.text : undefined,
    })
    return c.json({ ok: true, ai: true, document: { ...document, pack } })
  } catch (err) {
    return c.json({ error: failed(err, 'The study pack could not be built.'), ai: true }, 502)
  }
})

// The tutor: a real model call grounded in the document, or the scripted demo answer.
app.post('/api/chat', async (c) => {
  const b = await body<{ packId?: string; message: string; context?: unknown; history?: unknown }>(c)
  if (!b) return c.json(invalidJson, 400)
  const error = validateQuestion(b.message)
  if (error) return c.json({ error }, 422)

  const pack = typeof b.packId === 'string' ? PACK_BY_ID[b.packId] : undefined
  const context = readContext(b.context) ?? (pack ? contextOfPack(pack) : null)
  if (!context) return c.json({ error: 'That document is no longer in your library.' }, 404)

  const cfg = aiConfig(c.env)
  if (!cfg) {
    if (!pack) return c.json({ error: 'This document needs AI_API_KEY before its tutor can answer.' }, 503)
    return c.json({ ok: true, ai: false, reply: answer(pack, String(b.message)) })
  }

  try {
    const reply = await askModel(cfg, context, String(b.message), readHistory(b.history))
    return c.json({ ok: true, ai: true, reply })
  } catch (err) {
    return c.json({ error: failed(err, 'The model could not answer that.'), ai: true }, 502)
  }
})

// Mine one chunk of a past paper into structured questions (the client chunks).
app.post('/api/analyze', async (c) => {
  const b = await body<{ exam: string; examName: string; paper: string; text: string }>(c)
  if (!b) return c.json(invalidJson, 400)
  const error = validateAnalyze(b)
  if (error) return c.json({ error }, 422)

  const cfg = aiConfig(c.env)
  if (!cfg) return c.json({ error: 'Add AI_API_KEY to the Worker before analysing papers.' }, 503)

  try {
    const questions = await extractQuestions(cfg, {
      exam: String(b.examName).trim(),
      paper: String(b.paper).trim(),
      text: String(b.text),
    })
    return c.json({ ok: true, questions })
  } catch (err) {
    return c.json({ error: failed(err, 'That part of the paper could not be read.') }, 502)
  }
})

// Explain one bank question that its paper printed no working for.
app.post('/api/explain', async (c) => {
  const b = await body<{ prompt: string; options: string[]; answer: number; subject?: string; topic?: string }>(c)
  if (!b) return c.json(invalidJson, 400)

  const prompt = typeof b.prompt === 'string' ? b.prompt.trim() : ''
  const options = Array.isArray(b.options) ? b.options.filter((o): o is string => typeof o === 'string').slice(0, 6) : []
  const answer = Number(b.answer)
  if (prompt.length < 8 || options.length < 2 || !Number.isInteger(answer) || answer < 0 || answer >= options.length) {
    return c.json({ error: 'That question is incomplete.' }, 422)
  }

  const cfg = aiConfig(c.env)
  if (!cfg) return c.json({ error: 'No model is connected, so this question cannot be explained yet.' }, 503)

  try {
    const why = await explainAnswer(cfg, {
      prompt: prompt.slice(0, 600),
      options: options.map((o) => o.slice(0, 300)),
      answer,
      subject: typeof b.subject === 'string' ? b.subject.slice(0, 60) : 'NEET',
      topic: typeof b.topic === 'string' ? b.topic.slice(0, 120) : '',
    })
    return c.json({ ok: true, why })
  } catch (err) {
    return c.json({ error: failed(err, 'That explanation could not be written.') }, 502)
  }
})

app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404))

app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))

export default app
