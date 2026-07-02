# AutoL10n

AI-powered XLIFF translation for e-learning localization. AutoL10n automates the translation of XLIFF files exported from Articulate Rise, sending each segment to any OpenAI-compatible LLM and returning a translated file ready for re-import.

---

## Features

- **Three translation modes** — Single File (with manual review/editing), Batch (many files → one language), and Multi-Language (one file → many languages)
- **XLIFF 1.2 support** — parses and serializes `.xlf` / `.xliff` files, preserving all XML markup tags exactly
- **Any OpenAI-compatible API** — works with OpenAI, Anthropic, Google AI, or a custom/corporate endpoint
- **Per-segment translation** — each `<trans-unit>` is sent individually, keeping prompts small and XML structure intact
- **Retry logic** — exponential backoff on rate-limit (429) responses; 55-second timeout per segment
- **Source language detection** — reads `source-language` from the XLIFF `<file>` element automatically
- **Pause / resume** — every mode checkpoints progress to `localStorage`; refreshing or closing the tab mid-run picks up where it left off
- **Manual review** — Single File mode includes a Review & Edit drawer to hand-correct any translated segment before download, without disturbing surrounding XML markup
- **Custom system prompt** — override or extend the default translation instructions per-deployment (tone, etc.)
- **Glossary** — pin preferred translations for specific terms, per target language, so they translate consistently across every segment, file, and run; supports manual entry and CSV import/export
- **Browser-side processing** — files never leave the user's machine except to the configured LLM endpoint
- **Persistent settings** — API URL, model, key, and prompt customization saved to `localStorage`

---

## Getting Started

### Prerequisites

