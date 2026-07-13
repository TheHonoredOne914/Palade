import ts from 'typescript'

const TS_JS_EXTENSION = /\.(tsx?|mtsx?|jsx?|mjs|cjs)$/

// Fallback regex used for non-JS/TS languages (or if AST parsing throws).
// Matches `import ... from '...'`, bare `import '...'`, and `require('...')`.
// Quote-delimited, so it happens to also cover Dart's `import 'x.dart';` and
// PHP's `require('x.php');` — but NOT the non-quoted import syntaxes below.
const FALLBACK_IMPORT_REGEX = /(?:\bimport(?:[\s\S]*?from\s+)?|\brequire\()\s*['"]([^'"]+)['"]/g

// Per-language fallback patterns for languages whose import syntax isn't
// quote-delimited like JS's — without these, centrality (importCount/
// importers) silently stayed 0 for every file in these "supported" languages.
const JAVA_KOTLIN_EXTENSION = /\.(java|kt|kts)$/
const CSHARP_EXTENSION = /\.cs$/
const GO_EXTENSION = /\.go$/
const RUST_EXTENSION = /\.rs$/
const SWIFT_EXTENSION = /\.swift$/
const C_CPP_EXTENSION = /\.(c|h|cpp|cc|hpp|cxx|hxx)$/

const LANGUAGE_IMPORT_PATTERNS: Array<{ test: RegExp; regex: RegExp }> = [
  // Java / Kotlin: `import a.b.C;` / `import static a.b.C;` (Kotlin omits the semicolon)
  { test: JAVA_KOTLIN_EXTENSION, regex: /\bimport\s+(?:static\s+)?([\w.]+(?:\.\*)?)\s*;?/g },
  // C#: `using Some.Namespace;` — excludes the `using (...)` disposable-resource
  // statement, since a `(` can't match the `[\w.]+` namespace group.
  { test: CSHARP_EXTENSION, regex: /\busing\s+(?:static\s+)?([\w.]+)\s*;/g },
  // Rust: `use crate::module::Item;`, `extern crate foo;`
  { test: RUST_EXTENSION, regex: /\b(?:use|extern\s+crate)\s+([\w:]+)/g },
  // Swift: `import Foundation`
  { test: SWIFT_EXTENSION, regex: /\bimport\s+(\w+)/g },
  // C/C++: `#include <stdio.h>` / `#include "myheader.h"`
  { test: C_CPP_EXTENSION, regex: /#include\s*[<"]([^>"]+)[>"]/g },
]

// Go's import syntax needs its own extractor: both the single-line form
// (`import "fmt"`) and the parenthesized block form (`import (\n  "fmt"\n)`)
// have to be handled, and neither is a simple single regex.
function extractGoImports(content: string): string[] {
  const specifiers: string[] = []
  for (const block of content.matchAll(/\bimport\s*\(([\s\S]*?)\)/g)) {
    for (const m of block[1].matchAll(/"([^"]+)"/g)) specifiers.push(m[1])
  }
  for (const m of content.matchAll(/\bimport\s+"([^"]+)"/g)) specifiers.push(m[1])
  return specifiers
}

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
      const res = extractViaAst(content, filePath)
      return res
    } catch {
      // fall through to regex fallback below
    }
  }
  return extractViaRegex(content, filePath)
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

function extractViaRegex(content: string, filePath: string): string[] {
  const specifiers: string[] = []
  let match: RegExpExecArray | null
  FALLBACK_IMPORT_REGEX.lastIndex = 0
  while ((match = FALLBACK_IMPORT_REGEX.exec(content)) !== null) {
    specifiers.push(match[1])
  }

  if (GO_EXTENSION.test(filePath)) {
    specifiers.push(...extractGoImports(content))
  } else {
    for (const { test, regex } of LANGUAGE_IMPORT_PATTERNS) {
      if (!test.test(filePath)) continue
      regex.lastIndex = 0
      for (const m of content.matchAll(regex)) specifiers.push(m[1])
    }
  }

  return Array.from(new Set(specifiers))
}
