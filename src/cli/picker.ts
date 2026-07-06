import { askCheckbox } from '../ui/prompt.js'
import type { FileManifest } from '../ingestion/types.js'

export async function launchPicker(
  projectRoot: string,
  manifests: FileManifest[]
): Promise<string[]> {
  if (manifests.length === 0) {
    return []
  }

  if (!process.stdin.isTTY) {
    console.log('  --pick requires an interactive terminal.')
    return []
  }

  const choices = manifests.map((m) => m.path)

  const selected = await askCheckbox('Select files to review:', choices)

  if (!selected || selected.length === 0) {
    return []
  }

  return selected
}
