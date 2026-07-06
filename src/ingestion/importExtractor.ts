import ts from 'typescript'

const TS_JS_EXTENSION = /\.(tsx?|mtsx?|jsx?|mjs|cjs)$/

// Fallback regex used for non-JS/TS languages (or if AST parsing throws).
// Matches `import ... from '...'`, bare `import '...'`, and `require('...')`.
const FALLBACK_IMPORT_REGEX = /(?:\bimport(?:[\s\S]*?from\s+)?|\brequire\()\s*['"]([^'"]+)['"]/g

/**
 * Extract raw import/require specifier strings from source code.
 *
 * Uses the TypeScript AST for .ts/.tsx/.js/.jsx/.mjs/.cjs files (the most
 * robust approach — avoids false positives from strings/comments that a
 * naive regex would match). Falls back to a regex scan for other languages,
 * or if AST parsing throws.
 *
 * Returns ALL specifiers (both relative/local and bare package imports),
 * deduplicated, in first-seen order.
 */
export function extractImportSpecifiers(content: string, filePath: string): string[] {
  if (TS_JS_EXTENSION.test(filePath)) {
    try {
      return extractViaAst(content, filePath)
    } catch {
      // fall through to regex fallback below
    }
  }
  return extractViaRegex(content)
}

function extractViaAst(content: string, filePath: string): string[] {
  const specifiers: string[] = []
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true)

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier
      if (ts.isStringLiteral(moduleSpecifier)) {
        specifiers.push(moduleSpecifier.text)
      }
    } else if (
      ts.isCallExpression(node) &&
      node.expression.getText(sourceFile) === 'require' &&
      node.arguments.length === 1
    ) {
      const arg = node.arguments[0]
      if (ts.isStringLiteral(arg)) {
        specifiers.push(arg.text)
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  return Array.from(new Set(specifiers))
}

function extractViaRegex(content: string): string[] {
  const specifiers: string[] = []
  let match: RegExpExecArray | null
  FALLBACK_IMPORT_REGEX.lastIndex = 0
  while ((match = FALLBACK_IMPORT_REGEX.exec(content)) !== null) {
    specifiers.push(match[1])
  }
  return Array.from(new Set(specifiers))
}
