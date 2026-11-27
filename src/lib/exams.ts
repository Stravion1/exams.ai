/*
  The exam catalogue: every exam the app can be pointed at. Adding an exam is
  one entry here — the exam page, the search, the AI brief and the question
  bank all read from this list.

  `pattern` holds the well-known shape of the paper. Where a board changes it
  every year (JEE Advanced, GATE) or it differs by state, the field is null and
  the card says so instead of guessing.
*/

export type ExamCategory =
  | 'Medical'
  | 'Engineering'
  | 'Management'
  | 'Banking'
  | 'SSC'
  | 'Railways'
  | 'Civil services'
  | 'Law'
  | 'Defence'
  | 'Teaching'
  | 'Research'

export type ExamPattern = {
  /** Questions in the first paper, when the exam has a fixed count. */
  questions: number | null
  /** Minutes of the first paper. */
  minutes: number | null
  marks: number | null
  /** Negative-marking rule in words; empty when there is none. */
  negative: string
}

export type Exam = {
  slug: string
  name: string
  short: string
  category: ExamCategory
  authority: string
  about: string
  /** Stages or papers, e.g. ['Prelims', 'Mains', 'Interview']. */
  stages: string[]
  subjects: string[]
  pattern: ExamPattern
  /** Years the app ships papers for, newest first. */
  years: number[]
  keywords: string[]
}

const p = (questions: number | null, minutes: number | null, marks: number | null, negative = ''): ExamPattern => ({
  questions,
  minutes,
  marks,
  negative,
})

