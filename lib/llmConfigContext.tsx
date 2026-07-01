'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { LlmConfig } from '@/lib/types'

export const ONBOARDING_KEY = 'autol10n_onboarded'
const STORAGE_KEY = 'autol10n_config'
export const DEFAULT_API_URL = 'https://llm.atko.ai/v1/chat/completions'
export const DEFAULT_MODEL = 'gemini-3.1-pro-preview'

export const MODEL_GROUPS = [
  {
    group: 'Google',
    models: ['gemini-3.1-pro-preview', 'gemini-3.5-flash', 'gemini-3.1-flash-lite'],
  },
  {
    group: 'Anthropic',
    models: ['claude-sonnet-5', 'claude-sonnet-4-6', 'claude-sonnet-4-5', 'claude-haiku-4-5'],
  },
  {
    group: 'OpenAI',
    models: ['gpt-5', 'gpt-4o', 'gpt-4o-mini'],
  },
]
export const KNOWN_MODELS = MODEL_GROUPS.flatMap((g) => g.models)

interface LlmConfigContextValue {
  config: LlmConfig
  // `mounted` gates any UI that reads from localStorage. Next.js renders the
  // page on the server (where localStorage doesn't exist) and then hydrates
  // on the client. If server and client render different HTML, React throws
  // a hydration error. Keeping localStorage-dependent UI hidden until after
  // the first client-side effect resolves the mismatch.
  mounted: boolean
  // True exactly once, on first mount, if no config was ever saved and the
  // user hasn't completed onboarding. AppShell reads this once to decide
  // whether to show the onboarding modal.
  needsOnboarding: boolean
  saveConfig: (config: LlmConfig) => void
  // Settings modal visibility is shared UI state — both the single-file and
  // batch pages need to be able to open it (e.g. from a "no API key" banner),
  // even though the modal itself is rendered once by AppShell.
  showSettings: boolean
  openSettings: () => void
  closeSettings: () => void
}

const LlmConfigContext = createContext<LlmConfigContextValue | null>(null)

export function LlmConfigProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [config, setConfig] = useState<LlmConfig>({
    apiUrl: DEFAULT_API_URL,
    apiKey: '',
    model: DEFAULT_MODEL,
    promptMode: 'standard',
    customPrompt: '',
  })

  useEffect(() => {
    setMounted(true)
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      const hasOnboarded = !!localStorage.getItem(ONBOARDING_KEY)
      if (stored) {
        const parsed: LlmConfig = { promptMode: 'standard', customPrompt: '', ...JSON.parse(stored) }
        setConfig(parsed)
        if (!hasOnboarded && !parsed.apiKey) setNeedsOnboarding(true)
      } else {
        if (!hasOnboarded) setNeedsOnboarding(true)
      }
    } catch {}
  }, [])

  const saveConfig = (newConfig: LlmConfig) => {
    setConfig(newConfig)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig)) } catch {}
  }

  return (
    <LlmConfigContext.Provider
      value={{
        config,
        mounted,
        needsOnboarding,
        saveConfig,
        showSettings,
        openSettings: () => setShowSettings(true),
        closeSettings: () => setShowSettings(false),
      }}
    >
      {children}
    </LlmConfigContext.Provider>
  )
}

export function useLlmConfigContext(): LlmConfigContextValue {
  const ctx = useContext(LlmConfigContext)
  if (!ctx) throw new Error('useLlmConfigContext must be used within LlmConfigProvider')
  return ctx
}
