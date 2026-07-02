import { describe, it, expect, vi, beforeEach } from 'vitest'

// Queue of answers the mocked readline will return, one per question() call.
let answers: string[] = []

vi.mock('node:readline/promises', () => ({
  createInterface: () => ({
    question: async () => {
      if (answers.length === 0) throw new Error('no more mocked answers')
      return answers.shift() as string
    },
    close: () => {},
  }),
}))

// Silence the prompt output.
vi.spyOn(console, 'log').mockImplementation(() => {})

import { askList, askCheckbox } from './prompt.js'

beforeEach(() => {
  answers = []
})

describe('ui/prompt', () => {
  describe('askList', () => {
    it('returns the selected choice for an in-range index', async () => {
      answers = ['2']
      expect(await askList('pick', ['a', 'b', 'c'])).toBe('b')
    })

    it('rejects an out-of-range index and re-prompts', async () => {
      // First answer is out of bounds, second is valid.
      answers = ['5', '3']
      expect(await askList('pick', ['a', 'b', 'c'])).toBe('c')
    })

    it('rejects a zero index and re-prompts', async () => {
      answers = ['0', '1']
      expect(await askList('pick', ['a', 'b', 'c'])).toBe('a')
    })
  })

  describe('askCheckbox', () => {
    it('returns selected choices in order', async () => {
      answers = ['1 3']
      expect(await askCheckbox('pick', ['a', 'b', 'c'])).toEqual(['a', 'c'])
    })

    it('deduplicates repeated selections', async () => {
      answers = ['1 1 2']
      expect(await askCheckbox('pick', ['a', 'b', 'c'])).toEqual(['a', 'b'])
    })

    it('rejects an out-of-range token and re-prompts', async () => {
      answers = ['1 9', '2']
      expect(await askCheckbox('pick', ['a', 'b', 'c'])).toEqual(['b'])
    })

    it('supports "all" and "none"', async () => {
      answers = ['all']
      expect(await askCheckbox('pick', ['a', 'b'])).toEqual(['a', 'b'])
      answers = ['none']
      expect(await askCheckbox('pick', ['a', 'b'])).toEqual([])
    })
  })
})