export const EXAMS: Exam[] = [
  {
    slug: 'neet-ug',
    name: 'NEET UG',
    short: 'NEET',
    category: 'Medical',
    authority: 'National Testing Agency (NTA)',
    about:
      'The single entrance test for MBBS, BDS, AYUSH and allied medical courses in India. One paper of Physics, Chemistry and Biology, with Biology carrying double weight.',
    stages: ['Single paper'],
    subjects: ['Physics', 'Chemistry', 'Botany', 'Zoology'],
    pattern: p(180, 200, 720, '−1 for each wrong answer'),
    years: [2025, 2024, 2023, 2022, 2021],
    keywords: ['neet', 'medical', 'mbbs', 'bds', 'aiims', 'nta', 'doctor'],
  },
  {
    slug: 'jee-main',
    name: 'JEE Main',
    short: 'JEE Main',
    category: 'Engineering',
    authority: 'National Testing Agency (NTA)',
    about:
      'The gateway to NITs, IIITs and GFTIs, and the qualifier for JEE Advanced. Two sessions a year, best of the two counted.',
    stages: ['Session 1', 'Session 2'],
    subjects: ['Physics', 'Chemistry', 'Mathematics'],
    pattern: p(75, 180, 300, '−1 on MCQ, none on numerical'),
    years: [2025, 2024, 2023, 2022],
    keywords: ['jee', 'engineering', 'iit', 'nit', 'b.tech', 'nta'],
  },
  {
    slug: 'jee-advanced',
    name: 'JEE Advanced',
    short: 'JEE Adv',
    category: 'Engineering',
    authority: 'Indian Institutes of Technology',
    about:
      'The IIT entrance, sat only by the top JEE Main candidates. Two papers on the same day, with multiple question types that change every year.',
    stages: ['Paper 1', 'Paper 2'],
    subjects: ['Physics', 'Chemistry', 'Mathematics'],
    pattern: p(null, null, null, 'Varies by question type each year'),
    years: [2024, 2023, 2022],
    keywords: ['jee advanced', 'iit', 'engineering', 'ancient'],
  },
  {
    slug: 'cat',
    name: 'CAT',
    short: 'CAT',
    category: 'Management',
    authority: 'Indian Institutes of Management',
    about:
      'The Common Admission Test for IIM MBA programmes. Three sections with sectional time limits, heavy on data interpretation and reading speed.',
    stages: ['Single paper', 'WAT & PI'],
    subjects: ['Verbal Ability', 'Data Interpretation', 'Quantitative Aptitude'],
    pattern: p(68, 120, null, '−1 on MCQ, none on TITA'),
    years: [2024, 2023, 2022],
    keywords: ['cat', 'mba', 'iim', 'management', 'aptitude'],
  },
  {
    slug: 'xat',
    name: 'XAT',
    short: 'XAT',
    category: 'Management',
    authority: 'XLRI Jamshedpur',
    about:
      'The Xavier Aptitude Test for XLRI and 150+ business schools. Adds a decision-making section and a general-knowledge section to the usual aptitude mix.',
    stages: ['Single paper', 'GD & PI'],
    subjects: ['Decision Making', 'Verbal Ability', 'Quantitative Aptitude', 'General Knowledge'],
    pattern: p(95, 180, null, '−0.25 after 8 unattempted'),
    years: [2024, 2023],
    keywords: ['xat', 'xlri', 'mba', 'management'],
  },
  {
    slug: 'ssc-cgl',
    name: 'SSC CGL',
    short: 'CGL',
    category: 'SSC',
    authority: 'Staff Selection Commission',
    about:
      'Combined Graduate Level exam for central government Group B and C posts. Tier 1 is a computer-based objective paper; later tiers add descriptive work.',
    stages: ['Tier 1', 'Tier 2'],
    subjects: ['General Intelligence', 'General Awareness', 'Quantitative Aptitude', 'English'],
    pattern: p(100, 60, 200, '−0.50 per wrong answer'),
    years: [2024, 2023, 2022],
    keywords: ['ssc', 'cgl', 'government job', 'inspector', 'staff selection'],
  },
  {
    slug: 'ssc-chsl',
    name: 'SSC CHSL',
    short: 'CHSL',
    category: 'SSC',
    authority: 'Staff Selection Commission',
    about:
      'Combined Higher Secondary Level exam for LDC, DEO and postal assistant posts. Same four sections as CGL, tuned to a class-12 level.',
    stages: ['Tier 1', 'Tier 2'],
    subjects: ['General Intelligence', 'General Awareness', 'Quantitative Aptitude', 'English'],
    pattern: p(100, 60, 200, '−0.50 per wrong answer'),
    years: [2024, 2023],
    keywords: ['ssc', 'chsl', 'ldc', 'deo', '10+2', 'government job'],
  },
  {
    slug: 'ibps-po',
    name: 'IBPS PO',
    short: 'IBPS PO',
    category: 'Banking',
    authority: 'Institute of Banking Personnel Selection',
    about:
      'Probationary Officer recruitment for public sector banks. Prelims screen for Mains, which adds general and banking awareness plus a descriptive paper.',
    stages: ['Prelims', 'Mains', 'Interview'],
    subjects: ['Reasoning', 'Quantitative Aptitude', 'English', 'General Awareness'],
    pattern: p(100, 60, 100, '−0.25 per wrong answer'),
    years: [2024, 2023],
    keywords: ['ibps', 'bank po', 'banking', 'probationary officer'],
  },
  {
    slug: 'sbi-po',
    name: 'SBI PO',
    short: 'SBI PO',
    category: 'Banking',
    authority: 'State Bank of India',
    about:
      'The State Bank of India officer exam, generally considered the toughest of the bank PO papers, with a high-accuracy data interpretation load.',
    stages: ['Prelims', 'Mains', 'Group exercise', 'Interview'],
    subjects: ['Reasoning', 'Quantitative Aptitude', 'English', 'General Awareness'],
    pattern: p(100, 60, 100, '−0.25 per wrong answer'),
    years: [2024, 2023],
    keywords: ['sbi', 'bank po', 'banking', 'state bank'],
  },
  {
    slug: 'rbi-grade-b',
    name: 'RBI Grade B',
    short: 'RBI B',
    category: 'Banking',
    authority: 'Reserve Bank of India',
    about:
      'The Reserve Bank officer exam. Adds economics and finance papers to the usual reasoning, quant and English sections.',
    stages: ['Phase 1', 'Phase 2', 'Interview'],
    subjects: ['General Awareness', 'Reasoning', 'English', 'Quantitative Aptitude', 'Economic & Social Issues', 'Finance & Management'],
    pattern: p(200, 120, 200, '−0.25 per wrong answer'),
    years: [2024, 2023],
    keywords: ['rbi', 'grade b', 'banking', 'economics'],
  },
  {
    slug: 'rrb-ntpc',
    name: 'RRB NTPC',
    short: 'NTPC',
    category: 'Railways',
    authority: 'Railway Recruitment Board',
    about:
      'Non-Technical Popular Categories recruitment for Indian Railways: station master, goods guard, clerk and accounts posts.',
    stages: ['CBT 1', 'CBT 2', 'Typing / CBAT'],
    subjects: ['General Awareness', 'Mathematics', 'General Intelligence'],
    pattern: p(100, 90, 100, '−1/3 per wrong answer'),
    years: [2024, 2022],
    keywords: ['rrb', 'railway', 'ntpc', 'station master', 'government job'],
  },
  {
    slug: 'upsc-cse',
    name: 'UPSC Civil Services',
    short: 'UPSC CSE',
    category: 'Civil services',
    authority: 'Union Public Service Commission',
    about:
      'The IAS, IPS and IFS examination. Prelims is objective screening, Mains is nine written papers, and the interview decides the final rank.',
    stages: ['Prelims', 'Mains', 'Interview'],
    subjects: ['Polity', 'History', 'Geography', 'Economy', 'Environment', 'Current Affairs', 'CSAT'],
    pattern: p(100, 120, 200, '−1/3 per wrong answer'),
    years: [2024, 2023, 2022],
    keywords: ['upsc', 'ias', 'ips', 'civil services', 'prelims', 'government exam'],
  },
  {
    slug: 'state-psc',
    name: 'State PSC',
    short: 'State PSC',
    category: 'Civil services',
    authority: 'State Public Service Commissions (MPSC, UPPSC, BPSC and others)',
    about:
      'State civil service exams such as MPSC, UPPSC and BPSC. A prelims paper on general studies plus state-specific history, geography and schemes.',
    stages: ['Prelims', 'Mains', 'Interview'],
    subjects: ['General Studies', 'State History', 'State Geography', 'Current Affairs'],
    pattern: p(null, null, null, 'Differs by state'),
    years: [2024, 2023],
    keywords: ['mpsc', 'uppsc', 'bpsc', 'state psc', 'civil services'],
  },
  {
    slug: 'gate',
    name: 'GATE',
    short: 'GATE',
    category: 'Engineering',
    authority: 'IITs and IISc on behalf of NCET',
    about:
      'Graduate Aptitude Test in Engineering: admission to M.Tech and recruitment into PSUs. One paper per discipline, with numerical answer types.',
    stages: ['Single paper'],
    subjects: ['Engineering Mathematics', 'General Aptitude', 'Core Discipline'],
    pattern: p(65, 180, 100, '−1/3 on MCQ, none on numerical'),
    years: [2024, 2023],
    keywords: ['gate', 'm.tech', 'psu', 'engineering', 'iisc'],
  },
  {
    slug: 'cuet-ug',
    name: 'CUET UG',
    short: 'CUET',
    category: 'Research',
    authority: 'National Testing Agency (NTA)',
    about:
      'The Common University Entrance Test for central and many state universities. Domain subjects are chosen per course, plus a general test and a language paper.',
    stages: ['Single paper'],
    subjects: ['Language', 'Domain Subjects', 'General Test'],
    pattern: p(50, 60, 250, '−1 on MCQ'),
    years: [2024, 2023],
    keywords: ['cuet', 'university', 'du', 'b.a', 'b.sc', 'entrance'],
  },
  {
    slug: 'clat',
    name: 'CLAT',
    short: 'CLAT',
    category: 'Law',
    authority: 'Consortium of National Law Universities',
    about:
      'The Common Law Admission Test for the National Law Universities. Comprehension-heavy, built on current legal and political passages.',
    stages: ['Single paper', 'Interview'],
    subjects: ['English', 'Current Affairs', 'Legal Reasoning', 'Logical Reasoning', 'Quantitative Techniques'],
    pattern: p(120, 120, 120, '−0.25 per wrong answer'),
    years: [2024, 2023],
    keywords: ['clat', 'law', 'nlu', 'llb', 'legal'],
  },
  {
    slug: 'nda',
    name: 'NDA',
    short: 'NDA',
    category: 'Defence',
    authority: 'Union Public Service Commission',
    about:
      'The National Defence Academy entry for the Army, Navy and Air Force. A mathematics paper plus a general ability test, then SSB interview.',
    stages: ['Written', 'SSB Interview'],
    subjects: ['Mathematics', 'General Ability', 'English'],
    pattern: p(270, 300, 900, '−1/3 per wrong answer'),
    years: [2024, 2023],
    keywords: ['nda', 'defence', 'army', 'navy', 'air force', 'upsc'],
  },
  {
    slug: 'ctet',
    name: 'CTET',
    short: 'CTET',
    category: 'Teaching',
    authority: 'Central Board of Secondary Education',
    about:
      'The Central Teacher Eligibility Test, required for teaching posts in central schools. Two papers, one for classes 1 to 5 and one for 6 to 8.',
    stages: ['Paper 1', 'Paper 2'],
    subjects: ['Child Development', 'Pedagogy', 'Mathematics', 'Environmental Studies', 'Language'],
    pattern: p(150, 150, 150, 'No negative marking'),
    years: [2024, 2023],
    keywords: ['ctet', 'teaching', 'teacher', 'tet', 'cbse'],
  },
  {
    slug: 'csir-net',
    name: 'CSIR NET',
    short: 'CSIR NET',
    category: 'Research',
    authority: 'National Testing Agency for CSIR',
    about:
      'The CSIR test for Junior Research Fellowship and assistant professor eligibility in the sciences. Three parts: general aptitude, core and advanced.',
    stages: ['Single paper'],
    subjects: ['Life Sciences', 'Physical Sciences', 'Chemical Sciences', 'Mathematical Sciences'],
    pattern: p(150, 180, 200, '−0.25 to −1 by part'),
    years: [2024, 2023],
    keywords: ['csir', 'net', 'jrf', 'research', 'phd', 'science'],
  },
]

