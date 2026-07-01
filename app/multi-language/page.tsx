'use client'

import { useEffect, useReducer, useRef, useState } from 'react'
import JSZip from 'jszip'
import { parseXliff, setTranslation, serializeXliff, type TransUnit } from '@/lib/xliff'
import { translateUnit } from '@/lib/translate'
import { LANGUAGE_OPTIONS } from '@/lib/languages'
import { withSuffix, extractLangCode } from '@/lib/filenames'
import { useLlmConfigContext } from '@/lib/llmConfigContext'
import type { TranslationError } from '@/lib/types'
import {
  createLanguageJob,
  writeMultiLangSession,
  readMultiLangSession,
  clearMultiLangSession,
  type LanguageJob,
} from '@/lib/multiLanguage'

// ─── Reducer ──────────────────────────────────────────────────────────────────

type Action =
  | { type: 'INIT_JOBS'; jobs: LanguageJob[] }
  | { type: 'RESET' }
  | { type: 'RESTORE'; jobs: LanguageJob[] }
  | { type: 'JOB_STARTED'; id: string; total: number }
  | { type: 'SEGMENT_DONE'; id: string; progress: number; errors: TranslationError[] }
  | { type: 'JOB_COMPLETED'; id: string; translatedXml: string; errors: TranslationError[] }
  | { type: 'JOB_PAUSED'; id: string; translatedXml: string; progress: number; errors: TranslationError[] }

function jobsReducer(state: LanguageJob[], action: Action): LanguageJob[] {
  switch (action.type) {
    case 'INIT_JOBS':
      return action.jobs
    case 'RESET':
      return []
    case 'RESTORE':
      return action.jobs
    case 'JOB_STARTED':
      return state.map((j) => (j.id === action.id ? { ...j, status: 'translating', total: action.total } : j))
    case 'SEGMENT_DONE':
      return state.map((j) => (j.id === action.id ? { ...j, progress: action.progress, errors: action.errors } : j))
    case 'JOB_COMPLETED':
      return state.map((j) =>
        j.id === action.id ? { ...j, status: 'done', translatedXml: action.translatedXml, errors: action.errors } : j
      )
    case 'JOB_PAUSED':
      return state.map((j) =>
        j.id === action.id
          ? { ...j, status: 'paused', translatedXml: action.translatedXml, progress: action.progress, errors: action.errors }
          : j
      )
    default:
      return state
  }
}

interface JobRuntime {
  doc: Document
  units: TransUnit[]
  doneCount: number
}

