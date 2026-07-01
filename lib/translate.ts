import type { TransUnit } from '@/lib/xliff'
import type { LlmConfig } from '@/lib/types'

/**
 * Translate a single trans-unit via the /api/translate proxy, retrying with
 * exponential backoff on rate limits (429) and transient errors.
 */
export async function translateUnit(
  unit: TransUnit,
  targetLanguage: string,
  config: LlmConfig,
  retries = 3
): Promise<string> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceXml: unit.sourceXml,
          targetLanguage,
          apiUrl: config.apiUrl,
          apiKey: config.apiKey,
          model: config.model,
          promptMode: config.promptMode,
          customPrompt: config.customPrompt,
        }),
      })

      if (res.status === 429) {
        // Exponential backoff for rate limits
        const wait = Math.pow(2, attempt) * 1000
        await new Promise((r) => setTimeout(r, wait))
        continue
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }

      const data = await res.json()
      return data.translation
    } catch (err) {
      if (attempt === retries) throw err
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 500))
    }
  }
  throw new Error('Max retries exceeded')
}
