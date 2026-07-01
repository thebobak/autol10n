/**
 * Insert a suffix before the file extension, preserving the original
 * extension (.xlf or .xliff) exactly.
 *
 * A naive regex like /\.xlf(f?)$/ with replacement '_suffix.$1' mishandles
 * .xliff — the capture group only holds the trailing "f", producing
 * "_suffix.f" instead of "_suffix.xliff". Capturing the full extension
 * avoids that.
 */
export function withSuffix(fileName: string, suffix: string, fallback: string): string {
  const match = fileName.match(/\.(xlf|xliff)$/i)
  if (!match) return fallback
  return fileName.slice(0, -match[0].length) + suffix + match[0]
}

/**
 * Extract a short, filename-safe code from a language label for use in zip
 * entry names — e.g. "Spanish (es-ES)" -> "es-ES". Labels without a
 * parenthesized code (typically free-text "Other" entries) fall back to a
 * sanitized version of the whole label.
 */
export function extractLangCode(label: string): string {
  const match = label.match(/\(([^)]+)\)\s*$/)
  const raw = match ? match[1] : label
  return raw.trim().replace(/[^a-zA-Z0-9-]+/g, '_').replace(/^_+|_+$/g, '') || 'other'
}
