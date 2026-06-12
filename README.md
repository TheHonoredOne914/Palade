# Palade — Phase Build Files

Each file is a self-contained IDE prompt for one build phase.
Give phases to the IDE in order. Do not skip.
Attach `palade-prd.md` and `palade-trd.md` to every session.

---

| File | Phase | What Gets Built |
|------|-------|-----------------|
| `phase-01-scaffold.md` | 1 | Project setup, config system, `palade init` |
| `phase-02-ingestion.md` | 2 | File walker, chunker, symbol resolver, annotations |
| `phase-03-providers.md` | 3 | Groq, Cerebras, NVIDIA adapters + router |
| `phase-04-agents.md` | 4 | 6 specialist agents + synthesis agent |
| `phase-05-orchestrator.md` | 5 | Swarm executor, scheduler, memory, merger |
| `phase-06-targets.md` | 6 | Custom targets, scope resolution, `--pick` picker |
| `phase-07-scorer.md` | 7 | Health score, badge SVG, history tracking |
| `phase-08-reporters.md` | 8 | Terminal, JSON, HTML report, markdown output |
| `phase-09-cli.md` | 9 | All CLI commands wired end-to-end |
| `phase-10-modes.md` | 10 | Security, Onboard, Debt, Ghost review modes |
| `phase-11-annotations.md` | 11 | `@palade` inline comment system |
| `phase-12-hardening.md` | 12 | Error handling, rate limits, production safety |

---

## Milestone Check (after Phase 5)

Before continuing to Phase 6, this must work:

```bash
GROQ_API_KEY=xxx npx palade review ./test-project
```

- Live agent spinners in terminal
- At least one finding returned
- HTML report opens in browser
- JSON saved to `.palade/reports/`
- Score printed

If this doesn't work, debug before continuing.
