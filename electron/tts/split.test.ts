// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createSplitter } from './split'

const run = (chunks: string[]) => { const s = createSplitter(); return [...chunks.flatMap(c => s.push(c)), ...s.flush()] }
const chars = (t: string) => t.split('')

describe('sentence splitter', () => {
  it.each<[string, string, string[]]>([
    ['two sentences', 'Tell me about yourself and your background. Why this role at our company?', ['Tell me about yourself and your background.', 'Why this role at our company?']],
    ['abbreviation Dr.', 'Dr. Rao will interview you today for the role. Are you ready to begin?', ['Dr. Rao will interview you today for the role.', 'Are you ready to begin?']],
    ['e.g. and i.e.', 'Pick a hard project, e.g. a migration, and explain it in detail. Go ahead.', ['Pick a hard project, e.g. a migration, and explain it in detail.', 'Go ahead.']],
    ['initials', 'Was J. K. Smith your manager during that project at Acme? Tell me more.', ['Was J. K. Smith your manager during that project at Acme?', 'Tell me more.']],
    ['decimals', 'You improved latency from 3.5 seconds to 1.2 seconds overall. How did you measure it?', ['You improved latency from 3.5 seconds to 1.2 seconds overall.', 'How did you measure it?']],
    ['ellipsis continuation', 'Well... I think that is a good place to start our chat. Shall we?', ['Well... I think that is a good place to start our chat.', 'Shall we?']],
    ['unicode ellipsis then capital', 'Let me think about that for a moment… Okay, here is my next question. Ready?', ['Let me think about that for a moment…', 'Okay, here is my next question.', 'Ready?']],
    ['short sentence merges forward', 'Okay. Now tell me about the hardest bug you ever fixed in production.', ['Okay. Now tell me about the hardest bug you ever fixed in production.']],
    ['newline is a boundary', 'First question about your resume\nSecond question about your skills here', ['First question about your resume', 'Second question about your skills here']],
    ['closing quote kept', 'He said "we shipped it on time." Then what happened to the team afterwards?', ['He said "we shipped it on time."', 'Then what happened to the team afterwards?']],
    ['stream end flushes tail without terminator', 'Describe your approach to testing', ['Describe your approach to testing']],
  ])('%s', (_n, text, want) => {
    expect(run([text])).toEqual(want)
    expect(run(chars(text))).toEqual(want) // identical when streamed char by char
  })
  it('holds a trailing terminator until the next token confirms it (3. then 5)', () => {
    const s = createSplitter()
    expect(s.push('You cut the time from 3.')).toEqual([])
    expect(s.push('5 seconds to 1 second. Next')).toEqual(['You cut the time from 3.5 seconds to 1 second.'])
    expect(s.flush()).toEqual(['Next'])
  })
  it('emits once the following word starts', () => {
    const s = createSplitter()
    expect(s.push('Describe your approach to testing. ')).toEqual([])
    expect(s.push('Then')).toEqual(['Describe your approach to testing.'])
    expect(s.flush()).toEqual(['Then'])
  })
  it('flush on empty returns nothing', () => { expect(createSplitter().flush()).toEqual([]) })
})
