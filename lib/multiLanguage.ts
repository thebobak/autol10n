import type { TranslationError } from '@/lib/types'

export type LanguageJobStatus = 'queued' | 'translating' | 'paused' | 'done' | 'error'

export interface LanguageJob {
  id: string
  label: string                 // display text, also the exact targetLanguage passed to the LLM
  status: LanguageJobStatus
  progress: number
  total: number
  errors: TranslationError[]
  translatedXml: string | null  // latest serialized output (partial or final)
}

export function createLanguageJob(label: string): LanguageJob {
  return {
    id: `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label,
    status: 'queued',
    progress: 0,
    total: 0,
    errors: [],
    translatedXml: null,
  }
}

export interface MultiLangSessionData {
  fileName: string
  xliffContent: string
  detectedSourceLanguage: string | null
  jobs: LanguageJob[]
  overallStatus: 'idle' | 'running' | 'paused' | 'done'
}

const MULTILANG_SESSION_KEY = 'autol10n_multilang_session'

export function writeMultiLangSession(data: MultiLangSessionData): boolean {
  try {
    localStorage.setItem(MULTILANG_SESSION_KEY, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

export function readMultiLangSession(): MultiLangSessionData | null {
  try {
    const raw = localStorage.getItem(MULTILANG_SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearMultiLangSession() {
  try { localStorage.removeItem(MULTILANG_SESSION_KEY) } catch {}
}
