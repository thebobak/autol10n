export interface GlossaryTerm {
  id: string
  sourceTerm: string
  translation: string
}

// Keyed by target language label — the same string used as `targetLanguage`
// everywhere else (e.g. "Spanish (es-ES)", or a free-text custom entry) —
// so it lines up with LANGUAGE_OPTIONS with no extra mapping layer.
export type Glossary = Record<string, GlossaryTerm[]>

export function createGlossaryTerm(sourceTerm: string, translation: string): GlossaryTerm {
  return {
    id: `${sourceTerm}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sourceTerm,
    translation,
  }
}

const GLOSSARY_KEY = 'autol10n_glossary'

export function readGlossary(): Glossary {
  try {
    const raw = localStorage.getItem(GLOSSARY_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function writeGlossary(glossary: Glossary): boolean {
  try {
    localStorage.setItem(GLOSSARY_KEY, JSON.stringify(glossary))
    return true
  } catch {
    return false
  }
}

export function clearGlossary() {
  try { localStorage.removeItem(GLOSSARY_KEY) } catch {}
}

/**
 * Return only the terms (for `language`) whose sourceTerm literally appears
 * in `sourceXml` — the per-request filtering step that keeps prompts small:
 * most segments reference no glossary term at all, so most requests carry
 * no extra instructions.
 */
export function matchingTerms(glossary: Glossary, language: string, sourceXml: string): GlossaryTerm[] {
  const terms = glossary[language]
  if (!terms || terms.length === 0) return []
  return terms.filter((t) => t.sourceTerm && sourceXml.includes(t.sourceTerm))
}

/**
 * Parse a simple 2-column "Source Term,Translation" CSV. Tolerates a header
 * row (skipped if it's exactly "Source Term,Translation") and quoted fields
 * containing commas. Not a full RFC 4180 parser — glossary terms are short,
 * single-line strings, so this naive approach covers the realistic input.
 */
export function parseGlossaryCsv(csv: string): GlossaryTerm[] {
  const lines = csv.split(/\r\n|\n|\r/).filter((line) => line.trim().length > 0)
  const terms: GlossaryTerm[] = []

  for (const line of lines) {
    const cells = parseCsvLine(line)
    if (cells.length < 2) continue
    const [sourceTerm, translation] = cells
    if (sourceTerm === 'Source Term' && translation === 'Translation') continue // header row
    if (!sourceTerm.trim()) continue
    terms.push(createGlossaryTerm(sourceTerm, translation))
  }

  return terms
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        current += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      cells.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current)
  return cells
}

/**
 * Serialize terms back to a 2-column CSV with a header row, quoting any
 * field that contains a comma or double quote.
 */
export function toGlossaryCsv(terms: GlossaryTerm[]): string {
  const escape = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const rows = [
    'Source Term,Translation',
    ...terms.map((t) => `${escape(t.sourceTerm)},${escape(t.translation)}`),
  ]
  return rows.join('\n')
}
