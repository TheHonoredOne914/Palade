import inquirer from 'inquirer'
import type { FileManifest } from '../ingestion/types.js'

export async function launchPicker(
  projectRoot: string,
  manifests: FileManifest[]
): Promise<string[]> {
  if (manifests.length === 0) {
    return []
  }

  const choices = manifests.map((m) => ({
    name: m.path,
    value: m.path,
  }))

  const answer = await inquirer.prompt<{ selected: string[] }>([
    {
      type: 'checkbox',
      name: 'selected',
      message: 'Select files to review:',
      choices,
    },
  ])

  if (!answer.selected || answer.selected.length === 0) {
    return []
  }

  return answer.selected
}
