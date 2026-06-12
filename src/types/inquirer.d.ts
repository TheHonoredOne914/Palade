declare module 'inquirer' {
  interface Question {
    type: string
    name: string
    message: string | (() => string)
    choices?: Array<{ name: string; value: string; description?: string } | string>
    default?: unknown
    validate?: (input: unknown) => boolean | string | Promise<boolean | string>
  }

  function prompt<T extends Record<string, unknown>>(
    questions: Question[]
  ): Promise<T>

  export { prompt }
  export default { prompt }
}
