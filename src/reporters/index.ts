export type {
  ReporterContext,
  ReporterOutput,
  TerminalColors,
  ReporterFormat,
  HtmlTemplateData,
  MarkdownTableOptions,
} from './types.js'

export { reportTerminal } from './terminal.js'
export { reportJson, buildJsonReport } from './json.js'
export { writeHtmlReport, startLocalServer, stopLocalServer } from './html.js'
export { reportMarkdown, buildMarkdownReport } from './markdown.js'

import type { ReporterContext, ReporterOutput } from './types.js'
import { reportTerminal } from './terminal.js'
import { reportJson } from './json.js'
import { writeHtmlReport, startLocalServer } from './html.js'
import { reportMarkdown } from './markdown.js'

export interface ReportOptions {
  format: 'terminal' | 'json' | 'html' | 'markdown'
  outputPath?: string
  openBrowser?: boolean
  port?: number
}

export async function generateReport(
  ctx: ReporterContext,
  options: ReportOptions
): Promise<ReporterOutput> {
  switch (options.format) {
    case 'terminal':
      return reportTerminal(ctx)

    case 'json': {
      const outputPath = options.outputPath ?? 'palade-report.json'
      return reportJson(ctx, outputPath)
    }

    case 'html': {
      const outputPath = options.outputPath ?? 'palade-report.html'
      const result = writeHtmlReport(ctx, outputPath)

      if (options.openBrowser !== false && outputPath) {
        startLocalServer(outputPath, options.port ?? 4242, {
          openBrowser: options.openBrowser,
        })
      }

      return result
    }

    case 'markdown': {
      const outputPath = options.outputPath ?? 'palade-report.md'
      return reportMarkdown(ctx, outputPath)
    }

    default:
      throw new Error(`Unknown report format: ${options.format}`)
  }
}

export async function generateAllReports(
  ctx: ReporterContext,
  formats: Array<'terminal' | 'json' | 'html' | 'markdown'>,
  outputDir: string,
  options?: { openBrowser?: boolean; port?: number }
): Promise<ReporterOutput[]> {
  const results: ReporterOutput[] = []

  for (const format of formats) {
    const ext =
      format === 'terminal' ? '' : format === 'json' ? '.json' : format === 'html' ? '.html' : '.md'
    const outputPath = format === 'terminal' ? undefined : `${outputDir}/palade-report${ext}`

    const result = await generateReport(ctx, {
      format,
      outputPath,
      openBrowser: options?.openBrowser,
      port: options?.port,
    })

    results.push(result)
  }

  return results
}
