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
    id: 'batch',
    title: 'Translate Many Files at Once',
    body: [
      "Need to localize a whole course library? Switch to the Batch tab to upload up to 25 XLIFF files and translate them into one target language, one after another.",
      'Pause and resume anytime, and download every translated file bundled into a single .zip when the run finishes.',
    ],
  },
  {
    id: 'multi-language',
    title: 'One File, Many Languages',
    body: [
      "Going the other direction? The Multi-Language tab takes a single XLIFF file and translates it into as many languages as you need in one run — check off common languages or add custom ones for edge-case locales.",
      'Just like Batch, results download together as a single .zip.',
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
      'AutoL10n is ready. Pick the Single File, Batch, or Multi-Language tab, upload your XLIFF, and hit Start Translation.',
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
