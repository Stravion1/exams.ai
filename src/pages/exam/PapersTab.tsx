import { useRef, useState } from 'react'
import { FilePlus2, FileText, RotateCw, Trash2, UploadCloud } from 'lucide-react'

import { Badge } from '../../components/Badge'
import { Button, IconButton } from '../../components/Button'
import { EmptyState } from '../../components/EmptyState'
import { Modal } from '../../components/Modal'
import { ProgressBar } from '../../components/Progress'
import type { Paper } from '../../lib/archive'
import { cx } from '../../lib/cx'
import type { Exam } from '../../lib/exams'
import { MAX_BYTES, MAX_FILES } from '../../shared/validate'
import type { Job } from './ExamSpace'

const STATUS: Record<Paper['status'], { label: string; tone: 'neutral' | 'leaf' | 'amber' | 'danger' }> = {
  queued: { label: 'Queued', tone: 'neutral' },
  extracting: { label: 'Reading', tone: 'amber' },
  analysing: { label: 'Mining questions', tone: 'amber' },
  done: { label: 'Ready', tone: 'leaf' },
  error: { label: 'Needs attention', tone: 'danger' },
}

const SIZE = (n: number) => (n > 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

export function PapersTab({
  exam,
  papers,
  jobs,
  busy,
  aiReady,
  onFiles,
  onDelete,
  onReanalyse,
  onClear,
}: {
  exam: Exam
  papers: Paper[]
  jobs: Record<string, Job>
  busy: boolean
  aiReady: boolean
  onFiles: (files: File[]) => void | Promise<void>
  onDelete: (paper: Paper) => void | Promise<void>
  onReanalyse: (paper: Paper) => void | Promise<void>
  onClear: () => void | Promise<void>
}) {
  const [drag, setDrag] = useState(false)
  const [confirm, setConfirm] = useState<Paper | null>(null)
  const [clear, setClear] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const pick = (files: FileList | null) => {
    if (!files?.length) return
    void onFiles(Array.from(files))
  }

  return (
    <div className="grid gap-8">
      <section aria-labelledby="add-papers">
        <h2 id="add-papers" className="text-[17px] font-medium">
          Add past papers
        </h2>
        <p className="mt-1.5 max-w-2xl text-[14px] text-muted">
          Papers with an answer key or printed solutions work best. Up to {MAX_FILES} files at once, {Math.round(MAX_BYTES / 1_048_576)} MB each. The
          text is read in your browser; only the text goes to the model.
        </p>

        <label
          onDragOver={(e) => {
            e.preventDefault()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDrag(false)
            pick(e.dataTransfer.files)
          }}
          className={cx(
            'mt-4 grid cursor-pointer place-items-center gap-3 rounded-[24px] border border-dashed px-6 py-10 text-center transition-colors focus-within:border-leaf',
            !aiReady ? 'pointer-events-none border-line bg-white/2 opacity-60' : drag ? 'border-leaf bg-leaf-soft' : 'border-line-strong bg-white/3 hover:border-leaf/50',
          )}
        >
          <span className="grid size-14 place-items-center rounded-2xl bg-leaf-soft text-leaf-text">
            <UploadCloud aria-hidden className="size-6" />
          </span>
          <span className="text-[16px] font-medium">Drop {exam.short} papers here, or choose files</span>
          <span className="text-[13.5px] text-muted">PDF, TXT or Markdown. Scanned PDFs without a text layer need OCR first.</span>
          <input
            ref={input}
            type="file"
            multiple
            className="sr-only"
            accept=".pdf,.txt,.md"
            disabled={!aiReady || busy}
            onChange={(e) => {
              pick(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
      </section>

      {Object.entries(jobs).length > 0 && (
        <section aria-labelledby="running" className="grid gap-4 rounded-[22px] border border-line bg-white/3 p-5">
          <h2 id="running" className="text-[15px] font-medium">
            Working on {Object.keys(jobs).length} {Object.keys(jobs).length === 1 ? 'paper' : 'papers'}
          </h2>
          {Object.entries(jobs).map(([id, job]) => (
            <div key={id} className="grid gap-2">
              <div className="flex items-center justify-between gap-3 text-[13.5px]">
                <span className="truncate text-soft">{job.name}</span>
                <span className="shrink-0 text-faint">{job.stage}</span>
              </div>
              <ProgressBar label={`Progress for ${job.name}`} value={job.pct} />
            </div>
          ))}
        </section>
      )}

      <section aria-labelledby="paper-list">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="paper-list" className="text-[17px] font-medium">
            This exam's papers
          </h2>
          {papers.length > 0 && (
            <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={() => setClear(true)}>
              Remove all
            </Button>
          )}
        </div>

        {papers.length === 0 ? (
          <EmptyState
            className="mt-4"
            icon={<FileText aria-hidden className="size-6" />}
            title="No papers yet"
            body={`Add a ${exam.name} paper with its answer key and the bank fills itself: every question, its answer, why it is right, and the ones that repeat across years.`}
            action={
              <Button variant="paper" icon={<FilePlus2 className="size-4" />} onClick={() => input.current?.click()} disabled={!aiReady || busy}>
                Choose files
              </Button>
            }
          />
        ) : (
          <ul className="mt-4 grid gap-3">
            {papers.map((paper) => {
              const status = STATUS[paper.status]
              return (
                <li key={paper.id} className="rounded-[20px] border border-line bg-white/3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate text-[15px] font-medium">
                        <FileText aria-hidden className="size-4 shrink-0 text-faint" />
                        {paper.name}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
                        <span>{SIZE(paper.size)}</span>
                        {paper.pages ? <span>{paper.pages} pages</span> : null}
                        {paper.year ? <span>{paper.year}</span> : null}
                        <span>{paper.questionCount} questions</span>
                        {paper.chars ? <span>{paper.chars.toLocaleString()} characters read</span> : null}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={status.tone}>{status.label}</Badge>
                      <IconButton label={`Read ${paper.name} again`} size="sm" disabled={!aiReady || busy} onClick={() => void onReanalyse(paper)}>
                        <RotateCw className="size-4" />
                      </IconButton>
                      <IconButton label={`Remove ${paper.name}`} size="sm" onClick={() => setConfirm(paper)}>
                        <Trash2 className="size-4" />
                      </IconButton>
                    </div>
                  </div>
                  {paper.error && (
                    <p className="mt-3 rounded-xl border border-danger/25 bg-danger-soft px-3 py-2 text-[13px] text-danger">{paper.error}</p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title="Remove this paper?" description="Its questions leave the bank with it. This cannot be undone.">
        <div className="grid gap-3">
          <p className="text-[14.5px] text-soft">{confirm?.name}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="danger"
              onClick={() => {
                if (confirm) void onDelete(confirm)
                setConfirm(null)
              }}
            >
              Remove paper
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Keep it
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={clear} onClose={() => setClear(false)} title="Remove every paper?" description={`Every paper and question for ${exam.name} is deleted from this browser.`}>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="danger"
            onClick={() => {
              void onClear()
              setClear(false)
            }}
          >
            Remove everything
          </Button>
          <Button variant="ghost" onClick={() => setClear(false)}>
            Cancel
          </Button>
        </div>
      </Modal>
    </div>
  )
}
