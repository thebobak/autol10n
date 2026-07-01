'use client'

import { useState } from 'react'
import { ONBOARDING_STEPS, PROVIDERS } from '@/lib/coaching'
import ModelSelect from '@/components/ModelSelect'
import type { LlmConfig } from '@/lib/types'

interface Props {
  initialConfig: LlmConfig
  onSaveConfig: (config: LlmConfig) => void
  onComplete: () => void
}

export default function OnboardingModal({ initialConfig, onSaveConfig, onComplete }: Props) {
  const [stepIdx, setStepIdx] = useState(0)
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null)
  const [draft, setDraft] = useState<LlmConfig>({
    ...{ promptMode: 'standard' as const, customPrompt: '' },
    ...initialConfig,
  })
  const [showKey, setShowKey] = useState(false)

  const step = ONBOARDING_STEPS[stepIdx]
  const total = ONBOARDING_STEPS.length

  const handleProviderClick = (name: string) => {
    const p = PROVIDERS.find((p) => p.name === name)
    if (!p) return
    setSelectedProvider(name)
    setDraft((d) => ({ ...d, apiUrl: p.apiUrl, model: p.defaultModel }))
  }

  const handleSaveAndContinue = () => {
    onSaveConfig(draft)
    setStepIdx(total - 1)
  }

  const handleComplete = () => onComplete()

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(43,45,66,0.88)' }}
    >
      <div className="retro-card w-full max-w-lg" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="p-8">

          {/* Progress indicator */}
          <div className="flex items-center gap-2 mb-7">
            {ONBOARDING_STEPS.map((_, i) => (
              <div
                key={i}
                style={{
                  width: i === stepIdx ? '20px' : '8px',
                  height: '8px',
                  borderRadius: '4px',
                  background: i <= stepIdx ? 'var(--primary)' : 'var(--disabled)',
                  transition: 'all 200ms var(--ease-mech)',
                }}
              />
            ))}
            <span className="ml-auto" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--muted)' }}>
              {stepIdx + 1} / {total}
            </span>
          </div>

          {/* Welcome: large logo */}
          {step.id === 'welcome' && (
            <div className="flex justify-center mb-6">
              <img src="/logo.svg" width={72} height={72} alt="AutoL10n" />
            </div>
          )}

          {/* Complete: checkmark */}
          {step.showSuccess && (
            <div className="flex justify-center mb-6">
              <div style={{
                width: '60px', height: '60px',
                background: 'var(--secondary)',
                border: '2px solid var(--ink)',
                boxShadow: 'var(--shadow-sm)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} style={{ color: 'var(--ink)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
          )}

          {/* Title */}
          <h2 className="text-xl font-bold mb-3" style={{ fontFamily: 'var(--font-heading)' }}>
            {step.title}
          </h2>

          {/* Body paragraphs */}
          {step.body.map((text, i) => (
            <p key={i} className="text-sm leading-relaxed mb-3" style={{ color: 'var(--darker)' }}>
              {text}
            </p>
          ))}

          {/* Tip callout */}
          {step.tip && (
            <div className="my-4 px-4 py-3" style={{ background: 'rgba(255,183,3,0.12)', border: '1.5px dashed var(--ink)' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--ink)' }}>
                💡 {step.tip}
              </p>
            </div>
          )}

          {/* Provider selection grid */}
          {step.showProviders && (
            <div className="grid grid-cols-2 gap-3 my-5">
              {PROVIDERS.map((p) => {
                const selected = selectedProvider === p.name
                return (
                  <div
                    key={p.name}
                    onClick={() => handleProviderClick(p.name)}
                    className="p-3 cursor-pointer"
                    style={{
                      border: `2px solid ${selected ? 'var(--primary)' : 'var(--ink)'}`,
                      background: selected ? 'rgba(251,133,0,0.07)' : 'var(--paper)',
                      boxShadow: selected ? 'var(--shadow-sm)' : 'none',
                      transition: 'all 100ms var(--ease-mech)',
                    }}
                  >
                    <p className="text-sm font-bold mb-0.5" style={{ fontFamily: 'var(--font-heading)' }}>
                      {p.name}
                    </p>
                    <p className="mb-2" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--muted)' }}>
                      {p.description}
                    </p>
                    {p.docsUrl ? (
                      <a
                        href={p.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold underline"
                        style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--primary)' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        Get API key →
                      </a>
                    ) : (
                      <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--muted)' }}>
                        No sign-up needed
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* API credential form */}
          {step.showForm && (
            <div className="space-y-4 my-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest mb-2" style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>
                  API Endpoint
                </label>
                <input
                  type="url"
                  value={draft.apiUrl}
                  onChange={(e) => setDraft((d) => ({ ...d, apiUrl: e.target.value }))}
                  placeholder="https://api.openai.com/v1/chat/completions"
                  className="retro-input"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest mb-2" style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>
                  Model
                </label>
                <ModelSelect
                  value={draft.model}
                  onChange={(model) => setDraft((d) => ({ ...d, model }))}
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest mb-2" style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>
                  API Key
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={draft.apiKey}
                    onChange={(e) => setDraft((d) => ({ ...d, apiKey: e.target.value }))}
                    placeholder="sk-••••••••••••••••"
                    className="retro-input retro-input-mono"
                    style={{ paddingRight: '2.5rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    aria-label={showKey ? 'Hide key' : 'Show key'}
                    style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', lineHeight: 1 }}
                  >
                    {showKey ? (
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
                <p className="mt-2" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--primary-dark)' }}>
                  ⚠ stored in localStorage — avoid shared computers
                </p>
              </div>
            </div>
          )}

          {/* Navigation row */}
          <div className="flex items-center justify-between mt-6">
            <div className="flex items-center gap-2">
              {stepIdx > 0 && !step.showSuccess && (
                <button onClick={() => setStepIdx((i) => i - 1)} className="retro-btn btn-ghost">
                  ← Back
                </button>
              )}
              {(stepIdx === 0 || step.showForm) && (
                <button
                  onClick={handleComplete}
                  className="retro-btn btn-ghost"
                  style={{ opacity: 0.55, fontSize: '0.78rem' }}
                >
                  Skip setup
                </button>
              )}
            </div>

            <div>
              {step.showSuccess ? (
                <button onClick={handleComplete} className="retro-btn btn-secondary">
                  Let's go →
                </button>
              ) : step.showForm ? (
                <button
                  onClick={handleSaveAndContinue}
                  disabled={!draft.apiKey.trim()}
                  className="retro-btn btn-primary"
                >
                  Save & Continue →
                </button>
              ) : (
                <button onClick={() => setStepIdx((i) => i + 1)} className="retro-btn btn-primary">
                  {stepIdx === 0 ? 'Get Started →' : 'Next →'}
                </button>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
