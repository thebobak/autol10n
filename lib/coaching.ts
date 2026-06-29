// ─── Coaching data ────────────────────────────────────────────────────────────
// Edit the text in this file freely. The types and structure are fixed, but
// every string value is yours to change without touching any component code.

export type OnboardingStep = {
  id: string
  title: string
  body: string[]         // rendered as paragraphs
  tip?: string           // amber callout below body
  showProviders?: true   // renders the provider selection grid
  showForm?: true        // renders the API credential form
  showSuccess?: true     // renders the completion state
}

export type Provider = {
  name: string
  description: string    // shown under the name in the selection card
  docsUrl: string | null // link to API key creation page; null = no external link
  apiUrl: string         // pre-fills the API Endpoint field
  defaultModel: string   // pre-fills the Model field
}

export type TourStep = {
  id: string
  badge: string          // short label shown in the section-number badge
  title: string
  body: string
}

// ─── Onboarding wizard (shown once to new users) ──────────────────────────────

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to AutoL10n',
    body: [
      'AutoL10n translates XLIFF files exported from Articulate Rise using AI — no spreadsheets, no copy-paste, no manual formatting.',
      "To get started you'll need an API key from an LLM provider. It takes about 2 minutes.",
    ],
  },
  {
    id: 'providers',
    title: 'Get an API Key',
    body: [
      'AutoL10n works with any OpenAI-compatible API. Pick a provider below, create a free account, and grab your key.',
    ],
    tip: 'Already have a key? Hit Next to skip straight to setup.',
    showProviders: true,
  },
  {
    id: 'configure',
    title: 'Enter Your Credentials',
    body: [
      'Paste your API key below. Your credentials are saved only in this browser — they are never sent to our servers.',
    ],
    tip: 'The API URL and Model are pre-filled when you select a provider above. You can change them at any time via Settings.',
    showForm: true,
  },
  {
    id: 'complete',
    title: "You're all set!",
    body: [
      'AutoL10n is ready. Upload an .xlf file, pick a target language, and hit Start Translation.',
      'Want a quick walkthrough of the interface? Take the 60-second tour.',
    ],
    showSuccess: true,
  },
]

// ─── LLM providers (used in the onboarding provider selection step) ───────────

export const PROVIDERS: Provider[] = [
  {
    name: 'OpenAI',
    description: 'GPT-4o · Best overall quality',
    docsUrl: 'https://platform.openai.com/api-keys',
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o',
  },
  {
    name: 'Anthropic',
    description: 'Claude · Strong multilingual reasoning',
    docsUrl: 'https://console.anthropic.com/',
    apiUrl: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-sonnet-4-6',
  },
  {
    name: 'Google AI',
    description: 'Gemini Flash · Fast and affordable',
    docsUrl: 'https://aistudio.google.com/apikey',
    apiUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    defaultModel: 'gemini-2.0-flash',
  },
  {
    name: 'Corporate Endpoint',
    description: "Your org's private LLM proxy",
    docsUrl: null,
    apiUrl: 'https://llm.atko.ai/v1/chat/completions',
    defaultModel: 'gpt-4o',
  },
]

// ─── Optional UI tour ─────────────────────────────────────────────────────────

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'upload',
    badge: '01',
    title: 'Upload Your XLIFF File',
    body: "Export your course from Articulate Rise: File › Export › XLIFF. You'll get a .xlf file. Drop it into the upload zone, or click to browse.",
  },
  {
    id: 'language',
    badge: '02',
    title: 'Pick a Target Language',
    body: '18 common languages are pre-loaded. Choose "Other" to type any custom locale (e.g. ms-MY, fil-PH).',
  },
  {
    id: 'translate',
    badge: '03',
    title: 'Run the Translation',
    body: 'Hit Start Translation. Each XLIFF segment is sent to the AI individually. XML formatting tags inside your content are preserved exactly — so the re-import into Rise works without manual cleanup.',
  },
  {
    id: 'download',
    badge: '04',
    title: 'Download and Re-import',
    body: 'Download the translated .xlf file. In Articulate Rise, go to File › Import Translation and select the file to apply your translations.',
  },
]
