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
    date: '2026.06.30',
    label: 'v2.0',
    changes: [
      'Added a shared navbar and tab strip for switching between Single File, Batch, and Multi-Language modes',
      'Added Batch mode — upload up to 25 XLIFF files and translate them sequentially into one target language',
      'Batch mode supports pause/resume, session persistence across a page refresh, and a skip-or-cancel prompt if a file fails to parse',
      'Batch mode downloads all translated files bundled into a single .zip',
      'Added Multi-Language mode — upload one XLIFF file and translate it into any number of languages in one run',
      'Multi-Language mode supports checkbox selection from the standard language list plus unlimited custom "Other" entries',
      'Multi-Language mode supports pause/resume, session persistence, and downloads all translated languages bundled into a single .zip',
      'LLM configuration (API URL, model, key, system prompt) is now shared across all three modes',
    ],
  },
  {
    date: '2026.06.30',
    label: 'v1.0',
    changes: [
      'Translation review drawer — side-by-side source and translation with plain-text editing',
      'Edits applied surgically via character-level diff, preserving all XML tag structure (bold, italic, etc.)',
      'Per-segment Revert (↩) and global Revert All restore the original AI translation',
      'Edit state persists across drawer open/close; Edited filter and revert buttons survive unmount',
      'Download Edited XLIFF includes all manual edits; Download Original AI Translation available when edits exist',
      'Download button label changes to "Download Edited XLIFF" when manual edits have been made',
      'Fixed duplicate trans-unit id="title" collision — element references used as keys throughout',
      'Pause and Resume translation — cancel mid-run and continue from exactly where you stopped',
      'Partial download available in paused state; errors carry forward on resume',
      'Cancel button shows "Cancelling…" while in-flight request completes',
      'Segment counter and estimated time remaining displayed below progress bar',
      'Build version now includes hour (e.g. 2026.06.30.09) to distinguish same-day deploys',
      'Updated the model list to match models actually available on this team; default changed to gemini-3.1-pro-preview',
      'Added "Check Access" button in Settings to test API connectivity and surface which models are available',
      'Added session persistence — translation progress is saved to localStorage and automatically restored on page reload',
    ],
  },
  {
    date: '2026.06.29',
    label: 'v0.4',
    changes: [
      'Added estimated time remaining during translation (rolling average of API response times)',
      'Added segment count display (e.g. "45 / 200 segments") below the progress bar',
      'Cancel button now shows "Cancelling…" feedback while the in-flight request completes',
      'Styled previously invisible text-only buttons (Cancel, error log toggle, settings close, remove file)',
      'Removed terminal-style $ prefix from the translating status message',
      'Committed pre-built .next/ to repo to fix Kubernetes container deployment (nonroot permissions)',
      'Added server.js entry point for platforms that require an explicit Node.js entry file',
      'Moved tailwindcss and @tailwindcss/postcss to production dependencies for build compatibility',
    ],
  },
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
