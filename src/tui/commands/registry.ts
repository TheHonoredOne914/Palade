export interface CommandDef {
  name: string
  args?: string
  description: string
  usage: string
  examples: string[]
}

export const COMMAND_REGISTRY: CommandDef[] = [
  {
    name: 'review',
    args: '[path]',
    description: 'Run a full swarm review',
    usage: '/review [path] [--target <name>] [--mode <mode>] [--dir <dir>] [--pick]',
    examples: [
      '/review',
      '/review ./src',
      '/review --target auth',
      '/review --mode security',
      '/review --mode ghost',
      '/review --pick',
    ],
  },
  {
    name: 'score',
    args: '',
    description: 'Show current health score and history',
    usage: '/score [--history]',
    examples: ['/score', '/score --history'],
  },
  {
    name: 'diff',
    args: '[--base <branch>]',
    description: 'Review changes vs a base branch',
    usage: '/diff [--base <branch>]',
    examples: ['/diff', '/diff --base main', '/diff --base develop'],
  },
  {
    name: 'watch',
    args: '',
    description: 'Start drift detection watcher',
    usage: '/watch [--sensitivity low|medium|high]',
    examples: ['/watch', '/watch --sensitivity high'],
  },
  {
    name: 'targets',
    args: '<list|search|add>',
    description: 'Manage review targets',
    usage: '/targets list | /targets search <query> | /targets add <pack>',
    examples: [
      '/targets list',
      '/targets search nextjs',
      '/targets add palade-target-express',
    ],
  },
  {
    name: 'settings',
    args: '',
    description: 'Open the interactive settings manager',
    usage: '/settings',
    examples: ['/settings'],
  },
  {
    name: 'init',
    args: '',
    description: 'Scaffold Palade config in this directory',
    usage: '/init',
    examples: ['/init'],
  },
  {
    name: 'clear',
    args: '',
    description: 'Clear the output pane',
    usage: '/clear',
    examples: ['/clear'],
  },
  {
    name: 'help',
    args: '[command]',
    description: 'Show available commands',
    usage: '/help [command]',
    examples: ['/help', '/help review', '/help diff'],
  },
  {
    name: 'exit',
    args: '',
    description: 'Exit Palade',
    usage: '/exit',
    examples: ['/exit'],
  },
]
