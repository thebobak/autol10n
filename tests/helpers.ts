import type { Page } from '@playwright/test'

/**
 * Pre-seed a valid LLM config into localStorage before navigation, so tests
 * never hit the onboarding modal and always pass the "no API key" checks.
 * Must run via addInitScript (before any app code executes on first paint).
 */
export async function seedConfig(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'autol10n_config',
      JSON.stringify({
        apiUrl: 'https://example.test/v1/chat/completions',
        apiKey: 'test-key',
        model: 'test-model',
        promptMode: 'standard',
        customPrompt: '',
      })
    )
    localStorage.setItem('autol10n_onboarded', '1')
  })
}

/**
 * Mock the /api/translate route so tests never call a real LLM. Returns a
 * deterministic translation derived from the source XML — prefixing with the
 * target language keeps assertions simple while proving the right language
 * was requested for the right segment.
 */
export async function mockTranslateApi(page: Page) {
  await page.route('**/api/translate', async (route) => {
    const body = route.request().postDataJSON() as { sourceXml: string; targetLanguage: string }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ translation: `[${body.targetLanguage}] ${body.sourceXml}` }),
    })
  })
}
