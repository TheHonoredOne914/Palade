import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scoreAgents, type AgentRun, type AgentClaim } from './scorer.js'
import { ALL_DEFECTS } from './groundTruth.js'

const here = fileURLToPath(new URL('.', import.meta.url))
const runsDir = process.argv[2] ?? join(here, 'runs')

let runs: AgentRun[] = []

if (existsSync(runsDir)) {
  const files = readdirSync(runsDir).filter((f) => f.endsWith('.json'))
  for (const f of files) {
    const name = f.replace(/\.json$/, '')
    const raw = JSON.parse(readFileSync(join(runsDir, f), 'utf8')) as AgentClaim[]
    runs.push({ agentName: name, claims: raw })
  }
}

const inline = process.argv[3]
if (inline) {
  const claims = JSON.parse(inline) as AgentClaim[]
  runs.push({ agentName: 'inline', claims })
}

if (runs.length === 0) {
  console.error(
    'No agent runs found. Drop <agent>.json files into src/benchmark/runs/ or pass JSON as the 2nd arg.'
  )
  process.exit(1)
}

const report = scoreAgents(runs, ALL_DEFECTS)
const pad = (s: string, n: number) => s.padEnd(n)
const num = (n: number) => n.toFixed(2)

console.log('\n=== Palade Audit Benchmark — Scoreboard ===\n')
console.log(
  pad('agent', 14) +
    pad('claims', 8) +
    pad('TP', 5) +
    pad('FP', 5) +
    pad('prec', 7) +
    pad('recall', 8) +
    pad('F1', 7) +
    'FPR'
)
console.log('-'.repeat(62))
for (const r of report.perAgent) {
  console.log(
    pad(r.agentName, 14) +
      pad(String(r.claimCount), 8) +
      pad(String(r.truePositives), 5) +
      pad(String(r.falsePositives), 5) +
      pad(num(r.precision), 7) +
      pad(num(r.recall), 8) +
      pad(num(r.f1), 7) +
      num(r.falsePositiveRate)
  )
}
const a = report.aggregate
console.log('-'.repeat(62))
console.log(
  pad('AGGREGATE', 14) +
    pad(String(a.totalClaims), 8) +
    pad('-', 5) +
    pad(String(a.totalFalsePositives), 5) +
    pad(num(a.precision), 7) +
    pad(num(a.recall), 8) +
    pad(num(a.f1), 7) +
    num(a.falsePositiveRate)
)
console.log(
  `\nReal bugs in catalog: ${a.realBugCount} | distinct real bugs found across swarm: ${a.distinctRealBugsFound}\n`
)

for (const r of report.perAgent) {
  if (r.matches.some((m) => m.outcome === 'fp')) {
    console.log(`[${r.agentName}] false positives:`)
    for (const m of r.matches) {
      if (m.outcome === 'fp') {
        console.log(`  - ${m.claim.file}:${m.claim.lineStart} -> ${m.reason}`)
      }
    }
  }
}
