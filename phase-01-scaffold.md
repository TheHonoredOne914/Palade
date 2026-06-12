# PALADE — PHASE 1: Project Scaffold + Config System

**Project:** Palade (open-source AI codebase review CLI)
**Depends on:** Nothing — this is the foundation
**Next phase:** Phase 2 — Ingestion Pipeline

---

## What You Are Building

The bare project scaffold for a TypeScript CLI tool called Palade.
After this phase: `npx palade init` works, config loads from env vars or a config file, and the project compiles cleanly.

---

## Tech Stack

```
Runtime:     Node.js 18+ (ESM)
Language:    TypeScript (strict)
CLI:         Commander.js
Validation:  Zod
Package:     npm
Binary:      npx palade
```

---

## Folder Structure to Create

```
palade/
├── src/
│   ├── cli/
│   │   ├── index.ts
│   │   └── commands/
│   │       └── init.ts
│   └── config/
│       ├── loader.ts
│       ├── schema.ts
│       └── defaults.ts
├── package.json
├── tsconfig.json
└── README.md
```

---

## Tasks

### 1. `package.json`

```json
{
  "name": "palade",
  "version": "0.1.0",
  "type": "module",
  "bin": { "palade": "./dist/cli/index.js" },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/cli/index.ts",
    "start": "node dist/cli/index.js"
  },
  "dependencies": {
    "commander": "^12.0.0",
    "inquirer": "^9.0.0",
    "zod": "^3.22.0",
    "p-limit": "^5.0.0",
    "tree-sitter": "^0.21.0",
    "tree-sitter-typescript": "^0.21.0",
    "tree-sitter-javascript": "^0.21.0",
    "tree-sitter-python": "^0.21.0",
    "chokidar": "^3.6.0",
    "open": "^10.0.0",
    "chalk": "^5.3.0",
    "ora": "^8.0.0",
    "ignore": "^5.3.0",
    "glob": "^10.3.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/node": "^20.0.0",
    "tsx": "^4.7.0"
  }
}
```

### 2. `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 3. `src/config/schema.ts`

Define and export the full `PaladeConfig` Zod schema:

```ts
import { z } from 'zod'

const ProviderConfigSchema = z.object({
  apiKey: z.string().min(1),
  model: z.string().optional(),
  maxConcurrency: z.number().int().min(1).max(20).optional()
})

export const PaladeConfigSchema = z.object({
  providers: z.object({
    groq: ProviderConfigSchema.optional(),
    cerebras: ProviderConfigSchema.optional(),
    nvidia: ProviderConfigSchema.extend({
      baseUrl: z.string().url().optional()
    }).optional()
  }),
  swarm: z.object({
    primary: z.enum(['groq', 'cerebras', 'nvidia']),
    synthesis: z.enum(['groq', 'cerebras', 'nvidia']),
    agentCount: z.number().int().min(1).max(12).default(6),
    timeoutMs: z.number().int().default(120000)
  }),
  output: z.object({
    dir: z.string().default('.palade/reports'),
    formats: z.array(z.enum(['html', 'json', 'md'])).default(['html', 'json']),
    openBrowser: z.boolean().default(true),
    port: z.number().int().default(4242)
  }).default({}),
  score: z.object({
    historyFile: z.string().default('.palade/history.json'),
    badge: z.boolean().default(true),
    badgePath: z.string().default('palade-badge.svg')
  }).default({})
})

export type PaladeConfig = z.infer<typeof PaladeConfigSchema>
```

### 4. `src/config/defaults.ts`

```ts
import { PaladeConfig } from './schema.js'

export const DEFAULT_CONFIG: Partial<PaladeConfig> = {
  swarm: {
    primary: 'groq',
    synthesis: 'cerebras',
    agentCount: 6,
    timeoutMs: 120000
  },
  output: {
    dir: '.palade/reports',
    formats: ['html', 'json'],
    openBrowser: true,
    port: 4242
  },
  score: {
    historyFile: '.palade/history.json',
    badge: true,
    badgePath: 'palade-badge.svg'
  }
}
```

### 5. `src/config/loader.ts`

