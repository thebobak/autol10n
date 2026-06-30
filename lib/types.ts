export interface LlmConfig {
  apiUrl: string
  apiKey: string
  model: string
  promptMode: 'standard' | 'append' | 'replace'
  customPrompt: string
}

export interface TranslationError {
  unitId: string
  message: string
}

export type TranslationStatus = 'idle' | 'translating' | 'paused' | 'done' | 'error'
