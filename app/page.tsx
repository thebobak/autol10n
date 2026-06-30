'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { parseXliff, setTranslation, serializeXliff, type TransUnit } from '@/lib/xliff'
import type { LlmConfig, TranslationError, TranslationStatus } from '@/lib/types'
import OnboardingModal from '@/components/OnboardingModal'
import TourModal from '@/components/TourModal'
import InfoModal from '@/components/InfoModal'
import ReviewDrawer, { type DrawerState } from '@/components/ReviewDrawer'

const ONBOARDING_KEY = 'autol10n_onboarded'

const STORAGE_KEY = 'autol10n_config'
const DEFAULT_API_URL = 'https://llm.atko.ai/v1/chat/completions'
const DEFAULT_MODEL = 'gpt-4o'

const MODEL_GROUPS = [
  { group: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { group: 'Anthropic', models: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'] },
  { group: 'Google', models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'] },
  { group: 'Meta / Llama', models: ['llama-3.3-70b-instruct', 'llama-3.1-8b-instruct'] },
  { group: 'Mistral', models: ['mistral-large-latest', 'mistral-small-latest'] },
]
const KNOWN_MODELS = MODEL_GROUPS.flatMap((g) => g.models)

const LANGUAGE_OPTIONS = [
  'Spanish (es-ES)', 'Spanish (es-MX)', 'French (fr-FR)', 'French (fr-CA)',
  'German (de-DE)', 'Italian (it-IT)', 'Portuguese (pt-BR)', 'Portuguese (pt-PT)',
  'Japanese (ja-JP)', 'Korean (ko-KR)', 'Chinese Simplified (zh-CN)',
  'Chinese Traditional (zh-TW)', 'Arabic (ar)', 'Dutch (nl-NL)',
  'Polish (pl-PL)', 'Russian (ru-RU)', 'Swedish (sv-SE)', 'Turkish (tr-TR)',
]

function formatTimeRemaining(ms: number): string {
  const sec = Math.round(ms / 1000)
  if (sec <= 3) return 'almost done'
  if (sec < 60) return `~${sec}s remaining`
  const min = Math.floor(sec / 60)
  const s = sec % 60
  return s > 0 ? `~${min}m ${s}s remaining` : `~${min}m remaining`
}

async function translateUnit(
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

export default function Home() {
  // `mounted` gates any UI that reads from localStorage. Next.js renders the
  // page on the server (where localStorage doesn't exist) and then hydrates
  // on the client. If server and client render different HTML, React throws a
  // hydration error. Keeping localStorage-dependent UI hidden until after the
  // first client-side effect resolves the mismatch.
  const [mounted, setMounted] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showTour, setShowTour] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [showReview, setShowReview] = useState(false)
  const [hasReviewEdits, setHasReviewEdits] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [config, setConfig] = useState<LlmConfig>({
    apiUrl: DEFAULT_API_URL,
    apiKey: '',
    model: DEFAULT_MODEL,
  })
  // `configDraft` is the working copy inside the Settings modal. It is only
  // promoted to `config` when the user clicks Save, so cancelling discards
  // changes without affecting the running translation or other UI state.
  const [configDraft, setConfigDraft] = useState<LlmConfig>(config)

  const [targetLanguage, setTargetLanguage] = useState('')
  const [customLanguage, setCustomLanguage] = useState('')
  const [fileName, setFileName] = useState('')
  const [xliffContent, setXliffContent] = useState('')
  const [detectedSourceLanguage, setDetectedSourceLanguage] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const [status, setStatus] = useState<TranslationStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [total, setTotal] = useState(0)
  const [currentUnitId, setCurrentUnitId] = useState('')
  const [avgSegmentMs, setAvgSegmentMs] = useState<number | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [errors, setErrors] = useState<TranslationError[]>()
  const [outputBlob, setOutputBlob] = useState<string | null>(null)
  const [showErrorLog, setShowErrorLog] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  // `abortRef` is a ref (not state) so the translation loop can read the
  // current value synchronously on every iteration. A state update is
  // asynchronous and batched — the loop would process at least one extra
  // segment before a state change propagated.
  const abortRef = useRef(false)
  // Persist the live XML DOM, unit list, and done count across cancel/resume
  // so already-translated segments are preserved when the user pauses.
  const docRef = useRef<Document | null>(null)
  const allUnitsRef = useRef<import('@/lib/xliff').TransUnit[]>([])
  const doneCountRef = useRef(0)
  // Snapshot of the serialized XML taken immediately after translation
  // completes — before any manual edits. Used for "Download Original" option.
  const originalXmlRef = useRef<string | null>(null)
  const drawerStateRef = useRef<DrawerState | null>(null)

  // Load config from localStorage after mount to avoid hydration mismatch
  useEffect(() => {
    setMounted(true)
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      const hasOnboarded = !!localStorage.getItem(ONBOARDING_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as LlmConfig
        setConfig(parsed)
        setConfigDraft(parsed)
        if (!hasOnboarded && !parsed.apiKey) setShowOnboarding(true)
      } else {
        if (!hasOnboarded) setShowOnboarding(true)
      }
    } catch {}
  }, [])

  const saveConfig = () => {
    setConfig(configDraft)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configDraft))
    setShowSettings(false)
  }

  const openSettings = () => {
    setConfigDraft(config)
    setShowApiKey(false)
    setShowSettings(true)
  }

  const handleOnboardingConfig = (newConfig: LlmConfig) => {
    setConfig(newConfig)
    setConfigDraft(newConfig)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig))
  }

  const handleOnboardingComplete = () => {
    localStorage.setItem(ONBOARDING_KEY, '1')
    setShowOnboarding(false)
  }

  const handleStartTour = () => {
    localStorage.setItem(ONBOARDING_KEY, '1')
    setShowOnboarding(false)
    setShowTour(true)
  }

  const handleFile = useCallback((file: File) => {
    if (!file.name.match(/\.xlf(f?)$/i)) {
      alert('Please upload a .xlf or .xliff file.')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      setXliffContent(content)
      setFileName(file.name)
      setStatus('idle')
      setProgress(0)
      setErrors(undefined)
      setOutputBlob(null)

      // Extract source-language from the first <file> element
      try {
        const parser = new DOMParser()
        const doc = parser.parseFromString(content, 'application/xml')
        const lang = doc.querySelector('file')?.getAttribute('source-language') ?? null
        setDetectedSourceLanguage(lang)
      } catch {
        setDetectedSourceLanguage(null)
      }
    }
    reader.readAsText(file)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  const effectiveLanguage = targetLanguage === '__custom__' ? customLanguage : targetLanguage

  const canStart =
    !!xliffContent &&
    !!effectiveLanguage.trim() &&
    !!config.apiKey &&
    status !== 'translating' &&
    status !== 'paused'

  const runTranslation = async (isResume: boolean) => {
    abortRef.current = false
    setCancelling(false)
    if (!isResume) { setHasReviewEdits(false); drawerStateRef.current = null }

    let doc: Document
    let units: import('@/lib/xliff').TransUnit[]
    let startFrom: number

    if (isResume && docRef.current && allUnitsRef.current.length > 0) {
      // Reuse the live DOM — already-translated <target> elements are intact
      doc = docRef.current
      units = allUnitsRef.current
      startFrom = doneCountRef.current
    } else {
      let parsed
      try {
        parsed = parseXliff(xliffContent)
      } catch (err) {
        alert(`Failed to parse XLIFF: ${err instanceof Error ? err.message : err}`)
        return
      }
      if (parsed.units.length === 0) {
        alert('No translatable units found in this file.')
        return
      }
      doc = parsed.doc
      units = parsed.units
      docRef.current = doc
      allUnitsRef.current = units
      startFrom = 0
      doneCountRef.current = 0
    }

    setStatus('translating')
    setTotal(units.length)
    setProgress(startFrom)
    if (!isResume) setErrors([])
    setOutputBlob(null)
    setAvgSegmentMs(null)

    const errorList: TranslationError[] = isResume ? [...(errors ?? [])] : []
    let done = startFrom
    let totalMs = 0

    for (let i = startFrom; i < units.length; i++) {
      if (abortRef.current) break

      const unit = units[i]
      setCurrentUnitId(unit.id)

      const segStart = Date.now()
      try {
        const translated = await translateUnit(unit, effectiveLanguage, config)
        setTranslation(unit, translated)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        errorList.push({ unitId: unit.id, message })
        setErrors([...errorList])
      }

      done++
      doneCountRef.current = done
      totalMs += Date.now() - segStart
      setAvgSegmentMs(totalMs / (done - startFrom))
      setProgress(done)
    }

    setCancelling(false)
    setCurrentUnitId('')

    if (abortRef.current) {
      // Cancelled — go to paused state so the user can resume or download partial
      setStatus('paused')
    } else {
      const xml = serializeXliff(doc)
      originalXmlRef.current = xml  // snapshot before any manual edits
      const blob = new Blob([xml], { type: 'application/xml' })
      const url = URL.createObjectURL(blob)
      setOutputBlob(url)
      setStatus(errorList.length > 0 && done === errorList.length ? 'error' : 'done')
    }
  }

  const startTranslation = () => {
    if (!canStart) return
    runTranslation(false)
  }

  const resumeTranslation = () => runTranslation(true)

  const downloadFile = () => {
    if (!docRef.current) return
    // Re-serialize from the live DOM so any drawer edits are included.
    const xml = serializeXliff(docRef.current)
    const blob = new Blob([xml], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName.replace(/\.xlf(f?)$/i, '_translated.$1') || 'translated.xlf'
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadOriginal = () => {
    if (!originalXmlRef.current) return
    const blob = new Blob([originalXmlRef.current], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName.replace(/\.xlf(f?)$/i, '_ai_translation.$1') || 'ai_translation.xlf'
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadPartial = () => {
    if (!docRef.current) return
    const xml = serializeXliff(docRef.current)
    const blob = new Blob([xml], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName.replace(/\.xlf(f?)$/i, '_partial.$1') || 'partial.xlf'
    a.click()
    URL.revokeObjectURL(url)
  }

  const reset = () => {
    abortRef.current = true
    docRef.current = null
    allUnitsRef.current = []
    doneCountRef.current = 0
    originalXmlRef.current = null
    drawerStateRef.current = null
    setShowReview(false)
    setHasReviewEdits(false)
    setStatus('idle')
    setXliffContent('')
    setFileName('')
    setDetectedSourceLanguage(null)
    setProgress(0)
    setTotal(0)
    setErrors(undefined)
    setOutputBlob(null)
    setCurrentUnitId('')
    if (outputBlob) URL.revokeObjectURL(outputBlob)
  }

  const progressPct = total > 0 ? Math.round((progress / total) * 100) : 0

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--canvas)' }}>

      {/* ── Navbar ─────────────────────────────────────────── */}
      <header className="retro-navbar">
        <div className="flex items-center gap-3">
          {/* Logo mark */}
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect x="1" y="1" width="34" height="34" rx="6" fill="#fffdf7" stroke="#2b2d42" strokeWidth="2"/>
            <circle cx="15" cy="18" r="9" stroke="#2b2d42" strokeWidth="2" fill="none"/>
            <ellipse cx="15" cy="18" rx="4" ry="9" stroke="#2b2d42" strokeWidth="1.5" fill="none"/>
            <line x1="6" y1="18" x2="24" y2="18" stroke="#2b2d42" strokeWidth="1.5"/>
            <path d="M7 13 Q15 11 23 13" stroke="#2b2d42" strokeWidth="1.3" fill="none"/>
            <path d="M7 23 Q15 25 23 23" stroke="#2b2d42" strokeWidth="1.3" fill="none"/>
            <polyline points="27,13 32,18 27,23" stroke="#fb8500" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div>
            <h1 className="text-lg tracking-widest uppercase" style={{ fontFamily: 'var(--font-heading)', color: 'var(--paper)', letterSpacing: '0.18em' }}>
              AutoL10n
            </h1>
            <p className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.6)', fontSize: '0.6rem', letterSpacing: '0.08em' }}>
              // xliff translator
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
        <button
          onClick={() => setShowTour(true)}
          className="retro-btn btn-ghost-dark"
          style={{ fontSize: '0.78rem', padding: '0.5rem 0.75rem' }}
          title="Take a tour"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6-10l6-3m0 16l5.447-2.724A1 1 0 0021 16.382V5.618a1 1 0 00-1.447-.894L15 7m0 10V7" />
          </svg>
          <span className="hidden sm:inline">Tour</span>
        </button>
        <button
          onClick={() => setShowInfo(true)}
          className="retro-btn btn-ghost-dark"
          style={{ fontSize: '0.78rem', padding: '0.5rem 0.75rem' }}
          title="About AutoL10n"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round"/>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4m0-4h.01" />
          </svg>
          <span className="hidden sm:inline">About</span>
        </button>
        <button onClick={openSettings} className="retro-btn btn-ghost-dark" style={{ fontSize: '0.8rem' }}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Settings
        </button>
        </div>
      </header>

      {/* ── Settings Modal ──────────────────────────────────── */}
      {showSettings && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(43,45,66,0.65)' }}
          onClick={() => setShowSettings(false)}
        >
          <div className="retro-card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 space-y-5">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)' }}>LLM Configuration</h2>
                <button
                  onClick={() => setShowSettings(false)}
                  className="retro-btn btn-ghost"
                  style={{ padding: '0.35rem', lineHeight: 1 }}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest mb-2" style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>
                  API Endpoint
                </label>
                <input
                  type="url"
                  value={configDraft.apiUrl}
                  onChange={(e) => setConfigDraft((c) => ({ ...c, apiUrl: e.target.value }))}
                  placeholder="https://llm.atko.ai/v1/chat/completions"
                  className="retro-input"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest mb-2" style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>
                  Model
                </label>
                <select
                  value={KNOWN_MODELS.includes(configDraft.model) ? configDraft.model : '__custom__'}
                  onChange={(e) => {
                    if (e.target.value !== '__custom__') {
                      setConfigDraft((c) => ({ ...c, model: e.target.value }))
                    } else {
                      setConfigDraft((c) => ({ ...c, model: '' }))
                    }
                  }}
                  className="retro-select retro-input-mono"
                >
                  {MODEL_GROUPS.map(({ group, models }) => (
                    <optgroup key={group} label={group}>
                      {models.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </optgroup>
                  ))}
                  <option value="__custom__">Other (specify below)</option>
                </select>
                {!KNOWN_MODELS.includes(configDraft.model) && (
                  <input
                    type="text"
                    value={configDraft.model}
                    onChange={(e) => setConfigDraft((c) => ({ ...c, model: e.target.value }))}
                    placeholder="e.g. my-custom-model"
                    className="retro-input retro-input-mono mt-2"
                  />
                )}
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest mb-2" style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>
                  API Key
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={configDraft.apiKey}
                    onChange={(e) => setConfigDraft((c) => ({ ...c, apiKey: e.target.value }))}
                    placeholder="sk-••••••••••••••••"
                    className="retro-input retro-input-mono"
                    style={{ paddingRight: '2.5rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey((v) => !v)}
                    aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                    style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', lineHeight: 1 }}
                  >
                    {showApiKey ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" strokeLinecap="round" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
                <p className="mt-2 text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary-dark)', fontSize: '0.65rem' }}>
                  ⚠ stored in localStorage — avoid shared computers
                </p>
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={saveConfig} className="retro-btn btn-primary flex-1">
                  Save Configuration
                </button>
                <button onClick={() => setShowSettings(false)} className="retro-btn btn-ghost">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Main ───────────────────────────────────────────── */}
      <main className="max-w-2xl mx-auto px-4 py-10 space-y-5">

        {/* Instructions */}
        <div className="retro-card-dashed p-5">
          <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>
            How it works
          </p>
          <ol className="space-y-3">
            {[
              { n: '01', text: 'Export your Articulate Rise course as XLIFF. You\'ll get a .xlf file.' },
              { n: '02', text: 'Open Settings and enter your LLM API URL, model name, and API key. These are saved locally in your browser.' },
              { n: '03', text: 'Upload the .xlf file, pick your target language, and hit Start Translation. Each segment is sent to the LLM individually with automatic retry on rate limits. Download the translated file when done and re-import it into Articulate Rise.' },
            ].map(({ n, text }) => (
              <li key={n} className="flex items-start gap-3">
                <span className="retro-section-num mt-0.5 shrink-0">{n}</span>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--darker)' }}>{text}</p>
              </li>
            ))}
          </ol>
        </div>

        {/* No-key warning */}
        {mounted && !config.apiKey && (
          <div className="retro-alert alert-warning">
            <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: 'var(--primary-dark)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm">
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>warn: </span>
              No API key configured.{' '}
              <button
                onClick={openSettings}
                className="font-bold underline"
                style={{ color: 'var(--ink)' }}
              >
                Open Settings
              </button>{' '}
              to add your key before translating.
            </p>
          </div>
        )}

        {/* ── Step 1: Upload ─────────────────────────────── */}
        <section className="retro-card">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-5">
              <span className="retro-section-num">01</span>
              <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)' }}>Upload XLIFF File</h2>
            </div>

            {!xliffContent ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`retro-dropzone${isDragging ? ' dragging' : ''}`}
              >
                <svg className="w-9 h-9 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: 'var(--muted)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-heading)' }}>Drop your XLIFF file here</p>
                <p className="text-xs mt-1" style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)', fontSize: '0.7rem' }}>
                  or click to browse — .xlf / .xliff
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlf,.xliff"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="retro-file-row">
                  <svg className="w-7 h-7 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: 'var(--primary)' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate" style={{ fontFamily: 'var(--font-mono)' }}>{fileName}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
                      {(xliffContent.length / 1024).toFixed(1)} kb
                    </p>
                  </div>
                  {detectedSourceLanguage && (
                    <span className="retro-badge badge-outline">{detectedSourceLanguage}</span>
                  )}
                  {status !== 'translating' && (
                    <button onClick={reset} className="retro-btn btn-ghost" style={{ padding: '0.35rem' }} title="Remove file">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                {detectedSourceLanguage && (
                  <p className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)', fontSize: '0.65rem', letterSpacing: '0.04em' }}>
                    source-language detected: <strong style={{ color: 'var(--ink)' }}>{detectedSourceLanguage}</strong>
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ── Step 2: Target Language ─────────────────────── */}
        <section className="retro-card">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-5">
              <span className="retro-section-num">02</span>
              <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)' }}>Target Language</h2>
            </div>
            <div className="space-y-3">
              <select
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
                disabled={status === 'translating'}
                className="retro-select"
              >
                <option value="">— select a language —</option>
                {LANGUAGE_OPTIONS.map((lang) => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
                <option value="__custom__">Other (type below)</option>
              </select>
              {targetLanguage === '__custom__' && (
                <input
                  type="text"
                  value={customLanguage}
                  onChange={(e) => setCustomLanguage(e.target.value)}
                  placeholder="e.g. Thai (th-TH), Vietnamese (vi-VN)"
                  disabled={status === 'translating'}
                  className="retro-input"
                />
              )}
            </div>
          </div>
        </section>

        {/* ── Step 3: Action ──────────────────────────────── */}
        {status !== 'translating' && status !== 'done' && (
          <section className="retro-card">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-5">
                <span className="retro-section-num">03</span>
                <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)' }}>Translate</h2>
              </div>
              <button
                onClick={startTranslation}
                disabled={!canStart}
                className="retro-btn btn-primary w-full py-3 text-base"
                style={{ letterSpacing: '0.05em' }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                </svg>
                Start Translation
              </button>
              {(!xliffContent || !effectiveLanguage || (mounted && !config.apiKey)) && (
                <p className="mt-3 text-center" style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)', fontSize: '0.7rem' }}>
                  {!xliffContent
                    ? '// upload a file to continue'
                    : !effectiveLanguage
                    ? '// select a target language to continue'
                    : '// add an api key in settings to continue'}
                </p>
              )}
            </div>
          </section>
        )}

        {/* ── Processing ──────────────────────────────────── */}
        {status === 'translating' && (
          <section className="retro-card">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-5">
                <span className="retro-section-num">▶</span>
                <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)' }}>Translating…</h2>
              </div>

              <div className="retro-progress-track mb-2">
                <div className="retro-progress-fill" style={{ width: `${progressPct}%` }} />
              </div>

              {/* Count + time estimate */}
              <div className="flex items-center justify-between mb-1">
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--ink)', fontWeight: 700 }}>
                  {progress} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>/ {total} segments</span>
                </p>
                {avgSegmentMs !== null && progress < total && (
                  <p className="shrink-0 ml-3" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--muted)' }}>
                    {formatTimeRemaining(avgSegmentMs * (total - progress))}
                  </p>
                )}
              </div>

              {/* Current unit status */}
              <p className="text-xs truncate mb-3" style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)', fontSize: '0.65rem' }}>
                {currentUnitId
                  ? <>Translating <span style={{ color: 'var(--ink)', fontWeight: 700 }}>{currentUnitId}</span></>
                  : <>&nbsp;</>}
              </p>

              {errors && errors.length > 0 && (
                <div className="mt-4">
                  <button
                    onClick={() => setShowErrorLog((v) => !v)}
                    className="retro-btn btn-ghost"
                    style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-dark)', fontSize: '0.7rem', letterSpacing: '0.05em', padding: '0.3rem 0.6rem' }}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {errors.length} error{errors.length !== 1 ? 's' : ''} — {showErrorLog ? 'hide log' : 'show log'}
                  </button>
                  {showErrorLog && (
                    <div className="retro-log mt-2">
                      {errors.map((e, i) => (
                        <div key={i}>
                          <span className="log-id">[{e.unitId}]</span> {e.message}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={() => { abortRef.current = true; setCancelling(true) }}
                disabled={cancelling}
                className="retro-btn btn-ghost mt-4"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', padding: '0.3rem 0.7rem' }}
              >
                {cancelling ? 'Cancelling…' : 'Cancel'}
              </button>
            </div>
          </section>
        )}

        {/* ── Paused ──────────────────────────────────────── */}
        {status === 'paused' && (
          <section className="retro-card">
            <div className="p-6">
              <div className="flex items-center gap-4 mb-6 pb-5" style={{ borderBottom: '2px solid var(--ink)' }}>
                <div className="w-10 h-10 flex items-center justify-center shrink-0" style={{ background: 'var(--primary-light)', border: '2px solid var(--ink)', boxShadow: 'var(--shadow-sm)' }}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} style={{ color: 'var(--ink)' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)' }}>Translation paused</h2>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--muted)' }}>
                    {progress} of {total} segments completed
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={resumeTranslation}
                  className="retro-btn btn-primary w-full py-3 text-base"
                  style={{ letterSpacing: '0.04em' }}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Resume Translation
                </button>
                <button
                  onClick={downloadPartial}
                  className="retro-btn w-full"
                  style={{ borderStyle: 'dashed', background: 'rgba(251,133,0,0.05)', color: 'var(--primary-dark)', letterSpacing: '0.03em' }}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download Partial ({progress} of {total} segments)
                </button>
                <button
                  onClick={() => setShowReview(true)}
                  className="retro-btn btn-ghost w-full"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  Review & Edit Translated Segments
                </button>
                <button onClick={reset} className="retro-btn btn-ghost w-full">
                  Start Over
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ── Output ──────────────────────────────────────── */}
        {status === 'done' && (
          <section className="retro-card">
            <div className="p-6">
              <div className="flex items-center gap-4 mb-6 pb-5" style={{ borderBottom: '2px solid var(--ink)' }}>
                <div className="w-10 h-10 flex items-center justify-center shrink-0" style={{ background: 'var(--secondary)', border: '2px solid var(--ink)', boxShadow: 'var(--shadow-sm)' }}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} style={{ color: 'var(--ink)' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)' }}>Translation complete!</h2>
                  <p className="text-xs mt-0.5" style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)', fontSize: '0.68rem' }}>
                    {progress} unit{progress !== 1 ? 's' : ''} translated
                    {errors && errors.length > 0 && ` · ${errors.length} skipped (errors)`}
                  </p>
                </div>
              </div>

              {errors && errors.length > 0 && (
                <div className="mb-4">
                  <button
                    onClick={() => setShowErrorLog((v) => !v)}
                    className="retro-btn btn-ghost"
                    style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-dark)', fontSize: '0.7rem', letterSpacing: '0.05em', padding: '0.3rem 0.6rem' }}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {errors.length} error{errors.length !== 1 ? 's' : ''} — {showErrorLog ? 'hide log' : 'show log'}
                  </button>
                  {showErrorLog && (
                    <div className="retro-log mt-2">
                      {errors.map((e, i) => (
                        <div key={i}>
                          <span className="log-id">[{e.unitId}]</span> {e.message}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-3">
                <button
                  onClick={downloadFile}
                  className="retro-btn btn-secondary w-full py-3 text-base"
                  style={{ letterSpacing: '0.04em' }}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  {hasReviewEdits ? 'Download Edited XLIFF' : 'Download Translated XLIFF'}
                </button>
                {hasReviewEdits && <button
                  onClick={downloadOriginal}
                  className="retro-btn w-full"
                  style={{ borderStyle: 'dashed', background: 'rgba(43,45,66,0.03)', fontSize: '0.82rem' }}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download Original AI Translation
                </button>}
                <button
                  onClick={() => setShowReview(true)}
                  className="retro-btn btn-ghost w-full"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  Review & Edit Translation
                </button>
                <button onClick={reset} className="retro-btn btn-ghost w-full">
                  Start Over
                </button>
              </div>
            </div>
          </section>
        )}

      </main>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer style={{ borderTop: '2px dashed var(--ink)', marginTop: '2rem' }}>
        <div className="max-w-2xl mx-auto px-4 py-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <svg width="28" height="28" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <rect x="1" y="1" width="34" height="34" rx="6" fill="#fffdf7" stroke="#2b2d42" strokeWidth="2"/>
              <circle cx="15" cy="18" r="9" stroke="#2b2d42" strokeWidth="2" fill="none"/>
              <ellipse cx="15" cy="18" rx="4" ry="9" stroke="#2b2d42" strokeWidth="1.5" fill="none"/>
              <line x1="6" y1="18" x2="24" y2="18" stroke="#2b2d42" strokeWidth="1.5"/>
              <path d="M7 13 Q15 11 23 13" stroke="#2b2d42" strokeWidth="1.3" fill="none"/>
              <path d="M7 23 Q15 25 23 23" stroke="#2b2d42" strokeWidth="1.3" fill="none"/>
              <polyline points="27,13 32,18 27,23" stroke="#fb8500" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div>
              <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-heading)', color: 'var(--ink)' }}>AutoL10n</p>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--muted)', letterSpacing: '0.04em' }}>
                AI-powered XLIFF translator
              </p>
            </div>
          </div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--muted)', textAlign: 'right' }}>
            Created by Bobak Shafiei <a href="slack://okta.enterprise.slack.com/team/U08FNRBR5GX" target="_blank">(@thebobak)</a><br />
            <button
              onClick={() => setShowInfo(true)}
              style={{ color: 'var(--disabled)', textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}
            >
              build: {process.env.NEXT_PUBLIC_BUILD_DATE ?? '—'}
            </button>
          </p>
        </div>
      </footer>

      {/* ── Coaching modals ────────────────────────────────── */}
      {showOnboarding && (
        <OnboardingModal
          initialConfig={config}
          onSaveConfig={handleOnboardingConfig}
          onComplete={handleOnboardingComplete}
          onStartTour={handleStartTour}
        />
      )}

      {showTour && <TourModal onClose={() => setShowTour(false)} />}
      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}

      {showReview && allUnitsRef.current.length > 0 && (
        <ReviewDrawer
          units={allUnitsRef.current}
          errorUnitIds={new Set(errors?.map((e) => e.unitId) ?? [])}
          savedState={drawerStateRef.current}
          onClose={() => setShowReview(false)}
          onEditsChange={(count) => setHasReviewEdits(count > 0)}
          onSaveState={(s) => { drawerStateRef.current = s; setHasReviewEdits(s.editedEls.size > 0) }}
        />
      )}

    </div>
  )
}
