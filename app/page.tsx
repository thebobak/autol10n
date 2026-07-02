'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { parseXliff, setTranslation, serializeXliff, type TransUnit } from '@/lib/xliff'
import { LANGUAGE_OPTIONS } from '@/lib/languages'
import { withSuffix } from '@/lib/filenames'
import { translateUnitCached, buildTranslationCache, type TranslationCache } from '@/lib/dedupe'
import { readGlossary, matchingTerms } from '@/lib/glossary'
import type { TranslationError, TranslationStatus } from '@/lib/types'
import { useLlmConfigContext } from '@/lib/llmConfigContext'
import ReviewDrawer, { type DrawerState } from '@/components/ReviewDrawer'

const SESSION_KEY = 'autol10n_session'

// ─── Session persistence ──────────────────────────────────────────────────────

interface SessionData {
  translatedXml: string        // serialized docRef — may include manual edits
  originalXml: string | null   // pre-edit snapshot for "Download Original"
  xliffContent: string         // original source file (for file size display)
  fileName: string
  detectedSourceLanguage: string | null
  targetLanguage: string
  customLanguage: string
  status: 'done' | 'paused'
  progress: number
  errors: TranslationError[]
}

function writeSession(data: SessionData) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(data)) } catch {}
}

function clearSession() {
  try { localStorage.removeItem(SESSION_KEY) } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────

function formatTimeRemaining(ms: number): string {
  const sec = Math.round(ms / 1000)
  if (sec <= 3) return 'almost done'
  if (sec < 60) return `~${sec}s remaining`
  const min = Math.floor(sec / 60)
  const s = sec % 60
  return s > 0 ? `~${min}m ${s}s remaining` : `~${min}m remaining`
}

export default function Home() {
  const { config, mounted, openSettings } = useLlmConfigContext()

  const [sessionRestored, setSessionRestored] = useState(false)
  const [showReview, setShowReview] = useState(false)
  const [hasReviewEdits, setHasReviewEdits] = useState(false)

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
  const allUnitsRef = useRef<TransUnit[]>([])
  const doneCountRef = useRef(0)
  // Snapshot of the serialized XML taken immediately after translation
  // completes — before any manual edits. Used for "Download Original" option.
  const originalXmlRef = useRef<string | null>(null)
  const drawerStateRef = useRef<DrawerState | null>(null)
  // Exact-source-match cache — repeated identical segments (common in
  // Articulate Rise courses: nav labels, button text) reuse a prior
  // translation instead of re-calling the LLM.
  const cacheRef = useRef<TranslationCache>(new Map())
  // Tracks segments where a glossary term matched the source but its preferred
  // translation wasn't found in the LLM's output — shown as a mismatch
  // indicator in the Review drawer. Keyed by element (not unit.id) because
  // trans-unit ids aren't guaranteed unique across <file> sections.
  const glossaryMismatchIdsRef = useRef<Set<Element>>(new Set())

  // Restore any saved session after mount.
  useEffect(() => {
    try {
      const sessionRaw = localStorage.getItem(SESSION_KEY)
      if (sessionRaw) {
        const s: SessionData = JSON.parse(sessionRaw)
        // Re-parse the saved translated XML to rebuild the live DOM + unit refs
        const { doc, units } = parseXliff(s.translatedXml)
        docRef.current = doc
        allUnitsRef.current = units
        doneCountRef.current = s.progress
        originalXmlRef.current = s.originalXml
        setFileName(s.fileName)
        setXliffContent(s.xliffContent ?? s.translatedXml)
        setDetectedSourceLanguage(s.detectedSourceLanguage)
        setTargetLanguage(s.targetLanguage)
        setCustomLanguage(s.customLanguage ?? '')
        setStatus(s.status)
        setProgress(s.progress)
        setTotal(units.length)
        setErrors(s.errors ?? [])
        if (s.status === 'done') {
          const blob = new Blob([s.translatedXml], { type: 'application/xml' })
          setOutputBlob(URL.createObjectURL(blob))
        }
        // Recompute glossary mismatches from the restored state — the
        // glossary may have been updated since the last run, but this gives
        // a reasonable approximation without requiring re-translation.
        const restoredGlossary = readGlossary()
        const lang = s.targetLanguage
        const mismatches = new Set<Element>()
        for (const unit of units) {
          const terms = matchingTerms(restoredGlossary, lang, unit.sourceXml)
          if (terms.length === 0) continue
          const targetEl = unit.element.querySelector('target')
          if (!targetEl) continue
          const translated = targetEl.textContent ?? ''
          for (const t of terms) {
            if (t.translation && !translated.includes(t.translation)) {
              mismatches.add(unit.element)
              break
            }
          }
        }
        glossaryMismatchIdsRef.current = mismatches
        setSessionRestored(true)
      }
    } catch {}
  }, [])

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
    if (!isResume) { setHasReviewEdits(false); drawerStateRef.current = null; clearSession() }

    const glossary = readGlossary()

    let doc: Document
    let units: TransUnit[]
    let startFrom: number

    if (isResume && docRef.current && allUnitsRef.current.length > 0) {
      // Reuse the live DOM — already-translated <target> elements are intact
      doc = docRef.current
      units = allUnitsRef.current
      startFrom = doneCountRef.current
      cacheRef.current = buildTranslationCache(units, startFrom)
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
      cacheRef.current = new Map()
      glossaryMismatchIdsRef.current = new Set()
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

    // Helper — captures current translation state into localStorage.
    const checkpoint = (saveStatus: 'done' | 'paused', doneSoFar: number) => {
      if (!docRef.current) return
      writeSession({
        translatedXml: serializeXliff(docRef.current),
        originalXml: originalXmlRef.current,
        xliffContent,
        fileName,
        detectedSourceLanguage,
        targetLanguage: effectiveLanguage,
        customLanguage,
        status: saveStatus,
        progress: doneSoFar,
        errors: [...errorList],
      })
    }

    for (let i = startFrom; i < units.length; i++) {
      if (abortRef.current) break

      const unit = units[i]
      setCurrentUnitId(unit.id)

      const segStart = Date.now()
      try {
        const terms = matchingTerms(glossary, effectiveLanguage, unit.sourceXml)
        const translated = await translateUnitCached(cacheRef.current, unit, effectiveLanguage, config, terms)
        setTranslation(unit, translated)
        // Soft mismatch check: if any glossary term was expected for this
        // segment but doesn't appear in the translation, flag the element.
        for (const t of terms) {
          if (t.translation && !translated.includes(t.translation)) {
            glossaryMismatchIdsRef.current.add(unit.element)
            break
          }
        }
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

      // Checkpoint every 5 segments so a mid-translation page close
      // loses at most 5 segments rather than the whole run.
      if (done % 5 === 0) checkpoint('paused', done)
    }

    setCancelling(false)
    setCurrentUnitId('')

    if (abortRef.current) {
      // Cancelled — go to paused state so the user can resume or download partial
      setStatus('paused')
      checkpoint('paused', done)
    } else {
      const xml = serializeXliff(doc)
      originalXmlRef.current = xml  // snapshot before any manual edits
      const blob = new Blob([xml], { type: 'application/xml' })
      const url = URL.createObjectURL(blob)
      setOutputBlob(url)
      const finalStatus = errorList.length > 0 && done === errorList.length ? 'error' : 'done'
      setStatus(finalStatus)
      if (finalStatus === 'done') checkpoint('done', done)
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
    a.download = withSuffix(fileName, '_translated', 'translated.xlf')
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadOriginal = () => {
    if (!originalXmlRef.current) return
    const blob = new Blob([originalXmlRef.current], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = withSuffix(fileName, '_ai_translation', 'ai_translation.xlf')
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
    a.download = withSuffix(fileName, '_partial', 'partial.xlf')
    a.click()
    URL.revokeObjectURL(url)
  }

  const reset = () => {
    abortRef.current = true
    clearSession()
    docRef.current = null
    allUnitsRef.current = []
    doneCountRef.current = 0
    originalXmlRef.current = null
    drawerStateRef.current = null
    cacheRef.current = new Map()
    glossaryMismatchIdsRef.current = new Set()
    setShowReview(false)
    setHasReviewEdits(false)
    setSessionRestored(false)
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
    <main className="max-w-2xl mx-auto px-4 py-10 space-y-5">

      {/* Session restored banner */}
      {sessionRestored && (
        <div className="retro-alert alert-info flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: 'var(--info, #457b9d)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <p className="text-sm">
              <strong>Session restored</strong> — your previous translation for <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85em' }}>{fileName}</span> has been loaded.
            </p>
          </div>
          <button
            onClick={() => setSessionRestored(false)}
            className="retro-btn btn-ghost shrink-0"
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem', marginLeft: '0.75rem' }}
          >
            Dismiss
          </button>
        </div>
      )}

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
              <span className="retro-badge badge-outline ml-auto" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem' }}>
                {config.model}
              </span>
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

      {showReview && allUnitsRef.current.length > 0 && (
        <ReviewDrawer
          units={allUnitsRef.current}
          errorUnitIds={new Set(errors?.map((e) => e.unitId) ?? [])}
          glossaryMismatchEls={glossaryMismatchIdsRef.current}
          savedState={drawerStateRef.current}
          onClose={() => setShowReview(false)}
          onEditsChange={(count) => setHasReviewEdits(count > 0)}
          onSaveState={(s) => { drawerStateRef.current = s; setHasReviewEdits(s.editedEls.size > 0) }}
        />
      )}

    </main>
  )
}
