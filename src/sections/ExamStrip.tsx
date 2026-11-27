import { ArrowRight } from 'lucide-react'

import { EXAMS } from '../lib/exams'
import { Link } from '../lib/router'

/** A compact row of exams on the landing page, linking into the catalogue. */
export function ExamStrip() {
  const featured = EXAMS.slice(0, 8)
  return (
    <section aria-labelledby="exams-strip" className="border-y border-line bg-white/2 px-5 py-10 sm:px-8 lg:px-12">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4">
        <h2 id="exams-strip" className="text-[14px] font-medium text-soft">
          Built for
        </h2>
        <ul className="flex flex-wrap gap-2">
          {featured.map((e) => (
            <li key={e.slug}>
              <Link
                href={`/exams/${e.slug}`}
                className="inline-flex min-h-9 items-center rounded-full border border-line-strong bg-white/4 px-3.5 text-[13px] text-soft transition-colors hover:border-leaf/40 hover:text-fg"
              >
                {e.short}
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/exams" className="ml-auto inline-flex items-center gap-1.5 text-[13.5px] font-medium text-leaf-text">
          All {EXAMS.length} exams
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
    </section>
  )
}
