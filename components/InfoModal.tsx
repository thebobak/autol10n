'use client'

import { APP_INFO, CHANGELOG } from '@/lib/appinfo'

interface Props {
  onClose: () => void
}

export default function InfoModal({ onClose }: Props) {
  const buildDate = process.env.NEXT_PUBLIC_BUILD_DATE ?? '—'

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(43,45,66,0.7)' }}
      onClick={onClose}
    >
      <div
        className="retro-card w-full max-w-md flex flex-col"
        style={{ maxHeight: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 pb-0 shrink-0">
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-3">
              <img src="/logo.svg" width={40} height={40} alt="AutoL10n" />
              <div>
                <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
                  {APP_INFO.name}
                </h2>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--muted)', letterSpacing: '0.04em' }}>
                  {APP_INFO.tagline}
                </p>
              </div>
            </div>
            <button onClick={onClose} style={{ color: 'var(--muted)', lineHeight: 1, flexShrink: 0, marginLeft: '0.75rem' }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Description */}
          <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--darker)' }}>
            {APP_INFO.description}
          </p>

          {/* Meta row */}
          <div
            className="flex items-center justify-between py-4 mb-5"
            style={{ borderTop: '2px solid var(--ink)', borderBottom: '2px solid var(--ink)' }}
          >
            <div>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '2px' }}>
                Created by
              </p>
              <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
                {APP_INFO.creator}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '2px' }}>
                Build
              </p>
              <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-mono)' }}>
                {buildDate}
              </p>
            </div>
          </div>

          {/* Changelog heading */}
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>
            Changelog
          </p>
        </div>

        {/* Scrollable changelog */}
        <div className="px-6 pb-6 overflow-y-auto">
          <div className="space-y-5">
            {CHANGELOG.map((entry, i) => (
              // date is not guaranteed unique — multiple entries can ship the
              // same day — so index is used instead, safe since this list is
              // static (never reordered or filtered).
              <div key={i}>
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="retro-section-num"
                    style={{ background: 'var(--ink)', fontSize: '0.6rem', minWidth: 'auto', padding: '0.2rem 0.5rem' }}
                  >
                    {entry.date}
                  </span>
                  {entry.label && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--muted)' }}>
                      {entry.label}
                    </span>
                  )}
                </div>
                <ul className="space-y-1">
                  {entry.changes.map((change, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span style={{ color: 'var(--primary)', fontWeight: 700, flexShrink: 0, lineHeight: '1.5' }}>·</span>
                      <span className="text-sm leading-relaxed" style={{ color: 'var(--darker)' }}>{change}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
