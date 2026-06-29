'use client'

import { useState } from 'react'
import { TOUR_STEPS } from '@/lib/coaching'

interface Props {
  onClose: () => void
}

export default function TourModal({ onClose }: Props) {
  const [stepIdx, setStepIdx] = useState(0)
  const step = TOUR_STEPS[stepIdx]
  const isFirst = stepIdx === 0
  const isLast = stepIdx === TOUR_STEPS.length - 1

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(43,45,66,0.6)' }}
      onClick={onClose}
    >
      <div className="retro-card w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">

          {/* Progress dots */}
          <div className="flex items-center gap-2 mb-5">
            {TOUR_STEPS.map((_, i) => (
              <div
                key={i}
                style={{
                  width: i === stepIdx ? '16px' : '6px',
                  height: '6px',
                  borderRadius: '3px',
                  background: i <= stepIdx ? 'var(--secondary)' : 'var(--disabled)',
                  transition: 'all 200ms var(--ease-mech)',
                }}
              />
            ))}
            <span className="ml-auto" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--muted)' }}>
              {stepIdx + 1}/{TOUR_STEPS.length}
            </span>
          </div>

          {/* Badge + title */}
          <div className="flex items-center gap-3 mb-3">
            <span className="retro-section-num">{step.badge}</span>
            <h3 className="text-base font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
              {step.title}
            </h3>
          </div>

          {/* Body */}
          <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--darker)' }}>
            {step.body}
          </p>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <div>
              {!isFirst ? (
                <button onClick={() => setStepIdx((i) => i - 1)} className="retro-btn btn-ghost">
                  ← Back
                </button>
              ) : (
                <button
                  onClick={onClose}
                  className="retro-btn btn-ghost"
                  style={{ opacity: 0.55, fontSize: '0.78rem' }}
                >
                  Skip tour
                </button>
              )}
            </div>
            <div>
              {isLast ? (
                <button onClick={onClose} className="retro-btn btn-secondary">
                  Done ✓
                </button>
              ) : (
                <button onClick={() => setStepIdx((i) => i + 1)} className="retro-btn btn-primary">
                  Next →
                </button>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
