'use client'

import { useEffect, useReducer, useRef, useState } from 'react'
import JSZip from 'jszip'
import { parseXliff, setTranslation, serializeXliff, type TransUnit } from '@/lib/xliff'
import { translateUnit } from '@/lib/translate'
import { LANGUAGE_OPTIONS } from '@/lib/languages'
import { withSuffix } from '@/lib/filenames'
import { useLlmConfigContext } from '@/lib/llmConfigContext'
import type { TranslationError } from '@/lib/types'
import {
  createBatchFile,
  writeBatchSession,
  readBatchSession,
  clearBatchSession,
  type BatchFile,
} from '@/lib/batch'

const SOFT_FILE_CAP = 25

// ─── Reducer ──────────────────────────────────────────────────────────────────

type Action =
  | { type: 'ADD_FILES'; files: BatchFile[] }
  | { type: 'REMOVE_FILE'; id: string }
  | { type: 'RESET' }
  | { type: 'RESTORE'; files: BatchFile[] }
  | { type: 'FILE_STARTED'; id: string; total: number }
  | { type: 'SEGMENT_DONE'; id: string; progress: number; errors: TranslationError[] }
  | { type: 'FILE_COMPLETED'; id: string; translatedXml: string; errors: TranslationError[] }
  | { type: 'FILE_PAUSED'; id: string; translatedXml: string; progress: number; errors: TranslationError[] }
  | { type: 'FILE_PARSE_FAILED'; id: string; message: string }
  | { type: 'SKIP_FILE'; id: string }

function filesReducer(state: BatchFile[], action: Action): BatchFile[] {
  switch (action.type) {
    case 'ADD_FILES':
      return [...state, ...action.files]
    case 'REMOVE_FILE':
      return state.filter((f) => f.id !== action.id)
    case 'RESET':
      return []
    case 'RESTORE':
      return action.files
    case 'FILE_STARTED':
      return state.map((f) => (f.id === action.id ? { ...f, status: 'translating', total: action.total } : f))
    case 'SEGMENT_DONE':
      return state.map((f) => (f.id === action.id ? { ...f, progress: action.progress, errors: action.errors } : f))
    case 'FILE_COMPLETED':
      return state.map((f) =>
        f.id === action.id
          ? { ...f, status: 'done', translatedXml: action.translatedXml, errors: action.errors }
          : f
      )
    case 'FILE_PAUSED':
      return state.map((f) =>
        f.id === action.id
          ? { ...f, status: 'paused', translatedXml: action.translatedXml, progress: action.progress, errors: action.errors }
          : f
      )
    case 'FILE_PARSE_FAILED':
      return state.map((f) => (f.id === action.id ? { ...f, status: 'error', parseError: action.message } : f))
    case 'SKIP_FILE':
      return state.map((f) => (f.id === action.id ? { ...f, status: 'skipped' } : f))
    default:
      return state
  }
}

// ─── Per-file runtime data (not persisted directly — lives alongside serializable state) ──

interface FileRuntime {
  doc: Document
  units: TransUnit[]
  doneCount: number
}

type BatchControl = 'none' | 'pause' | 'cancel-batch'