export const EXAM_BY_SLUG: Record<string, Exam> = Object.fromEntries(EXAMS.map((e) => [e.slug, e]))

export const CATEGORIES: ExamCategory[] = Array.from(new Set(EXAMS.map((e) => e.category)))

/** Every word a search can match, one entry per exam. */
function haystack(e: Exam) {
  return [e.name, e.short, e.category, e.authority, ...e.subjects, ...e.keywords].join(' ').toLowerCase()
}

/** Ranked search: name matches first, then keywords and subjects. */
export function searchExams(query: string, category: ExamCategory | 'All' = 'All'): Exam[] {
  const q = query.trim().toLowerCase()
  const pool = category === 'All' ? EXAMS : EXAMS.filter((e) => e.category === category)
  if (!q) return pool
  const scored: { e: Exam; score: number }[] = []
  for (const e of pool) {
    const name = e.name.toLowerCase()
    let score = 0
    if (name === q) score += 100
    else if (name.startsWith(q)) score += 60
    else if (name.includes(q)) score += 40
    if (e.short.toLowerCase().startsWith(q)) score += 30
    if (haystack(e).includes(q)) score += 10
    for (const word of q.split(/\s+/).filter(Boolean)) {
      if (haystack(e).includes(word)) score += 5
    }
    if (score > 0) scored.push({ e, score })
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.e)
}

/** The brief handed to the model so its answers stay inside this exam. */
export function examBrief(e: Exam) {
  return {
    title: e.name,
    subject: e.category,
    summary: `${e.about} Conducted by ${e.authority}.`,
    keyPoints: [
      `Stages: ${e.stages.join(' → ')}`,
      `Subjects: ${e.subjects.join(', ')}`,
      e.pattern.questions ? `First paper: ${e.pattern.questions} questions in ${e.pattern.minutes ?? '?'} minutes` : 'Paper pattern changes each year',
      e.pattern.negative ? `Marking: ${e.pattern.negative}` : 'No negative marking',
      `Papers in the library: ${e.years.join(', ')}`,
    ],
  }
}
