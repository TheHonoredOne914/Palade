import { askCheckbox } from '../ui/prompt.js'
import type { FileManifest } from '../ingestion/types.js'

// --pick used to list every matched file with no cap, flooding the terminal
// on a large repo. Cap the displayed/selectable list and point the user at
// narrowing their scope instead (clihui-008).
const PICK_DISPLAY_CAP = 200

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

  let displayManifests = manifests
  if (manifests.length > PICK_DISPLAY_CAP) {
    console.log(
      `  ${manifests.length} files match — showing the first ${PICK_DISPLAY_CAP}. ` +
        `Narrow your scope with --dir/--glob/--file to pick from the rest.`
    )
    displayManifests = manifests.slice(0, PICK_DISPLAY_CAP)
  }

  const choices = displayManifests.map((m) => m.path)

  const selected = await askCheckbox('Select files to review:', choices)

  if (!selected || selected.length === 0) {
    return []
  }

  return selected
}
