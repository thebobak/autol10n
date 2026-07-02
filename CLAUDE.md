@AGENTS.md

# AutoL10n

Next.js app that translates XLIFF (`.xlf`/`.xliff`) files exported from Articulate Rise using any OpenAI-compatible LLM. All translation logic runs client-side in the browser; the only server code is a thin CORS proxy at `app/api/translate/route.ts`.

Three modes share one codebase: Single File (`/`, with a Review & Edit drawer), Batch (`/batch`, many files → one language), and Multi-Language (`/multi-language`, one file → many languages). See `ARCHITECTURE.md` for data flow, state machines, and design rationale, and `README.md` for user-facing usage and project structure. Keep both up to date when adding features or changing architecture.

## Conventions to follow

- All localStorage keys use the `autol10n_` prefix — this is load-bearing for `lib/clearData.ts`'s "Clear All Local Data" feature, which wipes by prefix scan rather than importing each module's key constant.
- `lib/xliff.ts`, `lib/translate.ts`, `lib/prompt.ts`, and `lib/languages.ts` are shared by all three modes — changes there affect every route.
- Model list lives in one place: `MODEL_GROUPS` in `lib/llmConfigContext.tsx`, rendered by the shared `components/ModelSelect.tsx`.
- Changelog entries (`lib/appinfo.ts`) are keyed by array index in `InfoModal`, not by `date` — dates are display-only and not guaranteed unique.
- Run `npx tsc --noEmit` and `npm run build` after non-trivial changes; run `npm run test:e2e` (Playwright) before considering a feature complete.
