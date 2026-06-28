// palade.targets.ts
// Define named subsystems to audit with focused agent context.
export default [
  {
    name: 'orchestrator',
    description: 'The core pipeline that manages code chunking, token budgets, agent scheduling, and merging results.',
    entry: ['src/orchestrator/'],
    focus: ['token budget enforcement', 'error propagation', 'race conditions'],
  },
  {
    name: 'review-command',
    description: 'The CLI review command implementation that triggers the code review process',
    entry: ["src/cli/commands/review.ts"],
    focus: ["Argument parsing and validation","Error handling and edge cases","Asynchronous command flow and state management","Integration with diff and target subsystems"],
  },

{
    name: 'provider-routing',
    description: 'The provider system for LLM integrations and routing logic that directs requests to appropriate models.',
    entry: ["src/providers/"],
    focus: ["Provider selection and fallback logic, including retries and error handling","Configuration and initialization of LLM providers (API keys, endpoints, models)","Routing decisions: load balancing, priority, and routing rules across providers"],
  },

{
    name: 'provider-layer',
    description: 'The provider abstraction layer for AI model backends, including routing, retries, and connection pooling.',
    entry: ["src/providers"],
    focus: ["Error handling and retry logic (backoff strategies, transient failures)","Configuration and initialization (provider registration, credential loading)","Router selection and fallback (load balancing, provider availability)","Connection pooling and resource management (concurrent usage, cleanup)"],
  },
]
