'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LlmConfigProvider, useLlmConfigContext, ONBOARDING_KEY } from '@/lib/llmConfigContext'
import SettingsModal from '@/components/SettingsModal'
import OnboardingModal from '@/components/OnboardingModal'
import TourModal from '@/components/TourModal'
import InfoModal from '@/components/InfoModal'
import type { LlmConfig } from '@/lib/types'

const TABS = [
  { href: '/', label: 'Single File' },
  { href: '/batch', label: 'Batch' },
  { href: '/multi-language', label: 'Multi-Language' },
]

function TabStrip() {
  const pathname = usePathname()
  return (
    <nav className="retro-tabstrip">
      {TABS.map((tab) => {
        const active = pathname === tab.href
        return (
          <Link key={tab.href} href={tab.href} className={`retro-tab${active ? ' active' : ''}`}>
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}

function Chrome({ children }: { children: React.ReactNode }) {
  const { config, needsOnboarding, saveConfig, showSettings, openSettings, closeSettings } = useLlmConfigContext()
  const [showTour, setShowTour] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [onboardingDismissed, setOnboardingDismissed] = useState(false)

  const handleOnboardingConfig = (newConfig: LlmConfig) => {
    saveConfig(newConfig)
  }

  const handleOnboardingComplete = () => {
    try { localStorage.setItem(ONBOARDING_KEY, '1') } catch {}
    setOnboardingDismissed(true)
  }

  const handleStartTour = () => {
    try { localStorage.setItem(ONBOARDING_KEY, '1') } catch {}
    setOnboardingDismissed(true)
    setShowTour(true)
  }

  const shouldShowOnboarding = needsOnboarding && !onboardingDismissed

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--canvas)' }}>

      {/* ── Navbar ─────────────────────────────────────────── */}
      <header className="retro-navbar">
        <div className="flex items-center gap-3">
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
        <div className="flex items-center gap-4">
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
        </div>
      </header>

      <TabStrip />

      {showSettings && <SettingsModal onClose={closeSettings} />}

      {children}

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
      {shouldShowOnboarding && (
        <OnboardingModal
          initialConfig={config}
          onSaveConfig={handleOnboardingConfig}
          onComplete={handleOnboardingComplete}
          onStartTour={handleStartTour}
        />
      )}

      {showTour && <TourModal onClose={() => setShowTour(false)} />}
      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}
    </div>
  )
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <LlmConfigProvider>
      <Chrome>{children}</Chrome>
    </LlmConfigProvider>
  )
}