- Node.js 18 or later
- An API key for an OpenAI-compatible LLM (see [Supported Providers](#supported-providers))

### Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). On first launch, the onboarding wizard will walk you through API configuration (or hit Skip to configure later in Settings).

---

## Supported Providers

AutoL10n works with any endpoint that follows the OpenAI chat completions format (`POST /v1/chat/completions`).

| Provider | API Key page |
|---|---|
| OpenAI | https://platform.openai.com/api-keys |
| Anthropic | https://console.anthropic.com/ |
| Google AI | https://aistudio.google.com/apikey |
| Custom / corporate | Enter your endpoint URL in Settings |

---

## Usage

### Single File (`/`)

1. **Upload** — export your course from Articulate Rise via *File › Export › XLIFF* and drop the `.xlf` file into the upload zone.
2. **Select language** — choose a target language from the dropdown, or type a custom locale.
3. **Configure** — open Settings and enter your API endpoint, model, and API key. Settings persist in the browser and are shared across all three modes.
4. **Translate** — click *Start Translation*. Progress is shown per segment; errors are logged and retried automatically. Pause anytime — resuming continues from the last completed segment.
5. **Review (optional)** — open *Review & Edit Translated Segments* to search, filter by errors/edits, and hand-correct any segment.
6. **Download** — download the translated `.xlf` and re-import it into Articulate Rise via *File › Import Translation*.

### Batch (`/batch`)

Upload multiple `.xlf` files (soft cap of 25, though more will work), pick one target language for the whole run, and translate sequentially. Pause after the current segment, or cancel the batch entirely. If a file fails to parse, you're prompted to skip it or cancel the run. Download every translated file bundled into one `.zip`.

### Multi-Language (`/multi-language`)

Upload a single `.xlf` file, then check off any number of preset languages and/or add custom ones for edge-case locales. The file is validated once up front so a broken upload is caught before you start. Translation runs one language at a time; pause and resume as needed. Download every language's output bundled into one `.zip`, each entry named with its language code.

---

## Project Structure

```
app/
  page.tsx                    # Single File mode — upload, translate, review, download
  batch/page.tsx               # Batch mode — many files → one language, zipped
  multi-language/page.tsx      # Multi-Language mode — one file → many languages, zipped
  layout.tsx                   # Root layout, font loading, mounts AppShell
  globals.css                  # Retro Design System tokens and component classes
  api/
    translate/
      route.ts                # Server-side LLM proxy (handles CORS, prompt building, 55s timeout)

components/
  AppShell.tsx                # Navbar, tab strip, footer, shared modals
  SettingsModal.tsx            # LLM config + Danger Zone (clear local data)
  OnboardingModal.tsx          # First-run wizard
  ModelSelect.tsx              # Shared model picker (Settings + Onboarding)
  GlossaryModal.tsx            # Per-language term table + CSV import/export
  InfoModal.tsx                # About / changelog panel
  ReviewDrawer.tsx             # Single File mode's segment review/edit UI

lib/
  xliff.ts                     # XLIFF parser and serializer
  translate.ts                 # translateUnit() — per-segment API call with retry
  dedupe.ts                    # Exact-source-match translation cache
  glossary.ts                  # Per-language glossary storage, matching, CSV
  prompt.ts                    # Default + customizable system prompt builder
  languages.ts                 # Shared preset language list
  llmConfigContext.tsx         # Shared LLM config context + model list
  batch.ts                     # Batch mode types + session persistence
  multiLanguage.ts              # Multi-Language mode types + session persistence
  filenames.ts                 # Filename-suffix and language-code helpers
  clearData.ts                 # Wipes all autol10n_* localStorage keys
  types.ts                     # Shared TypeScript types
  appinfo.ts                   # App description and changelog — edit to update
  coaching.ts                  # Onboarding copy — edit to update

tests/
  navigation.spec.ts           # Tab strip, shared config, clear-data
  single-file.spec.ts          # Single File mode E2E
  batch.spec.ts                # Batch mode E2E
  multi-language.spec.ts       # Multi-Language mode E2E
  glossary.spec.ts             # Glossary management + CSV + request wiring E2E
  helpers.ts                   # seedConfig(), mockTranslateApi()
  fixtures/                    # Sample + intentionally-broken .xlf files, sample glossary CSV
```

See `ARCHITECTURE.md` for a deeper dive into data flow, state machines, and design decisions.

---

## Updating the Changelog

Open `lib/appinfo.ts` and prepend a new entry to the `CHANGELOG` array. No other files need to change.

```ts
export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026.07.15',       // shown as-is in the About panel
    label: 'v2.1',            // optional short label
    changes: [
      'Added glossary support',
      'Fixed serialization of nested CDATA sections',
    ],
  },
  // ... existing entries
]
```

The About panel (accessible from the navbar) reads this array directly. Note: `date` is display-only and not required to be unique — the panel keys its list by array index for this reason.

---

## Updating Onboarding Content

All coaching copy lives in `lib/coaching.ts`:

- **`ONBOARDING_STEPS`** — the wizard shown to new users
- **`PROVIDERS`** — the provider cards in the onboarding (name, description, API URL, default model)

Edit the string values freely. The step structure (which steps show a form, which show a provider grid, etc.) is controlled by boolean flags on each step object — see the type definitions at the top of the file.

---

## Managing the Glossary

Open Settings → Manage Glossary to pin preferred translations for specific terms, scoped per target language. Add terms manually, or import a 2-column CSV (`Source Term,Translation`, header optional) — useful if your team already maintains a terminology list. Export any language's terms back to CSV at any time. Glossary terms are stored in `localStorage` alongside everything else and are automatically included in "Clear All Local Data".

## Updating the Model List

`MODEL_GROUPS` in `lib/llmConfigContext.tsx` defines the grouped dropdown shown by `ModelSelect` (used in both Settings and Onboarding). Add or remove models there — no component changes needed. Anything not in the list still works via the "Other (specify below)" free-text fallback.

---

## Running Tests

```bash
npm run test:e2e
```

Playwright builds and serves a production build on port 3100, then runs the full suite (`tests/*.spec.ts`) against it with the `/api/translate` call mocked — no real API key or LLM spend required.

---

## Deployment

AutoL10n is a standard Next.js application and deploys to any Node.js-compatible platform.

### Vercel (recommended)

```bash
npm install -g vercel
vercel
```

The build date displayed in the footer and About panel is generated automatically at deploy time in `next.config.ts` — no environment variables need to be set manually.

### Other platforms (Railway, Render, Fly.io, etc.)

```bash
npm run build
npm start
```

Set the Node.js version to 18+ in your platform's settings. No other environment variables are required.

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

---

## API Route

The `/api/translate` serverless route proxies translation requests to the configured LLM endpoint. It handles CORS, URL normalisation, system-prompt construction, and enforces a 55-second timeout.

**Request** (`POST /api/translate`):

```json
{
  "sourceXml":      "<g id=\"abc\">Hello world</g>",
  "targetLanguage": "Spanish (es-ES)",
  "apiUrl":         "https://api.openai.com/v1/chat/completions",
  "apiKey":         "sk-...",
  "model":          "gpt-4o",
  "promptMode":     "standard",
  "customPrompt":   "",
  "glossaryTerms":  []
}
```

**Response**:

```json
{ "translation": "<g id=\"abc\">Hola mundo</g>" }
```

The route accepts a bare base URL (e.g. `https://api.openai.com`) and appends `/v1/chat/completions` automatically.

---

## Privacy

- XLIFF files are parsed entirely in the browser and never uploaded to any AutoL10n server.
- Segment text is sent only to the LLM endpoint configured by the user.
- API keys are stored in the browser's `localStorage` and are included only in requests to `/api/translate`. They are not logged or persisted server-side.

---

## License

Internal use only.
