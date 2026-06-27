// palade.targets.ts
// Define named subsystems to audit with focused agent context.
export default [
  {
    name: 'orchestrator',
    description: 'The core pipeline that manages code chunking, token budgets, agent scheduling, and merging results.',
    entry: ['src/orchestrator/'],
    focus: ['token budget enforcement', 'error propagation', 'race conditions'],
  }
]
