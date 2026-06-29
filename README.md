# AutoL10n

AI-powered XLIFF translation for e-learning localization. AutoL10n automates the translation of XLIFF files exported from Articulate Rise, sending each segment to any OpenAI-compatible LLM and returning a translated file ready for re-import.

---

## Features

- **XLIFF 1.2 support** — parses and serializes `.xlf` / `.xliff` files, preserving all XML markup tags exactly
- **Any OpenAI-compatible API** — works with OpenAI, Anthropic, Google AI, Llama, Mistral, or a custom endpoint
- **Per-segment translation** — each `<trans-unit>` is sent individually, keeping prompts small and XML structure intact
- **Retry logic** — exponential backoff on rate-limit (429) responses; 55-second timeout per segment
- **Source language detection** — reads `source-language` from the XLIFF `<file>` element automatically
- **Browser-side processing** — files never leave the user's machine except to the configured LLM endpoint
- **Persistent settings** — API URL, model, and key saved to `localStorage`

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

Open [http://localhost:3000](http://localhost:3000). On first launch, the onboarding wizard will walk you through API configuration.

---

## Supported Providers

AutoL10n works with any endpoint that follows the OpenAI chat completions format (`POST /v1/chat/completions`).

| Provider | API Key page |
|---|---|
| OpenAI | https://platform.openai.com/api-keys |
| Anthropic | https://console.anthropic.com/ |
| Google AI | https://aistudio.google.com/apikey |
| Mistral | https://console.mistral.ai/ |
| Custom / corporate | Enter your endpoint URL in Settings |

---

## Usage

1. **Upload** — export your course from Articulate Rise via *File › Export › XLIFF* and drop the `.xlf` file into the upload zone.
2. **Select language** — choose a target language from the dropdown, or type a custom locale.
3. **Configure** — open Settings and enter your API endpoint, model name, and API key. Settings persist in the browser.
4. **Translate** — click *Start Translation*. Progress is shown per segment; errors are logged and retried automatically.
5. **Download** — download the translated `.xlf` and re-import it into Articulate Rise via *File › Import Translation*.

---

## Project Structure

```
app/
  page.tsx              # Main SPA — all UI state and translation loop
  layout.tsx            # Root layout, font loading
  globals.css           # Retro Design System tokens and component classes
  api/
    translate/
      route.ts          # Server-side LLM proxy (handles CORS, 55s timeout)

components/
  OnboardingModal.tsx   # First-run wizard
  TourModal.tsx         # Optional UI walkthrough
  InfoModal.tsx         # About / changelog panel

lib/
  xliff.ts              # XLIFF parser and serializer
  types.ts              # Shared TypeScript types
  appinfo.ts            # App description and changelog — edit to update
  coaching.ts           # Onboarding and tour copy — edit to update
```

---

## Updating the Changelog

Open `lib/appinfo.ts` and prepend a new entry to the `CHANGELOG` array. No other files need to change.

```ts
export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026.07.15',       // shown as-is in the About panel
    label: 'v0.4',            // optional short label
    changes: [
      'Added glossary support',
      'Fixed serialization of nested CDATA sections',
    ],
  },
  // ... existing entries
]
```

The About panel (accessible from the navbar) reads this array directly.

---

## Updating Onboarding and Tour Content

All coaching copy lives in `lib/coaching.ts`:

- **`ONBOARDING_STEPS`** — the four-step wizard shown to new users
- **`PROVIDERS`** — the provider cards in the onboarding (name, description, API URL, default model)
- **`TOUR_STEPS`** — the optional UI walkthrough

Edit the string values freely. The step structure (which steps show a form, which show a provider grid, etc.) is controlled by boolean flags on each step object — see the type definitions at the top of the file.

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

The `/api/translate` serverless route proxies translation requests to the configured LLM endpoint. It handles CORS, URL normalisation, and enforces a 55-second timeout.

**Request** (`POST /api/translate`):

```json
{
  "sourceXml":      "<g id=\"abc\">Hello world</g>",
  "targetLanguage": "Spanish (es-ES)",
  "apiUrl":         "https://api.openai.com/v1/chat/completions",
  "apiKey":         "sk-...",
  "model":          "gpt-4o"
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