export default function MultiLanguagePage() {
  const { config, mounted, openSettings } = useLlmConfigContext()

  const [jobs, dispatch] = useReducer(jobsReducer, [])
  const [fileName, setFileName] = useState('')
  const [xliffContent, setXliffContent] = useState('')
  const [detectedSourceLanguage, setDetectedSourceLanguage] = useState<string | null>(null)
  const [unitCount, setUnitCount] = useState<number | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const [selectedPresets, setSelectedPresets] = useState<Set<string>>(new Set())
  const [customLanguages, setCustomLanguages] = useState<string[]>([])

  const [running, setRunning] = useState(false)
  const [storageWarning, setStorageWarning] = useState(false)
  const [sessionRestored, setSessionRestored] = useState(false)
  const [zipping, setZipping] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const jobsRuntimeRef = useRef<Map<string, JobRuntime>>(new Map())
  // Simple boolean pause flag — no per-item fatal-failure case to interrupt,
  // since the file is validated once up front (see handleFile below).
  const pauseRef = useRef(false)
  const storageWarnedRef = useRef(false)

  // Restore any saved multi-language session on mount.
  useEffect(() => {
    const session = readMultiLangSession()
    if (!session || session.jobs.length === 0) return

    const restored: LanguageJob[] = []
    for (const j of session.jobs) {
      if ((j.status === 'translating' || j.status === 'paused') && j.translatedXml) {
        try {
          const { doc, units } = parseXliff(j.translatedXml)
          jobsRuntimeRef.current.set(j.id, { doc, units, doneCount: j.progress })
          restored.push({ ...j, status: 'paused' })
          continue
        } catch {
          restored.push({ ...j, status: 'error' })
          continue
        }
      }
      restored.push(j)
    }

    dispatch({ type: 'RESTORE', jobs: restored })
    setFileName(session.fileName)
    setXliffContent(session.xliffContent)
    setDetectedSourceLanguage(session.detectedSourceLanguage)
    setSessionRestored(true)
  }, [])

  const checkpoint = (currentJobs: LanguageJob[]) => {
    const ok = writeMultiLangSession({
      fileName,
      xliffContent,
      detectedSourceLanguage,
      jobs: currentJobs,
      overallStatus: 'running',
    })
    if (!ok && !storageWarnedRef.current) {
      storageWarnedRef.current = true
      setStorageWarning(true)
    }
  }

  const handleFile = (file: File) => {
    if (!file.name.match(/\.xlf(f?)$/i)) {
      alert('Please upload a .xlf or .xliff file.')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      setXliffContent(content)
      setFileName(file.name)
      setFileError(null)
      setUnitCount(null)

      let lang: string | null = null
      try {
        const doc = new DOMParser().parseFromString(content, 'application/xml')
        lang = doc.querySelector('file')?.getAttribute('source-language') ?? null
      } catch {}
      setDetectedSourceLanguage(lang)

      // Eagerly validate once, up front — catches a broken file before the
      // user selects languages and clicks Start, rather than failing mid-run.
      try {
        const parsed = parseXliff(content)
        if (parsed.units.length === 0) {
          setFileError('No translatable units found in this file.')
        } else {
          setUnitCount(parsed.units.length)
        }
      } catch (err) {
        setFileError(`Failed to parse XLIFF: ${err instanceof Error ? err.message : err}`)
      }
    }
    reader.readAsText(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const removeFile = () => {
    setXliffContent('')
    setFileName('')
    setDetectedSourceLanguage(null)
    setUnitCount(null)
    setFileError(null)
  }

  const togglePreset = (lang: string) => {
    setSelectedPresets((prev) => {
      const next = new Set(prev)
      if (next.has(lang)) next.delete(lang)
      else next.add(lang)
      return next
    })
  }

  const addCustomLanguage = () => setCustomLanguages((prev) => [...prev, ''])
  const updateCustomLanguage = (i: number, value: string) =>
    setCustomLanguages((prev) => prev.map((c, idx) => (idx === i ? value : c)))
  const removeCustomLanguage = (i: number) => setCustomLanguages((prev) => prev.filter((_, idx) => idx !== i))

  const selectedLanguages = [
    ...Array.from(selectedPresets),
    ...customLanguages.map((c) => c.trim()).filter(Boolean),
  ]

  const resetAll = () => {
    pauseRef.current = false
    jobsRuntimeRef.current.clear()
    clearMultiLangSession()
    dispatch({ type: 'RESET' })
    setSessionRestored(false)
    setRunning(false)
    setStorageWarning(false)
    storageWarnedRef.current = false
    setSelectedPresets(new Set())
    setCustomLanguages([])
    removeFile()
  }

  const runTranslation = async () => {
    pauseRef.current = false
    setRunning(true)

    let currentJobs = jobs
    if (currentJobs.length === 0) {
      currentJobs = selectedLanguages.map((lang) => createLanguageJob(lang))
      dispatch({ type: 'INIT_JOBS', jobs: currentJobs })
    }

    for (const job of currentJobs) {
      if (pauseRef.current) break
      if (job.status === 'done') continue

      let runtime = jobsRuntimeRef.current.get(job.id)
      if (!runtime) {
        // Guaranteed to succeed — the file was validated once on upload.
        const parsed = parseXliff(xliffContent)
        runtime = { doc: parsed.doc, units: parsed.units, doneCount: job.progress }
        jobsRuntimeRef.current.set(job.id, runtime)
      }

      dispatch({ type: 'JOB_STARTED', id: job.id, total: runtime.units.length })
      currentJobs = currentJobs.map((j) => (j.id === job.id ? { ...j, status: 'translating', total: runtime!.units.length } : j))

      const errorList: TranslationError[] = [...job.errors]
      let done = runtime.doneCount

      for (let i = runtime.doneCount; i < runtime.units.length; i++) {
        if (pauseRef.current) break

        const unit = runtime.units[i]
        try {
          const translated = await translateUnit(unit, job.label, config)
          setTranslation(unit, translated)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          errorList.push({ unitId: unit.id, message })
        }

        done++
        runtime.doneCount = done
        dispatch({ type: 'SEGMENT_DONE', id: job.id, progress: done, errors: [...errorList] })
        currentJobs = currentJobs.map((j) => (j.id === job.id ? { ...j, progress: done, errors: [...errorList] } : j))

        if (done % 5 === 0) {
          const xml = serializeXliff(runtime.doc)
          currentJobs = currentJobs.map((j) => (j.id === job.id ? { ...j, translatedXml: xml } : j))
          checkpoint(currentJobs)
        }
      }

      const xml = serializeXliff(runtime.doc)

      if (pauseRef.current) {
        dispatch({ type: 'JOB_PAUSED', id: job.id, translatedXml: xml, progress: done, errors: [...errorList] })
        currentJobs = currentJobs.map((j) =>
          j.id === job.id ? { ...j, status: 'paused', translatedXml: xml, progress: done, errors: [...errorList] } : j
        )
        checkpoint(currentJobs)
        break
      }

      dispatch({ type: 'JOB_COMPLETED', id: job.id, translatedXml: xml, errors: [...errorList] })
      currentJobs = currentJobs.map((j) =>
        j.id === job.id ? { ...j, status: 'done', translatedXml: xml, errors: [...errorList] } : j
      )
      checkpoint(currentJobs)
    }

    setRunning(false)
    pauseRef.current = false
  }

  const pauseTranslation = () => { pauseRef.current = true }

  const canStart =
    !!xliffContent &&
    !fileError &&
    !running &&
    !!config.apiKey &&
    (jobs.length === 0 ? selectedLanguages.length > 0 : jobs.some((j) => j.status === 'paused'))

  const anyPaused = jobs.some((j) => j.status === 'paused')
  const allDone = jobs.length > 0 && jobs.every((j) => j.status === 'done')
  const downloadableCount = jobs.filter((j) => j.status === 'done' || j.status === 'paused').length

  const downloadZip = async () => {
    setZipping(true)
    try {
      const zip = new JSZip()
      jobs
        .filter((j) => (j.status === 'done' || j.status === 'paused') && j.translatedXml)
        .forEach((j) => {
          const code = extractLangCode(j.label)
          const name = withSuffix(fileName, `_${code}`, `${fileName}_${code}.xlf`)
          zip.file(name, j.translatedXml!)
        })
      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const date = new Date().toISOString().slice(0, 10)
      a.download = `autol10n_multilang_${date}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setZipping(false)
    }
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-10 space-y-5">

      {sessionRestored && (
        <div className="retro-alert alert-info flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: 'var(--info, #457b9d)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <p className="text-sm">
              <strong>Session restored</strong> — your previous multi-language run for <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85em' }}>{fileName}</span> has been loaded.
            </p>
          </div>
          <button onClick={() => setSessionRestored(false)} className="retro-btn btn-ghost shrink-0" style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem', marginLeft: '0.75rem' }}>
            Dismiss
          </button>
        </div>
      )}

      {storageWarning && (
        <div className="retro-alert alert-warning">
          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: 'var(--primary-dark)' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm">
            Could not save progress — your browser's storage limit was reached. Your run will continue but may not survive a refresh.
          </p>
        </div>
      )}

      <div className="retro-card-dashed p-5">
        <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>
          How it works
        </p>
        <ol className="space-y-3">
          {[
            { n: '01', text: 'Upload one XLIFF file exported from Articulate Rise.' },
            { n: '02', text: 'Check off any number of languages, or add custom ones for edge-case locales.' },
            { n: '03', text: 'Start translation — each language translates one at a time. Download all results bundled into a single .zip when finished.' },
          ].map(({ n, text }) => (
            <li key={n} className="flex items-start gap-3">
              <span className="retro-section-num mt-0.5 shrink-0">{n}</span>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--darker)' }}>{text}</p>
            </li>
          ))}
        </ol>
      </div>

      {mounted && !config.apiKey && (
        <div className="retro-alert alert-warning">
          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: 'var(--primary-dark)' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm">
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>warn: </span>
            No API key configured.{' '}
            <button onClick={openSettings} className="font-bold underline" style={{ color: 'var(--ink)' }}>
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
                <svg className="w-7 h-7 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: fileError ? 'var(--accent-dark)' : 'var(--primary)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ fontFamily: 'var(--font-mono)' }}>{fileName}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
                    {(xliffContent.length / 1024).toFixed(1)} kb{unitCount !== null && ` · ${unitCount} segments`}
                  </p>
                </div>
                {detectedSourceLanguage && (
                  <span className="retro-badge badge-outline">{detectedSourceLanguage}</span>
                )}
                {!running && (
                  <button onClick={removeFile} className="retro-btn btn-ghost" style={{ padding: '0.35rem' }} title="Remove file">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              {fileError && (
                <p className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-dark)', fontSize: '0.68rem' }}>
                  {fileError}
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Step 2: Target Languages ─────────────────────── */}
      <section className="retro-card">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-5">
            <span className="retro-section-num">02</span>
            <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)' }}>Target Languages</h2>
          </div>

          {jobs.length === 0 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {LANGUAGE_OPTIONS.map((lang) => (
                  <label
                    key={lang}
                    className="flex items-center gap-2 p-2"
                    style={{ cursor: running ? 'default' : 'pointer' }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedPresets.has(lang)}
                      onChange={() => togglePreset(lang)}
                      disabled={running}
                      className="retro-checkbox"
                    />
                    <span className="text-sm" style={{ color: 'var(--darker)' }}>{lang}</span>
                  </label>
                ))}
              </div>

              {customLanguages.length > 0 && (
                <div className="space-y-2">
                  {customLanguages.map((value, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => updateCustomLanguage(i, e.target.value)}
                        placeholder="e.g. Thai (th-TH), Vietnamese (vi-VN)"
                        disabled={running}
                        className="retro-input flex-1"
                      />
                      <button
                        onClick={() => removeCustomLanguage(i)}
                        disabled={running}
                        className="retro-btn btn-ghost"
                        style={{ padding: '0.35rem' }}
                        title="Remove language"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button onClick={addCustomLanguage} disabled={running} className="retro-btn btn-ghost">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Other Language
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {jobs.map((j) => (
                <div key={j.id} className="retro-file-row">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate" style={{ fontFamily: 'var(--font-mono)' }}>{j.label}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
                      {j.status === 'translating' && `translating — ${j.progress}/${j.total}`}
                      {j.status === 'paused' && `paused — ${j.progress}/${j.total}`}
                      {j.status === 'done' && `done — ${j.progress} segments${j.errors.length ? ` · ${j.errors.length} errors` : ''}`}
                      {j.status === 'queued' && 'queued'}
                      {j.status === 'error' && 'error'}
                    </p>
                  </div>
                  <span
                    className="retro-badge badge-outline"
                    style={{
                      color:
                        j.status === 'done' ? 'var(--secondary-dark)' :
                        j.status === 'error' ? 'var(--accent-dark)' :
                        j.status === 'translating' ? 'var(--primary-dark)' :
                        'var(--muted)',
                    }}
                  >
                    {j.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Step 3: Action ──────────────────────────────── */}
      <section className="retro-card">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-5">
            <span className="retro-section-num">03</span>
            <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)' }}>Translate</h2>
          </div>

          {running ? (
            <button onClick={pauseTranslation} className="retro-btn btn-ghost w-full">
              Pause After Current Segment
            </button>
          ) : (
            <button onClick={runTranslation} disabled={!canStart} className="retro-btn btn-primary w-full py-3 text-base" style={{ letterSpacing: '0.05em' }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
              </svg>
              {anyPaused ? 'Resume Translation' : 'Start Translation'}
            </button>
          )}

          {!running && (!xliffContent || !!fileError || selectedLanguages.length === 0 || (mounted && !config.apiKey)) && jobs.length === 0 && (
            <p className="mt-3 text-center" style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)', fontSize: '0.7rem' }}>
              {!xliffContent
                ? '// upload a file to continue'
                : fileError
                ? '// fix the file error above to continue'
                : selectedLanguages.length === 0
                ? '// select at least one language to continue'
                : '// add an api key in settings to continue'}
            </p>
          )}
        </div>
      </section>

      {/* ── Output ──────────────────────────────────────── */}
      {downloadableCount > 0 && (
        <section className="retro-card">
          <div className="p-6">
            <div className="flex items-center gap-4 mb-6 pb-5" style={{ borderBottom: '2px solid var(--ink)' }}>
              <div className="w-10 h-10 flex items-center justify-center shrink-0" style={{ background: allDone ? 'var(--secondary)' : 'var(--primary-light)', border: '2px solid var(--ink)', boxShadow: 'var(--shadow-sm)' }}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} style={{ color: 'var(--ink)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={allDone ? 'M5 13l4 4L19 7' : 'M10 9v6m4-6v6'} />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
                  {allDone ? 'All languages complete!' : `${downloadableCount} language${downloadableCount !== 1 ? 's' : ''} ready to download`}
                </h2>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--muted)' }}>
                  {jobs.filter((j) => j.status === 'done').length} done · {jobs.filter((j) => j.status === 'paused').length} paused · {jobs.filter((j) => j.status === 'error').length} errored
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button onClick={downloadZip} disabled={zipping} className="retro-btn btn-secondary w-full py-3 text-base" style={{ letterSpacing: '0.04em' }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {zipping ? 'Zipping…' : `Download All (.zip) — ${downloadableCount} language${downloadableCount !== 1 ? 's' : ''}`}
              </button>
              <button onClick={resetAll} className="retro-btn btn-ghost w-full">
                Start Over
              </button>
            </div>
          </div>
        </section>
      )}

    </main>
  )
}
