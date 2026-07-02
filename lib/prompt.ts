import type { GlossaryTerm } from '@/lib/glossary'

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
 *
 * glossaryTerms, if provided, is appended as a final instruction block
 * regardless of mode — glossary enforcement is additive to whichever prompt
 * customization the user has chosen, not a fourth mode.
 */
export function buildSystemPrompt(
  targetLanguage: string,
  mode: 'standard' | 'append' | 'replace',
  customText: string,
  glossaryTerms: GlossaryTerm[] = []
): string {
  const base = DEFAULT_SYSTEM_PROMPT.replace('{targetLanguage}', targetLanguage)
  const custom = customText.trim()

  let prompt: string
  if (mode === 'replace' && custom) prompt = custom.replace('{targetLanguage}', targetLanguage)
  else if (mode === 'append' && custom) prompt = `${base}\n\n${custom}`
  else prompt = base

  if (glossaryTerms.length > 0) {
    const lines = glossaryTerms.map((t) => `"${t.sourceTerm}" → "${t.translation}"`)
    prompt += `\n\nUse these exact translations for the following terms if they appear in the text:\n${lines.join('\n')}`
  }

  return prompt
}
