import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

/**
 * Like rl.question(), but resolves with null if the input stream closes
 * (e.g. Ctrl+D) before an answer is given, instead of hanging forever —
 * readline/promises' rl.question() never resolves on its own on stream EOF.
 */
async function askQuestionOrClose(query: string): Promise<string | null> {
  const rl = readline.createInterface({ input, output })
  try {
    return await new Promise<string | null>((resolve) => {
      rl.question(query).then(resolve)
      rl.once('close', () => resolve(null))
    })
  } finally {
    rl.close()
  }
}

export async function askQuestion(query: string): Promise<string> {
  if (process.env.PALADE_TUI) {
    console.warn('[prompt] Readline blocked under TUI')
    return ''
  }
  const answer = await askQuestionOrClose(query)
  return answer ?? ''
}

export async function askConfirm(query: string, defaultYes = true): Promise<boolean> {
  const defaultStr = defaultYes ? 'Y/n' : 'y/N'
  const answer = await askQuestion(`${query} (${defaultStr}) `)
  const trimmed = answer.trim().toLowerCase()
  if (!trimmed) return defaultYes
  return trimmed === 'y' || trimmed === 'yes'
}

export async function askList(query: string, choices: string[]): Promise<string> {
  console.log(query)
  choices.forEach((choice, index) => {
    console.log(`  ${index + 1}) ${choice}`)
  })
  while (true) {
    const answer = await askQuestionOrClose(`Select 1-${choices.length}: `)
    // If stdin is closed (piped input ended, or Ctrl+D), exit the loop instead
    // of printing "Invalid selection." forever.
    if (answer === null || answer === undefined) {
      console.log('\nInput closed, selecting first option.')
      return choices[0]
    }
    const num = parseInt(answer.trim(), 10)
    if (!isNaN(num) && num >= 1 && num <= choices.length) {
      return choices[num - 1]
    }
    console.log('Invalid selection.')
  }
}
export async function askCheckbox(query: string, choices: string[]): Promise<string[]> {
  console.log(query)
  choices.forEach((choice, index) => {
    console.log(`  ${index + 1}) ${choice}`)
  })
  while (true) {
    const answer = await askQuestionOrClose(
      `Select options by number (e.g. "1 2 4", or "all", or "none"): `
    )
    // If stdin is closed (piped input ended, or Ctrl+D), exit the loop
    if (answer === null || answer === undefined) {
      console.log('\nInput closed, selecting no options.')
      return []
    }
    const trimmed = answer.trim().toLowerCase()
    if (trimmed === 'all') return choices
    if (trimmed === 'none' || trimmed === '') return []

    const parts = trimmed.split(/\s+/)
    const selected: string[] = []
    let valid = true
    for (const part of parts) {
      const num = parseInt(part, 10)
      if (isNaN(num) || num < 1 || num > choices.length) {
        valid = false
        break
      }
      selected.push(choices[num - 1])
    }
    if (valid) return selected
    console.log('Invalid selection.')
  }
}
