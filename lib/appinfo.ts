// ─── App info & changelog ─────────────────────────────────────────────────────
// Edit freely. To log a new release, prepend an entry to CHANGELOG — most
// recent first. The build date in the footer comes from next.config.ts and
// updates automatically on every deploy; no need to touch it here.

export const APP_INFO = {
  name: 'AutoL10n',
  tagline: 'AI-powered XLIFF translation for e-learning localization',
  description:
    'AutoL10n automates the translation of XLIFF files exported from Articulate Rise. ' +
    'Each trans-unit segment is sent individually to any OpenAI-compatible LLM, XML ' +
    'formatting tags are preserved exactly, and the translated file can be re-imported ' +
    'into Rise without any manual cleanup.',
  creator: 'Bobak Shafiei',
  repository: null as string | null, // set to a URL string to show a repo link
}

export type ChangelogEntry = {
  date: string      // displayed as-is, e.g. "2026.06.29"
  label?: string    // optional short label, e.g. "v0.2" or "Beta launch"
  changes: string[] // bullet points; keep each entry to one short sentence
}

// ─── Add new entries at the TOP of this array ────────────────────────────────
export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026.06.29',
    label: 'v0.3',
    changes: [
      'Added onboarding wizard that guides new users through API configuration',
      'Added optional UI tour accessible from the navbar',
      'Added changelog and About modal (this panel)',
      'Added CalVer build date to footer, generated at deploy time',
      'Fixed navbar bottom border offset caused by child box-shadow bleed',
      'Improved settings: model dropdown with grouped providers, API key visibility toggle',
    ],
  },
  {
    date: '2026.06.27',
    label: 'v0.2',
    changes: [
      'Applied Retro Design System (Space Grotesk, Manrope, Space Mono fonts)',
      'Orange navbar, lime green progress bar, hard ink box-shadows throughout',
      'Replaced window chrome headers with clean card variants (standard, flat, dashed)',
      'Added SVG globe logo mark to navbar',
      'Added instructions card and authorship footer',
      'Source language auto-detected from XLIFF and displayed on upload',
      'Steps reordered: upload first, language selection second',
    ],
  },
  {
    date: '2026.06.26',
    label: 'v0.1',
    changes: [
      'Initial release — Next.js 16 + Tailwind CSS scaffold',
      'XLIFF 1.2 parser and serializer using browser DOMParser / XMLSerializer',
      'Per-segment translation loop via OpenAI-compatible API proxy route',
      'Exponential backoff retry on 429 rate-limit responses',
      'Progress bar, per-unit status text, and collapsible error log',
      'LLM configuration (API URL, key, model) persisted to localStorage',
      'Download translated XLIFF with original filename preserved',
    ],
  },
]
