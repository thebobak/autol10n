export interface LlmConfig {
  apiUrl: string
  apiKey: string
  model: string
}

export interface TranslationError {
  unitId: string
  message: string
}

export type TranslationStatus = 'idle' | 'translating' | 'paused' | 'done' | 'error'
