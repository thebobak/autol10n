// ─── Default system prompt ────────────────────────────────────────────────────
// Displayed in the Settings modal so users know what they're modifying.
// Also used by the API route to construct the final prompt at request time.

export const DEFAULT_SYSTEM_PROMPT =
  'You are a professional localizer. Translate the following text into {targetLanguage}. ' +
  'Preserve all XML/HTML tags exactly as they appear. ' +
  'Output ONLY the translated text with its original tags preserved — ' +
  'no commentary, no explanations, no wrapping.'

/**
 * Build the system prompt sent to the LLM.
 *
 * standard — use the default prompt verbatim
 * append   — default prompt + user's addition (separated by a blank line)
 * replace  — only the user's custom prompt (falls back to default if blank)
 */
export function buildSystemPrompt(
  targetLanguage: string,
  mode: 'standard' | 'append' | 'replace',
  customText: string
): string {
  const base = DEFAULT_SYSTEM_PROMPT.replace('{targetLanguage}', targetLanguage)
  const custom = customText.trim()
  if (mode === 'replace' && custom) return custom.replace('{targetLanguage}', targetLanguage)
  if (mode === 'append' && custom) return `${base}\n\n${custom}`
  return base
}
