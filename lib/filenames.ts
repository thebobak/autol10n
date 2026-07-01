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
