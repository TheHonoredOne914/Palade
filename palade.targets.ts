// palade.targets.ts
// Define named subsystems to audit with focused agent context.
export default [
  {
    name: 'orchestrator',
    description: 'The core pipeline that manages code chunking, token budgets, agent scheduling, and merging results.',
    entry: ['src/orchestrator/'],
    focus: ['token budget enforcement', 'error propagation', 'race conditions'],
  }

{
    name: 'review-command',
    description: 'The CLI review command implementation that triggers the code review process',
    entry: ["src/cli/commands/review.ts"],
    focus: ["Argument parsing and validation","Error handling and edge cases","Asynchronous command flow and state management","Integration with diff and target subsystems"],
  },
]
