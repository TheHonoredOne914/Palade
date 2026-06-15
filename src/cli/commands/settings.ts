import { launchSettingsUI } from '../../ui/settings.js'

export async function settingsCommand(): Promise<void> {
  const projectRoot = process.cwd()
  await launchSettingsUI(projectRoot)
}
