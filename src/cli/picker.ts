import inquirer from 'inquirer'
import type { TargetDefinition } from '../targets/schema.js'

export interface PickerChoice {
  name: string
  value: string
  description: string
}

export async function launchPicker(
  targets: TargetDefinition[]
): Promise<TargetDefinition[]> {
  if (targets.length === 0) {
    return []
  }

  const choices: PickerChoice[] = targets.map((t) => ({
    name: `${t.name} — ${t.description}`,
    value: t.name,
    description: Array.isArray(t.entry) ? t.entry.join(', ') : t.entry
  }))

  const answer = await inquirer.prompt<{ selected: string[] }>([
    {
      type: 'checkbox',
      name: 'selected',
      message: 'Select targets to review:',
      choices
    }
  ])

  if (!answer.selected || answer.selected.length === 0) {
    return []
  }

  return targets.filter((t) => answer.selected.includes(t.name))
}
