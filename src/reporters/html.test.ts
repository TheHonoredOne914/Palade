import { writeHtmlReport } from './html.js'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, afterEach } from 'vitest'
import crypto from 'node:crypto'
import type { ReporterContext } from './types.js'
import type { AgentFinding } from '../agents/base.js'

function makeContext(
  overrides: Partial<{
    agentName: string
    findingTitle: string
    findingDescription: string
    severity: string
  }>
): ReporterContext {
  const agentName = overrides.agentName ?? 'security'
  const severity = overrides.severity ?? 'high'
  return {
    score: {
      score: 75,
      breakdown: {
        total: 75,
        categories: [
          { category: 'security', score: 70, findingCount: 1, criticalCount: 0, highCount: 1 },
          { category: 'architecture', score: 80, findingCount: 0, criticalCount: 0, highCount: 0 },
          { category: 'performance', score: 80, findingCount: 0, criticalCount: 0, highCount: 0 },
          {
            category: 'maintainability',
            score: 80,
            findingCount: 0,
            criticalCount: 0,
            highCount: 0,
          },
          { category: 'deadCode', score: 80, findingCount: 0, criticalCount: 0, highCount: 0 },
          {
            category: 'testIntelligence',
            score: 80,
            findingCount: 0,
            criticalCount: 0,
            highCount: 0,
          },
        ],
        findingCount: 1,
        crossAgentCount: 0,
      },
      previousScore: null,
      delta: 0,
    },
    swarm: {
      runId: 'test-run',
      findings: [],
      crossAgentFindings: [],
      synthesis: {
        executiveSummary: 'Test',
        priorityFixes: [],
        crossCuttingObservations: [],
        debtEstimate: { critical: 0, high: 0, medium: 0, low: 0, total: 0, highestROIFix: '' },
      },
      agentTimings: { [agentName]: 1000 } as Record<string, number>,
      totalChunks: 10,
      totalTokensEstimated: 5000,
      durationMs: 5000,
    },
    synthesis: {
      executiveSummary: 'Test summary',
      priorityFixes: [],
      crossCuttingObservations: [],
      debtEstimate: { critical: 0, high: 0, medium: 0, low: 0, total: 0, highestROIFix: '' },
    },
    findings: [
      {
        id: crypto.randomUUID(),
        agentName: agentName as AgentFinding['agentName'],
        severity: severity as AgentFinding['severity'],
        title: overrides.findingTitle ?? 'Test finding',
        description: overrides.findingDescription ?? 'Test description',
        filePath: 'test.ts',
        tags: [],
        scorePenalty: 5,
      },
    ],
    crossAgentFindings: [
      {
        title: overrides.findingTitle ?? 'Cross finding',
        description: overrides.findingDescription ?? 'Cross description',
        agents: [agentName as any],
        filePaths: ['test.ts'],
        severity: severity as any,
        blastRadius: 1,
      },
    ],
    history: [],
    config: { projectName: 'test', runTimestamp: new Date().toISOString() },
  }
}

describe('reporters/html', () => {
  const tmpPaths: string[] = []

  afterEach(() => {
    for (const path of tmpPaths) {
      try {
        rmSync(path, { force: true })
      } catch {
        // best-effort cleanup
      }
    }
    tmpPaths.length = 0
  })

  it('escapes XSS payload in agentName', () => {
    const tmpPath = join(tmpdir(), `palade-report-${Date.now()}-${Math.random()}.html`)
    tmpPaths.push(tmpPath)
    const ctx = makeContext({ agentName: '<script>alert("xss")</script>' })
    writeHtmlReport(ctx, tmpPath)
    const content = readFileSync(tmpPath, 'utf-8')

    expect(content).not.toContain('<script>alert("xss")</script>')
    expect(content).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;')
  })

  it('escapes XSS payload in finding title and description', () => {
    const tmpPath = join(tmpdir(), `palade-report-${Date.now()}-${Math.random()}.html`)
    tmpPaths.push(tmpPath)
    const ctx = makeContext({
      findingTitle: '<img onerror=alert(1)>',
      findingDescription: '<b>evil</b>',
    })
    writeHtmlReport(ctx, tmpPath)
    const content = readFileSync(tmpPath, 'utf-8')

    expect(content).not.toContain('<img onerror=alert(1)>')
    expect(content).toContain('&lt;img onerror=alert(1)&gt;')
    expect(content).not.toContain('<b>evil</b>')
    expect(content).toContain('&lt;b&gt;evil&lt;/b&gt;')
  })

  it('escapes XSS payload in severity', () => {
    const tmpPath = join(tmpdir(), `palade-report-${Date.now()}-${Math.random()}.html`)
    tmpPaths.push(tmpPath)
    const ctx = makeContext({ severity: '<style>body{display:none}</style>' })
    writeHtmlReport(ctx, tmpPath)
    const content = readFileSync(tmpPath, 'utf-8')

    expect(content).not.toContain('<style>body{display:none}</style>')
    expect(content).toContain('&lt;style&gt;body{display:none}&lt;/style&gt;')
  })
})