- Look for `palade.config.ts` in `process.cwd()`
- If found: dynamic import it, validate with Zod schema
- If not found: build config from env vars:
  - `GROQ_API_KEY` → `providers.groq.apiKey`
  - `CEREBRAS_API_KEY` → `providers.cerebras.apiKey`
  - `NVIDIA_API_KEY` → `providers.nvidia.apiKey`
- Merge with `DEFAULT_CONFIG`
- On Zod validation error: print human-readable field path + message, exit with code 1
- **Never log the actual API key values**
- Export `loadConfig(): Promise<PaladeConfig>`

### 6. `src/cli/commands/init.ts`

`palade init` command. When run in a directory:

**a) Scaffold `palade.config.ts`** (if not already present):
```ts
// palade.config.ts
export default {
  providers: {
    groq: { apiKey: process.env.GROQ_API_KEY ?? '' },
    cerebras: { apiKey: process.env.CEREBRAS_API_KEY ?? '' },
  },
  swarm: {
    primary: 'groq',
    synthesis: 'cerebras',
  }
}
```

**b) Scaffold `palade.targets.ts`** (if not already present):
```ts
// palade.targets.ts
// Define named subsystems to audit with focused agent context.
export default [
  // {
  //   name: 'my-feature',
  //   description: 'Describe what this subsystem does and what to look for',
  //   entry: ['src/my-feature/'],
  //   focus: ['data flow', 'error handling'],
  // }
]
```

**c) Scaffold `.paladeignore`** (if not already present):
```
node_modules/
dist/
build/
.git/
*.lock
*.min.js
*.min.css
coverage/
.palade/
```

**d) Create `.palade/` directory**

**e) Update `.gitignore`** (append if file exists, create if not):
```
# Palade
palade.config.ts
.palade/
```

**f) Print success:**
```
✓ palade.config.ts created
✓ palade.targets.ts created
✓ .paladeignore created
✓ .gitignore updated
✓ .palade/ directory created

Next steps:
  1. Add your API keys to palade.config.ts or set env vars
  2. Run: npx palade review
```

### 7. `src/cli/index.ts`

Main CLI entry. Wire Commander.js. For now only `init` command. Stub placeholders for all other commands (they will be wired in Phase 9):

```ts
import { Command } from 'commander'
import { initCommand } from './commands/init.js'

const program = new Command()

program
  .name('palade')
  .description('AI-powered codebase intelligence engine')
  .version('0.1.0')

program
  .command('init')
  .description('Scaffold Palade config in the current directory')
  .action(initCommand)

// Stubs — implemented in Phase 9:
program.command('review').description('Review codebase with AI swarm').action(() => {
  console.log('Phase 9: not yet implemented')
})
program.command('diff').description('Branch pre-flight review').action(() => {
  console.log('Phase 9: not yet implemented')
})
program.command('score').description('Show codebase health score').action(() => {
  console.log('Phase 9: not yet implemented')
})
program.command('watch').description('Drift detection watcher').action(() => {
  console.log('Phase 9: not yet implemented')
})

program.parse()
```

### 8. Test Project

Create `test-project/` in the repo root. A small TypeScript Express-style app (~10 files) with these intentional flaws baked in:

- An unused exported function in `utils.ts`
- A hardcoded string in `config.ts` that looks like a secret: `const DB_PASSWORD = "hunter2"`
- The same validation logic copy-pasted in two different route files
- A route handler with no input validation whatsoever
- A class `ReportGenerator` that is fully implemented but never instantiated or called anywhere
- A `TODO: fix this` comment on top of complex logic with no documentation

This is the standard smoke test for every phase going forward.

---

## Acceptance Criteria

- `npm run build` compiles with zero TypeScript errors
- `npx palade init` runs in an empty directory and creates all 5 artifacts
- Running `palade init` twice does not overwrite existing files (check before writing)
- Config loads correctly from env vars when no `palade.config.ts` present
- Zod validation error prints: `Config error at providers.groq.apiKey: Required` (not a stack trace)
- API key values never appear in any terminal output

---

## Rules for This Phase

- ESM only — all imports end in `.js` extension (TypeScript ESM requirement)
- No `any` types
- Every exported function has a TypeScript return type annotation
- `src/config/loader.ts` is the single source of config truth — nothing reads env vars directly except this file
