'use client'

import { useRef, useState } from 'react'
import { LANGUAGE_OPTIONS } from '@/lib/languages'
import {
  readGlossary,
  writeGlossary,
  createGlossaryTerm,
  parseGlossaryCsv,
  toGlossaryCsv,
  type Glossary,
  type GlossaryTerm,
} from '@/lib/glossary'

interface Props {
  onClose: () => void
}

export default function GlossaryModal({ onClose }: Props) {
  const [glossary, setGlossary] = useState<Glossary>(() => readGlossary())
  const [language, setLanguage] = useState('')
  const [customLanguage, setCustomLanguage] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const effectiveLanguage = language === '__custom__' ? customLanguage.trim() : language
  const terms = effectiveLanguage ? glossary[effectiveLanguage] ?? [] : []

  const persist = (next: Glossary) => {
    setGlossary(next)
    writeGlossary(next)
  }

  const setTermsForLanguage = (nextTerms: GlossaryTerm[]) => {
    if (!effectiveLanguage) return
    persist({ ...glossary, [effectiveLanguage]: nextTerms })
  }

  const addTerm = () => {
    setTermsForLanguage([...terms, createGlossaryTerm('', '')])
  }

  const updateTerm = (id: string, field: 'sourceTerm' | 'translation', value: string) => {
    setTermsForLanguage(terms.map((t) => (t.id === id ? { ...t, [field]: value } : t)))
  }

  const removeTerm = (id: string) => {
    setTermsForLanguage(terms.filter((t) => t.id !== id))
  }

  const handleImport = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      const imported = parseGlossaryCsv(content)
      if (imported.length === 0) {
        alert('No terms found in this CSV.')
        return
      }
      if (terms.length > 0) {
        const replace = window.confirm(
          `This language already has ${terms.length} term${terms.length !== 1 ? 's' : ''}. Click OK to replace them, or Cancel to append the ${imported.length} imported term${imported.length !== 1 ? 's' : ''} instead.`
        )
        setTermsForLanguage(replace ? imported : [...terms, ...imported])
      } else {
        setTermsForLanguage(imported)
      }
    }
    reader.readAsText(file)
  }

  const handleExport = () => {
    const csv = toGlossaryCsv(terms)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `glossary_${effectiveLanguage.replace(/[^a-zA-Z0-9-]+/g, '_')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center p-4"
      style={{ background: 'rgba(43,45,66,0.65)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="glossary-dialog-title"
        className="retro-card w-full max-w-lg"
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between mb-1">
            <h2 id="glossary-dialog-title" className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)' }}>Glossary</h2>
            <button onClick={onClose} className="retro-btn btn-ghost" style={{ padding: '0.35rem', lineHeight: 1 }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Pin preferred translations for specific terms (product names, UI labels) so they translate consistently across every segment, file, and run. Terms are scoped per language and saved automatically.
          </p>

          {/* Language selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest mb-1" style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>
              Language
            </label>
            <div className="space-y-2">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="retro-select"
              >
                <option value="">— select a language —</option>
                {LANGUAGE_OPTIONS.map((lang) => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
                <option value="__custom__">Other (type below)</option>
              </select>
              {language === '__custom__' && (
                <input
                  type="text"
                  value={customLanguage}
                  onChange={(e) => setCustomLanguage(e.target.value)}
                  placeholder="e.g. Thai (th-TH), Vietnamese (vi-VN)"
                  className="retro-input"
                />
              )}
            </div>
          </div>

          {effectiveLanguage && (
            <>
              {/* Term table */}
              <div className="space-y-2">
                {terms.length === 0 && (
                  <p className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>
                    // no terms yet for this language
                  </p>
                )}
                {terms.map((term) => (
                  <div key={term.id} className="retro-file-row" style={{ gap: '8px' }}>
                    <input
                      type="text"
                      value={term.sourceTerm}
                      onChange={(e) => updateTerm(term.id, 'sourceTerm', e.target.value)}
                      placeholder="Source term"
                      className="retro-input flex-1"
                      style={{ fontSize: '0.8rem', padding: '0.45rem 0.6rem' }}
                    />
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: 'var(--muted)' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                    <input
                      type="text"
                      value={term.translation}
                      onChange={(e) => updateTerm(term.id, 'translation', e.target.value)}
                      placeholder="Preferred translation"
                      className="retro-input flex-1"
                      style={{ fontSize: '0.8rem', padding: '0.45rem 0.6rem' }}
                    />
                    <button onClick={() => removeTerm(term.id)} className="retro-btn btn-ghost shrink-0" style={{ padding: '0.35rem' }} title="Remove term">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>

              <button onClick={addTerm} className="retro-btn btn-ghost w-full">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Term
              </button>

              {/* CSV import/export */}
              <div className="flex gap-3 pt-1" style={{ borderTop: '2px solid var(--ink)', paddingTop: '1.25rem' }}>
                <button onClick={() => fileInputRef.current?.click()} className="retro-btn btn-ghost flex-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Import CSV
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = '' }}
                />
                <button onClick={handleExport} disabled={terms.length === 0} className="retro-btn btn-ghost flex-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download CSV
                </button>
              </div>
            </>
          )}

          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="retro-btn btn-primary flex-1">
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
