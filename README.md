# exams.ai

An AI exam-prep workspace. Pick an Indian competitive exam, upload its past papers
with answer keys, and the app mines every question into a bank — marking the ones
that repeat across years — then builds practice tests from it.

The model is any OpenAI-compatible endpoint (Z.ai by default). With no key the
app still runs, but paper mining is switched off and the sample tutor falls back
to hand-written study packs.

```sh
bun install
bun run dev        # http://localhost:5333
bun run typecheck
bun run build
```

## Connect the model

1. Get an API key. The default endpoint is [Z.ai](https://z.ai) (`glm-4.6`); any
   OpenAI-compatible provider works.
2. Copy `.dev.vars.example` to `.dev.vars` and fill it in:

   ```sh
   AI_API_KEY=your-key
   AI_MODEL=glm-4.6
   AI_BASE_URL=https://api.z.ai/api/paas/v4
   ```

3. Restart `bun run dev`, then check `curl localhost:5333/api/ai/status?probe=1`.

`AI_BASE_URL` and `AI_MODEL` are optional. For another provider change both, e.g.
`https://api.openai.com/v1` with `gpt-4o-mini`, or `https://openrouter.ai/api/v1`
with `anthropic/claude-3.5-sonnet`. For a deployed Worker:

```sh
npx wrangler secret put AI_API_KEY
npx wrangler secret put AI_MODEL
npx wrangler secret put AI_BASE_URL
```

`.dev.vars` is git-ignored. Never commit a key.

## The exam workspace

`/exams` lists every exam in the catalogue (`src/lib/exams.ts`), searchable by
name, subject, authority or keyword. Each exam opens a workspace with four tabs:

| Tab | What it does |
| --- | --- |
| Papers | Add up to 20 PDFs (200 MB each) at once. The text is extracted **in the browser**, so the file itself never uploads; each chunk goes to `POST /api/analyze`. Shows live progress per paper, lets you re-run a paper, and keeps the banner of what went wrong. |
| Question bank | Every mined question with its options, the correct answer, the printed explanation and the paper it came from. Questions that appear in more than one paper are grouped, badged with the years, and ranked first. Filter by subject, search, or show repeats only. |
| Practice | A test built from the bank, most important and most repeated first, with an explanation after each answer and a score at the end. |
| Ask | A tutor grounded in the exam brief plus its most repeated questions. |

How mining works: `src/lib/pdf.ts` reads the PDF with pdf.js, `chunkText` cuts it
into ~12k-character pieces, each chunk is sent to `/api/analyze`, and the model
returns structured questions. A question is dropped unless it has a prompt, at
least two options and an answer index inside the range — the model cannot invent
a page of them into existence without them validating.

Repeat detection is local and deterministic (`rankBank` in `src/lib/archive.ts`):
prompts are normalised (lower-case, punctuation and filler words removed), matched
exactly by hash, then merged with nearby prompts by word overlap. Ranking weighs
how many papers a question appears in, then how recent those papers are, then how
complete its explanation is.

Uploads of `.txt`/`.md` are read directly. Scanned PDFs with no text layer need
OCR first, which this build does not do.

## Storage

- **IndexedDB** (`examsai` database) holds the heavy things: `papers`, the
  extracted `text` of each paper, and every `questions` row. This is what allows
  20 papers per exam.
- **localStorage** (`examsai:` prefix) holds the small stuff: the demo library,
  flashcard progress, quiz history, chats and the signed-in user.
- Everything is per browser. There is no server-side database yet; see below.

## Screens

| Route | What it is |
| --- | --- |
| `/` | Landing: hero, exam strip, features, how it works, stats, testimonials, pricing, FAQ |
| `/exams` | Searchable catalogue of 19 exams with category filters |
| `/exams/:slug` | That exam's workspace: papers, question bank, practice, ask |
| `/pricing`, `/about`, `/styleguide` | Marketing and the live component catalogue |
| `/login`, `/signup` | Sign-in and account creation (demo: validated by the Worker) |
| `/app` | The older single-document demo library: uploads, cards due, quiz average |
| `/app/chat`, `/app/flashcards`, `/app/quiz` | Tutor, spaced-repetition cards and quiz for one document |
| anything else | 404 |

## Where things live

- Exam catalogue: `src/lib/exams.ts` — one entry per exam, plus `searchExams` and `examBrief`.
- Archive, repeat detection, ranking, chunking: `src/lib/archive.ts`.
- PDF text extraction: `src/lib/pdf.ts`.
- Workspace UI: `src/pages/exam/` (one file per tab).
- Model connection, prompts and JSON parsing: `src/worker/ai.ts`. Hand-written
  fallback packs: `src/shared/packs.ts`.
- Form rules shared by the page and the Worker: `src/shared/validate.ts` (limits:
  200 MB per file, 20 files per batch).
- Tokens and layout: `src/styles.css`, `src/components/`, `src/sections/`.

## Worker routes

All in `src/worker/index.ts`. Each validates its input and answers JSON.

| Route | Body | Answers |
| --- | --- | --- |
| `GET /api/health` | | `{ ok, ai }` |
| `GET /api/ai/status` | | `{ configured, mode, model }`; `?probe=1` makes one real call |
| `POST /api/analyze` | `{ exam, examName, paper, text }` | `{ questions: [...] }`, 422 for a bad chunk, 503 without a key, 502 when the model fails |
| `POST /api/chat` | `{ packId?, context?, message, history? }` | `{ reply: { text, cite, suggestions }, ai }` |
| `POST /api/upload` | `{ name, size, text? }` | a document with a model-built pack, or a fallback pack |
| `POST /api/signup`, `/api/login` | credentials | the user, or field errors |
| `POST /api/subscribe`, `/api/contact` | form bodies | ok, or field errors |

## Still to build

- **Server-side storage and accounts.** Papers and banks are in IndexedDB, so they
  live in one browser. Moving to D1 + R2 behind Sign in with Freebuff is the next
  real step.
- **OCR** for scanned papers, and text extraction for DOCX/PPTX.
- **Question-bank import**: the "question banks with answers will be shared" case
  is not wired — today a bank is built from uploaded papers only.
- Payments, newsletters and the contact form accept the submission and discard it.