export default function BatchPage() {
  const { config, mounted, openSettings } = useLlmConfigContext()

  const [files, dispatch] = useReducer(filesReducer, [])
  const [targetLanguage, setTargetLanguage] = useState('')
  const [customLanguage, setCustomLanguage] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [running, setRunning] = useState(false)
  const [capWarning, setCapWarning] = useState<string | null>(null)
  const [storageWarning, setStorageWarning] = useState(false)
  const [sessionRestored, setSessionRestored] = useState(false)
  const [zipping, setZipping] = useState(false)

  // Fatal parse-error confirmation dialog state
  const [parseFailureDialog, setParseFailureDialog] = useState<{ fileId: string; fileName: string; message: string } | null>(null)
  const pendingDecisionRef = useRef<((skip: boolean) => void) | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const filesRuntimeRef = useRef<Map<string, FileRuntime>>(new Map())
  // 'none' = keep going, 'pause' = stop after current segment (resumable),
  // 'cancel-batch' = stop after current segment and do not advance to the next file.
  const controlRef = useRef<BatchControl>('none')
  // Reading through a function (rather than `controlRef.current` directly)
  // avoids TypeScript over-narrowing the ref's value to the literal type it
  // was last assigned in the same synchronous block, which otherwise makes
  // later comparisons against other BatchControl values look unreachable.
  const getControl = (): BatchControl => controlRef.current
  const storageWarnedRef = useRef(false)

  // Restore any saved batch session on mount.
  useEffect(() => {
    const session = readBatchSession()
    if (!session || session.files.length === 0) return

    const restored: BatchFile[] = []
    for (const f of session.files) {
      if ((f.status === 'translating' || f.status === 'paused') && f.translatedXml) {
        try {
          const { doc, units } = parseXliff(f.translatedXml)
          filesRuntimeRef.current.set(f.id, { doc, units, doneCount: f.progress })
          restored.push({ ...f, status: 'paused' })
          continue
        } catch {
          restored.push({ ...f, status: 'error', parseError: 'Could not restore this file — please re-upload it.' })
          continue
        }
      }
      restored.push(f)
    }

    dispatch({ type: 'RESTORE', files: restored })
    setTargetLanguage(session.targetLanguage)
    setCustomLanguage(session.customLanguage)
    setSessionRestored(true)
  }, [])

  const effectiveLanguage = targetLanguage === '__custom__' ? customLanguage : targetLanguage

  const checkpoint = (currentFiles: BatchFile[]) => {
    // checkpoint() is only ever invoked from inside runBatch(), i.e. while a
    // batch is actively in progress — hardcode 'running' rather than reading
    // the `running` state, which would be stale inside runBatch's closure.
    const ok = writeBatchSession({
      targetLanguage: effectiveLanguage,
      customLanguage,
      files: currentFiles,
      overallStatus: 'running',
    })
    if (!ok && !storageWarnedRef.current) {
      storageWarnedRef.current = true
      setStorageWarning(true)
    }
  }

  const handleFiles = (fileList: FileList | File[]) => {
    const incoming = Array.from(fileList).filter((f) => f.name.match(/\.xlf(f?)$/i))
    if (incoming.length === 0) {
      alert('Please upload .xlf or .xliff files.')
      return
    }

    const projectedTotal = files.length + incoming.length
    if (projectedTotal > SOFT_FILE_CAP) {
      setCapWarning(
        `You've selected ${projectedTotal} files — batches over ${SOFT_FILE_CAP} may take a long time and risk exceeding browser storage limits. Proceeding anyway.`
      )
    } else {
      setCapWarning(null)
    }

    let remaining = incoming.length
    const newBatchFiles: BatchFile[] = []
    incoming.forEach((file) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const content = e.target?.result as string
        let lang: string | null = null
        try {
          const doc = new DOMParser().parseFromString(content, 'application/xml')
          lang = doc.querySelector('file')?.getAttribute('source-language') ?? null
        } catch {}
        newBatchFiles.push(createBatchFile(file.name, content, lang))
        remaining--
        if (remaining === 0) {
          dispatch({ type: 'ADD_FILES', files: newBatchFiles })
        }
      }
      reader.readAsText(file)
    })
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files)
  }

  const removeFile = (id: string) => {
    filesRuntimeRef.current.delete(id)
    dispatch({ type: 'REMOVE_FILE', id })
  }

  const resetAll = () => {
    controlRef.current = 'none'
    filesRuntimeRef.current.clear()
    clearBatchSession()
    dispatch({ type: 'RESET' })
    setSessionRestored(false)
    setRunning(false)
    setCapWarning(null)
    setStorageWarning(false)
    storageWarnedRef.current = false
  }

  // Waits for the user to click "Skip file" or "Cancel batch" in the
  // fatal-parse-error dialog. The outer loop below awaits this before
  // deciding whether to continue to the next file or stop entirely.
  const waitForParseFailureDecision = (fileId: string, fileName: string, message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      pendingDecisionRef.current = resolve
      setParseFailureDialog({ fileId, fileName, message })
    })
  }

  const resolveParseFailureDialog = (skip: boolean) => {
    setParseFailureDialog(null)
    pendingDecisionRef.current?.(skip)
    pendingDecisionRef.current = null
  }

  const runBatch = async () => {
    controlRef.current = 'none'
    setRunning(true)

    // Work from the latest file list each iteration via a mutable local copy
    // kept in sync with dispatched reducer actions, since the reducer's
    // output isn't available synchronously between dispatch calls.
    let currentFiles = files.map((f) => ({ ...f }))

    for (const file of currentFiles) {
      if (getControl() === 'cancel-batch') break
      if (file.status === 'done' || file.status === 'skipped') continue

      let runtime = filesRuntimeRef.current.get(file.id)

      if (!runtime) {
        let parsed
        try {
          parsed = parseXliff(file.xliffContent)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          dispatch({ type: 'FILE_PARSE_FAILED', id: file.id, message })
          currentFiles = currentFiles.map((f) => (f.id === file.id ? { ...f, status: 'error', parseError: message } : f))
          checkpoint(currentFiles)

          const skip = await waitForParseFailureDecision(file.id, file.fileName, message)
          if (!skip) {
            controlRef.current = 'cancel-batch'
            break
          }
          dispatch({ type: 'SKIP_FILE', id: file.id })
          currentFiles = currentFiles.map((f) => (f.id === file.id ? { ...f, status: 'skipped' } : f))
          continue
        }

        if (parsed.units.length === 0) {
          dispatch({ type: 'FILE_PARSE_FAILED', id: file.id, message: 'No translatable units found in this file.' })
          currentFiles = currentFiles.map((f) =>
            f.id === file.id ? { ...f, status: 'error', parseError: 'No translatable units found in this file.' } : f
          )
          checkpoint(currentFiles)

          const skip = await waitForParseFailureDecision(file.id, file.fileName, 'No translatable units found in this file.')
          if (!skip) {
            controlRef.current = 'cancel-batch'
            break
          }
          dispatch({ type: 'SKIP_FILE', id: file.id })
          currentFiles = currentFiles.map((f) => (f.id === file.id ? { ...f, status: 'skipped' } : f))
          continue
        }

        runtime = { doc: parsed.doc, units: parsed.units, doneCount: file.progress }
        filesRuntimeRef.current.set(file.id, runtime)
      }

      dispatch({ type: 'FILE_STARTED', id: file.id, total: runtime.units.length })
      currentFiles = currentFiles.map((f) =>
        f.id === file.id ? { ...f, status: 'translating', total: runtime!.units.length } : f
      )

      const errorList: TranslationError[] = [...file.errors]
      let done = runtime.doneCount

      for (let i = runtime.doneCount; i < runtime.units.length; i++) {
        if (getControl() !== 'none') break

        const unit = runtime.units[i]
        try {
          const translated = await translateUnit(unit, effectiveLanguage, config)
          setTranslation(unit, translated)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          errorList.push({ unitId: unit.id, message })
        }

        done++
        runtime.doneCount = done
        dispatch({ type: 'SEGMENT_DONE', id: file.id, progress: done, errors: [...errorList] })
        currentFiles = currentFiles.map((f) =>
          f.id === file.id ? { ...f, progress: done, errors: [...errorList] } : f
        )

        if (done % 5 === 0) {
          const xml = serializeXliff(runtime.doc)
          currentFiles = currentFiles.map((f) => (f.id === file.id ? { ...f, translatedXml: xml } : f))
          checkpoint(currentFiles)
        }
      }

      const xml = serializeXliff(runtime.doc)

      if (getControl() !== 'none') {
        // Paused or cancelling — stop here, leave this file resumable.
        dispatch({ type: 'FILE_PAUSED', id: file.id, translatedXml: xml, progress: done, errors: [...errorList] })
        currentFiles = currentFiles.map((f) =>
          f.id === file.id ? { ...f, status: 'paused', translatedXml: xml, progress: done, errors: [...errorList] } : f
        )
        checkpoint(currentFiles)
        break
      }

      dispatch({ type: 'FILE_COMPLETED', id: file.id, translatedXml: xml, errors: [...errorList] })
      currentFiles = currentFiles.map((f) =>
        f.id === file.id ? { ...f, status: 'done', translatedXml: xml, errors: [...errorList] } : f
      )
      checkpoint(currentFiles)
    }

    setRunning(false)
    controlRef.current = 'none'
  }

  const pauseBatch = () => { controlRef.current = 'pause' }
  const cancelBatch = () => { controlRef.current = 'cancel-batch' }

  const canStart =
    files.length > 0 &&
    !!effectiveLanguage.trim() &&
    !!config.apiKey &&
    !running &&
    files.some((f) => f.status === 'queued' || f.status === 'paused')

  const allDone = files.length > 0 && files.every((f) => f.status === 'done' || f.status === 'skipped' || f.status === 'error')
  const anyPaused = files.some((f) => f.status === 'paused')
  const downloadableCount = files.filter((f) => f.status === 'done' || f.status === 'paused').length

  const downloadZip = async () => {
    setZipping(true)
    try {
      const zip = new JSZip()
      files
        .filter((f) => (f.status === 'done' || f.status === 'paused') && f.translatedXml)
        .forEach((f) => {
          const name = withSuffix(f.fileName, '_translated', `${f.fileName}_translated.xlf`)
          zip.file(name, f.translatedXml!)
        })
      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const date = new Date().toISOString().slice(0, 10)
      a.download = `autol10n_batch_${date}.zip`
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
              <strong>Session restored</strong> — your previous batch ({files.length} file{files.length !== 1 ? 's' : ''}) has been loaded.
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
            Could not save progress — your browser's storage limit was reached. Your batch will continue but may not survive a refresh.
          </p>
        </div>
      )}

      <div className="retro-card-dashed p-5">
        <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>
          How it works
        </p>
        <ol className="space-y-3">
          {[
            { n: '01', text: `Upload up to ${SOFT_FILE_CAP} XLIFF files exported from Articulate Rise.` },
            { n: '02', text: 'Pick one target language for the whole batch, then start translation. Files translate one at a time.' },
            { n: '03', text: 'Download all translated files bundled into a single .zip when the batch finishes.' },
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

      {capWarning && (
        <div className="retro-alert alert-warning">
          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: 'var(--primary-dark)' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm">{capWarning}</p>
        </div>
      )}

      {/* ── Step 1: Upload ─────────────────────────────── */}
      <section className="retro-card">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-5">
            <span className="retro-section-num">01</span>
            <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)' }}>Upload XLIFF Files</h2>
          </div>

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
            <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-heading)' }}>Drop XLIFF files here</p>
            <p className="text-xs mt-1" style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)', fontSize: '0.7rem' }}>
              or click to browse — .xlf / .xliff — up to {SOFT_FILE_CAP} recommended
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlf,.xliff"
              multiple
              className="hidden"
              onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = '' }}
            />
          </div>

          {files.length > 0 && (
            <div className="space-y-2 mt-4">
              {files.map((f) => (
                <div key={f.id} className="retro-file-row">
                  <svg className="w-6 h-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: 'var(--primary)' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate" style={{ fontFamily: 'var(--font-mono)' }}>{f.fileName}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
                      {f.status === 'translating' && `translating — ${f.progress}/${f.total}`}
                      {f.status === 'paused' && `paused — ${f.progress}/${f.total}`}
                      {f.status === 'done' && `done — ${f.progress} segments${f.errors.length ? ` · ${f.errors.length} errors` : ''}`}
                      {f.status === 'queued' && 'queued'}
                      {f.status === 'skipped' && 'skipped'}
                      {f.status === 'error' && (f.parseError ?? 'failed to parse')}
                    </p>
                  </div>
                  <span
                    className="retro-badge badge-outline"
                    style={{
                      color:
                        f.status === 'done' ? 'var(--secondary-dark)' :
                        f.status === 'error' ? 'var(--accent-dark)' :
                        f.status === 'translating' ? 'var(--primary-dark)' :
                        'var(--muted)',
                    }}
                  >
                    {f.status}
                  </span>
                  {(f.status === 'queued' || f.status === 'error' || f.status === 'skipped') && !running && (
                    <button onClick={() => removeFile(f.id)} className="retro-btn btn-ghost" style={{ padding: '0.35rem' }} title="Remove file">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
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
              disabled={running}
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
                disabled={running}
                className="retro-input"
              />
            )}
          </div>
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
            <div className="flex gap-3">
              <button onClick={pauseBatch} className="retro-btn btn-ghost flex-1">
                Pause After Current Segment
              </button>
              <button onClick={cancelBatch} className="retro-btn btn-ghost flex-1">
                Cancel Batch
              </button>
            </div>
          ) : (
            <button onClick={runBatch} disabled={!canStart} className="retro-btn btn-primary w-full py-3 text-base" style={{ letterSpacing: '0.05em' }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
              </svg>
              {anyPaused ? 'Resume Batch' : 'Start Batch Translation'}
            </button>
          )}

          {!running && (!files.length || !effectiveLanguage || (mounted && !config.apiKey)) && (
            <p className="mt-3 text-center" style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)', fontSize: '0.7rem' }}>
              {!files.length
                ? '// upload files to continue'
                : !effectiveLanguage
                ? '// select a target language to continue'
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
                  {allDone ? 'Batch complete!' : `${downloadableCount} file${downloadableCount !== 1 ? 's' : ''} ready to download`}
                </h2>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--muted)' }}>
                  {files.filter((f) => f.status === 'done').length} done · {files.filter((f) => f.status === 'paused').length} paused · {files.filter((f) => f.status === 'skipped').length} skipped · {files.filter((f) => f.status === 'error').length} errored
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button onClick={downloadZip} disabled={zipping} className="retro-btn btn-secondary w-full py-3 text-base" style={{ letterSpacing: '0.04em' }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {zipping ? 'Zipping…' : `Download All (.zip) — ${downloadableCount} file${downloadableCount !== 1 ? 's' : ''}`}
              </button>
              <button onClick={resetAll} className="retro-btn btn-ghost w-full">
                Start Over
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── Fatal parse-error confirm dialog ─────────────── */}
      {parseFailureDialog && (
        <div
          className="fixed inset-0 z-[55] flex items-center justify-center p-4"
          style={{ background: 'rgba(43,45,66,0.7)' }}
        >
          <div className="retro-card w-full max-w-md">
            <div className="p-6 space-y-4">
              <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
                Couldn't parse this file
              </h2>
              <p className="text-sm" style={{ color: 'var(--darker)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85em' }}>{parseFailureDialog.fileName}</span> failed to parse as XLIFF:
              </p>
              <div className="p-3" style={{ background: 'var(--canvas)', border: '1px solid var(--ink)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--accent-dark)', lineHeight: 1.6, wordBreak: 'break-word' }}>
                {parseFailureDialog.message}
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => resolveParseFailureDialog(true)} className="retro-btn btn-primary flex-1">
                  Skip This File
                </button>
                <button onClick={() => resolveParseFailureDialog(false)} className="retro-btn btn-ghost flex-1">
                  Cancel Batch
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </main>
  )
}
