'use client'

import { useState } from 'react'
import { useLlmConfigContext, MODEL_GROUPS, KNOWN_MODELS } from '@/lib/llmConfigContext'
import { DEFAULT_SYSTEM_PROMPT } from '@/lib/prompt'
import type { LlmConfig } from '@/lib/types'

interface Props {
  onClose: () => void
}

export default function SettingsModal({ onClose }: Props) {
  const { config, saveConfig } = useLlmConfigContext()
  const [configDraft, setConfigDraft] = useState<LlmConfig>(config)
  const [showApiKey, setShowApiKey] = useState(false)
  const [checkingAccess, setCheckingAccess] = useState(false)
  const [accessResult, setAccessResult] = useState<{ ok: boolean; message: string } | null>(null)

  const handleSave = () => {
    saveConfig(configDraft)
    onClose()
  }

  const checkAccess = async () => {
    setCheckingAccess(true)
    setAccessResult(null)
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceXml: 'Hello',
          targetLanguage: 'Spanish',
          apiUrl: configDraft.apiUrl,
          apiKey: configDraft.apiKey,
          model: configDraft.model,
          promptMode: 'standard',
          customPrompt: '',
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setAccessResult({ ok: true, message: `Connected — ${configDraft.model} responded successfully.` })
      } else {
        setAccessResult({ ok: false, message: data.error ?? `Error ${res.status}` })
      }
    } catch (err) {
      setAccessResult({ ok: false, message: err instanceof Error ? err.message : 'Network error' })
    } finally {
      setCheckingAccess(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(43,45,66,0.65)' }}
      onClick={onClose}
    >
      <div
        className="retro-card w-full max-w-lg"
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)' }}>LLM Configuration</h2>
            <button onClick={onClose} className="retro-btn btn-ghost" style={{ padding: '0.35rem', lineHeight: 1 }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* API Endpoint */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest mb-1" style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>
              API Endpoint
            </label>
            <p className="text-xs mb-2" style={{ color: 'var(--muted)' }}>
              The full URL for an OpenAI-compatible chat completions endpoint. Leave as default to use the internal Atko LLM proxy, or enter your own provider's URL.
            </p>
            <input
              type="url"
              value={configDraft.apiUrl}
              onChange={(e) => setConfigDraft((c) => ({ ...c, apiUrl: e.target.value }))}
              placeholder="https://llm.atko.ai/v1/chat/completions"
              className="retro-input"
            />
          </div>

          {/* Model */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest mb-1" style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>
              Model
            </label>
            <p className="text-xs mb-2" style={{ color: 'var(--muted)' }}>
              The model used for every translation segment. Larger models are higher quality but slower and more expensive. GPT-4o is a good default for course content.
            </p>
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

          {/* API Key */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest mb-1" style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>
              API Key
            </label>
            <p className="text-xs mb-2" style={{ color: 'var(--muted)' }}>
              Your secret key from the provider selected above.{' '}
              {/* ↓ Replace href with your internal docs URL */}
              <a href="#" style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'underline' }}>
                How do I get an API key? →
              </a>
            </p>
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
            <p className="mt-2" style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary-dark)', fontSize: '0.65rem' }}>
              ⚠ stored in localStorage — avoid shared computers
            </p>
          </div>

          {/* Check Access */}
          <div>
            <button
              onClick={checkAccess}
              disabled={checkingAccess || !configDraft.apiKey || !configDraft.model}
              className="retro-btn btn-ghost w-full"
              style={{ fontSize: '0.82rem' }}
            >
              {checkingAccess ? (
                <>Checking…</>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Check Access
                </>
              )}
            </button>
            {accessResult && (
              <div
                className="mt-2 p-3"
                style={{
                  border: '2px solid var(--ink)',
                  background: accessResult.ok ? 'rgba(112,224,0,0.1)' : 'rgba(241,91,181,0.08)',
                }}
              >
                <p style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.7rem',
                  color: accessResult.ok ? 'var(--secondary-dark)' : 'var(--accent-dark)',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {accessResult.ok ? '✓ ' : '✗ '}{accessResult.message}
                </p>
              </div>
            )}
          </div>

          {/* System Prompt */}
          <div style={{ borderTop: '2px solid var(--ink)', paddingTop: '1.25rem' }}>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold uppercase tracking-widest" style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>
                System Prompt
              </label>
              {configDraft.promptMode !== 'standard' && (
                <button
                  onClick={() => setConfigDraft((c) => ({ ...c, promptMode: 'standard', customPrompt: '' }))}
                  className="retro-btn btn-ghost"
                  style={{ fontSize: '0.68rem', padding: '0.2rem 0.5rem' }}
                >
                  ↩ Restore default
                </button>
              )}
            </div>
            <p className="text-xs mb-3" style={{ color: 'var(--muted)' }}>
              Controls how the LLM approaches each translation. Append extra instructions (e.g. tone, glossary terms) or replace the prompt entirely for specialised use cases.
            </p>

            {/* Mode selector */}
            <div className="flex gap-2 mb-3">
              {(['standard', 'append', 'replace'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setConfigDraft((c) => ({ ...c, promptMode: m }))}
                  className="retro-btn"
                  style={{
                    fontSize: '0.7rem',
                    padding: '0.3rem 0.65rem',
                    background: configDraft.promptMode === m ? 'var(--primary)' : 'transparent',
                    color: configDraft.promptMode === m ? 'var(--paper)' : 'var(--muted)',
                    borderColor: configDraft.promptMode === m ? 'var(--primary)' : 'var(--ink)',
                    textTransform: 'capitalize',
                  }}
                >
                  {m}
                </button>
              ))}
            </div>

            {/* Standard: read-only preview */}
            {configDraft.promptMode === 'standard' && (
              <div className="p-3" style={{ background: 'var(--canvas)', border: '1px solid var(--ink)', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--muted)', lineHeight: 1.6 }}>
                {DEFAULT_SYSTEM_PROMPT}
              </div>
            )}

            {/* Shared variable hint — shown in append and replace modes */}
            {configDraft.promptMode !== 'standard' && (
              <p className="mb-2" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--muted)' }}>
                Use{' '}
                <code style={{ background: 'var(--canvas)', border: '1px solid var(--ink)', padding: '0.05rem 0.35rem', fontFamily: 'var(--font-mono)', color: 'var(--ink)', borderRadius: '2px' }}>
                  {'{targetLanguage}'}
                </code>
                {' '}to insert the selected language (e.g. <em>Spanish (es-ES)</em>).
              </p>
            )}

            {/* Append: show standard (muted) + textarea for addition */}
            {configDraft.promptMode === 'append' && (
              <div className="space-y-2">
                <div className="p-3" style={{ background: 'var(--canvas)', border: '1px solid #e5e5e5', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#aaa', lineHeight: 1.6 }}>
                  {DEFAULT_SYSTEM_PROMPT}
                </div>
                <div style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--muted)' }}>
                  ↓ followed by your addition
                </div>
                <textarea
                  value={configDraft.customPrompt}
                  onChange={(e) => setConfigDraft((c) => ({ ...c, customPrompt: e.target.value }))}
                  placeholder="e.g. Maintain a formal tone. Do not translate product names."
                  rows={4}
                  className="retro-input w-full"
                  style={{ fontSize: '0.8rem', resize: 'vertical', lineHeight: 1.6 }}
                />
              </div>
            )}

            {/* Replace: full custom prompt */}
            {configDraft.promptMode === 'replace' && (
              <textarea
                value={configDraft.customPrompt}
                onChange={(e) => setConfigDraft((c) => ({ ...c, customPrompt: e.target.value }))}
                placeholder={DEFAULT_SYSTEM_PROMPT}
                rows={6}
                className="retro-input w-full"
                style={{ fontSize: '0.8rem', resize: 'vertical', lineHeight: 1.6 }}
              />
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={handleSave} className="retro-btn btn-primary flex-1">
              Save Configuration
            </button>
            <button onClick={onClose} className="retro-btn btn-ghost">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
