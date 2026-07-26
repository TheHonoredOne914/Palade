import { describe, it, expect } from 'vitest'
import { PONYTAIL_SKILL, KARPATHY_SKILL, GSTACK_SKILL, HARDCODED_SKILLS } from './skills.js'

describe('agents/skills', () => {
  describe('PONYTAIL_SKILL', () => {
    it('documents the YAGNI/minimalism ladder', () => {
      expect(PONYTAIL_SKILL).toContain('CORE PHILOSOPHY (PONYTAIL)')
      expect(PONYTAIL_SKILL).toContain('Does this need to exist at all?')
      expect(PONYTAIL_SKILL).toContain('Stdlib could do it?')
    })

    it('requires the "ponytail" tag on findings raised via this lens', () => {
      expect(PONYTAIL_SKILL).toContain('"ponytail"')
    })
  })

  describe('KARPATHY_SKILL', () => {
    it('documents the behavioral guideline lenses', () => {
      expect(KARPATHY_SKILL).toContain('KARPATHY BEHAVIORAL GUIDELINES')
      expect(KARPATHY_SKILL).toContain('Unstated assumptions')
      expect(KARPATHY_SKILL).toContain('Missing verification')
    })

    it('requires distinct tags for each sub-lens', () => {
      expect(KARPATHY_SKILL).toContain('"karpathy"')
      expect(KARPATHY_SKILL).toContain('"unrelated-refactor"')
      expect(KARPATHY_SKILL).toContain('"unverified-goal"')
    })
  })

  describe('GSTACK_SKILL', () => {
    it('documents voice and operational guidelines', () => {
      expect(GSTACK_SKILL).toContain('GSTACK LENSES & VOICE')
      expect(GSTACK_SKILL).toContain('Todo-list discipline')
      expect(GSTACK_SKILL).toContain('Operational Self-Improvement')
    })
  })

  describe('HARDCODED_SKILLS', () => {
    it('concatenates all three skills in order, newline-joined', () => {
      expect(HARDCODED_SKILLS).toBe(
        [PONYTAIL_SKILL, KARPATHY_SKILL, GSTACK_SKILL].join('\n')
      )
    })

    it('contains content from every individual skill', () => {
      expect(HARDCODED_SKILLS).toContain('PONYTAIL')
      expect(HARDCODED_SKILLS).toContain('KARPATHY')
      expect(HARDCODED_SKILLS).toContain('GSTACK')
    })

    it('preserves the relative ordering: ponytail, then karpathy, then gstack', () => {
      const ponytailIdx = HARDCODED_SKILLS.indexOf('CORE PHILOSOPHY (PONYTAIL)')
      const karpathyIdx = HARDCODED_SKILLS.indexOf('KARPATHY BEHAVIORAL GUIDELINES')
      const gstackIdx = HARDCODED_SKILLS.indexOf('GSTACK LENSES & VOICE')
      expect(ponytailIdx).toBeGreaterThanOrEqual(0)
      expect(karpathyIdx).toBeGreaterThan(ponytailIdx)
      expect(gstackIdx).toBeGreaterThan(karpathyIdx)
    })
  })
})