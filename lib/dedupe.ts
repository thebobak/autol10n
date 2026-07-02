import type { TransUnit } from '@/lib/xliff'
import { getTranslatedXml } from '@/lib/xliff'
import type { LlmConfig } from '@/lib/types'
import type { GlossaryTerm } from '@/lib/glossary'
import { translateUnit } from '@/lib/translate'

/**
 * Maps a trans-unit's exact source XML to its translated XML. Articulate
 * Rise courses frequently repeat identical strings (nav labels, button
 * text) across many trans-units — reusing a prior translation for an exact
 * source match skips the LLM call entirely instead of re-translating it.
 */
export type TranslationCache = Map<string, string>

/**
 * Translate a unit through the cache: an exact match on `unit.sourceXml`
 * returns the cached translation without calling the LLM. On a cache miss,
 * translates normally via translateUnit() and stores the result for reuse.
 */
export async function translateUnitCached(
  cache: TranslationCache,
  unit: TransUnit,
  targetLanguage: string,
  config: LlmConfig,
  glossaryTerms: GlossaryTerm[] = []
): Promise<string> {
  const cached = cache.get(unit.sourceXml)
  if (cached !== undefined) return cached
  const translated = await translateUnit(unit, targetLanguage, config, 3, glossaryTerms)
  cache.set(unit.sourceXml, translated)
  return translated
}

/**
 * Pre-populate a cache from units that are already translated — e.g. the
 * first `doneCount` units in a sequential translation loop are guaranteed
 * to already have a <target> when resuming a paused run.
 */
export function buildTranslationCache(units: TransUnit[], doneCount: number): TranslationCache {
  const cache: TranslationCache = new Map()
  for (let i = 0; i < doneCount && i < units.length; i++) {
    const xml = getTranslatedXml(units[i])
    if (xml !== null) cache.set(units[i].sourceXml, xml)
  }
  return cache
}
