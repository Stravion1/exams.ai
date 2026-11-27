// Checks for the question-bank matching rules in src/lib/archive.ts.
// Run with `bun run test`.
import {
  chunkText,
  isNegative,
  normalisePrompt,
  promptHash,
  rankBank,
  similarity,
  yearFromName,
} from '../src/lib/archive.ts'

let failures = 0
const ok = (name, cond, extra = '') => {
  if (cond) console.log(`  ok   ${name}`)
  else {
    failures++
    console.log(`  FAIL ${name} ${extra}`)
  }
}

const question = (i, prompt, paperId, year, subject = 'Physics') => ({
  id: `${paperId}:${i}`,
  exam: 'neet-ug',
  paperId,
  paperName: `${paperId}.pdf`,
  year,
  subject,
  topic: 'Units',
  prompt,
  options: ['A', 'B', 'C', 'D'],
  answer: 1,
  why: 'Because of the definition stated in the paper.',
  key: promptHash(prompt),
})

console.log('file names')
ok('year from name', yearFromName('NEET UG 2024 Question Paper with Solutions.pdf') === 2024)
ok('year ignores junk numbers', yearFromName('Paper 1 set 4.pdf') === null)

console.log('normalisation')
ok('strips filler', normalisePrompt('Which of the following is the SI unit of force?') === 'si unit force', JSON.stringify(normalisePrompt('Which of the following is the SI unit of force?')))
ok('hash is stable across case', promptHash('What is the SI unit of force?') === promptHash('what is the si unit of force'))
ok('similarity catches rewording', similarity('What is the SI unit of force?', 'Which is the SI unit of force') > 0.8)
ok('similarity rejects different questions', similarity('What is the SI unit of force?', 'Name the largest gland in the human body') < 0.4)

console.log('negation is part of matching')
ok('detects NOT', isNegative('Which of these statements is NOT correct?'))
ok('detects n’t', isNegative("Which of these doesn't belong to the group?"))
ok('detects except', isNegative('All of the following are correct except'))
ok('detects incorrect', isNegative('Identify the incorrect statement'))
ok('leaves a positive stem alone', !isNegative('Which of these statements is correct?'))

const neg = 'Which of these statements is NOT correct?'
const pos = 'Which of these statements is correct?'
ok('negation survives normalisation', normalisePrompt(neg).includes('not'), JSON.stringify(normalisePrompt(neg)))
ok('polarity marker is added', normalisePrompt(neg).endsWith('~neg'), JSON.stringify(normalisePrompt(neg)))
ok('positive gets no marker', !normalisePrompt(pos).includes('~neg'), JSON.stringify(normalisePrompt(pos)))
ok('opposite stems hash differently', promptHash(neg) !== promptHash(pos), `${promptHash(neg)} vs ${promptHash(pos)}`)
ok('except variant hashes differently', promptHash('All of the following are correct except') !== promptHash('All of the following are correct'))
ok('conditional survives', normalisePrompt('If the force doubles, what happens to acceleration?').includes('if'))

console.log('repeat grouping')
const twins = rankBank([
  question(0, pos, 'p2024', 2024),
  question(0, neg, 'p2024', 2024),
])
ok('opposite questions stay separate', twins.length === 2, JSON.stringify(twins.map((r) => [r.question.prompt, r.repeats])))
ok('neither opposite is marked a repeat', twins.every((r) => r.repeats === 1))

const negTwice = rankBank([
  question(0, neg, 'p2024', 2024),
  question(7, 'Which of these statements is not correct:', 'p2025', 2025),
])
ok('the same negated question still groups', negTwice.length === 1 && negTwice[0].repeats === 2, JSON.stringify(negTwice.map((r) => [r.question.prompt, r.repeats])))

const mixed = rankBank([
  question(0, 'What is the SI unit of force?', 'p2024', 2024),
  question(1, 'Name the largest gland in the human body', 'p2024', 2024, 'Biology'),
  question(0, 'Which is the SI unit of force', 'p2025', 2025),
  question(1, 'What is the SI unit of pressure?', 'p2025', 2025),
])
ok('bank groups 4 questions into 3', mixed.length === 3, String(mixed.length))
ok('repeat is detected across years', mixed[0].repeats === 2, JSON.stringify(mixed.map((r) => [r.question.prompt, r.repeats])))
ok('repeat lists both papers', mixed[0].papers.length === 2)
ok('repeats rank first', mixed[0].question.prompt.includes('SI unit of force'), mixed[0].question.prompt)

console.log('chunking')
const chunks = chunkText('A'.repeat(30_000), 12_000, 30)
ok('splits long text', chunks.length >= 3, String(chunks.length))
ok('no chunk is oversized', chunks.every((c) => c.length <= 12_000))

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed')
process.exit(failures ? 1 : 0)
