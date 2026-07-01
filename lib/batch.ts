import type { TranslationError } from '@/lib/types'

export type BatchFileStatus = 'queued' | 'translating' | 'paused' | 'done' | 'error' | 'skipped'

export interface BatchFile {
  id: string
  fileName: string
  xliffContent: string          // original uploaded source, kept for queued files
  detectedSourceLanguage: string | null
  status: BatchFileStatus
  progress: number
  total: number
  errors: TranslationError[]
  translatedXml: string | null  // latest serialized output (partial or final)
  parseError: string | null     // set when this file failed to parse as XLIFF
}

export function createBatchFile(fileName: string, xliffContent: string, detectedSourceLanguage: string | null): BatchFile {
  return {
    id: `${fileName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fileName,
    xliffContent,
    detectedSourceLanguage,
    status: 'queued',
    progress: 0,
    total: 0,
    errors: [],
    translatedXml: null,
    parseError: null,
  }
}

export interface BatchSessionData {
  targetLanguage: string
  customLanguage: string
  files: BatchFile[]
  overallStatus: 'idle' | 'running' | 'paused' | 'done'
}

const BATCH_SESSION_KEY = 'autol10n_batch_session'

export function writeBatchSession(data: BatchSessionData): boolean {
  try {
    localStorage.setItem(BATCH_SESSION_KEY, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

export function readBatchSession(): BatchSessionData | null {
  try {
    const raw = localStorage.getItem(BATCH_SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearBatchSession() {
  try { localStorage.removeItem(BATCH_SESSION_KEY) } catch {}
}
