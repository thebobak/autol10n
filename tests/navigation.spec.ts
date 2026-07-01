import { test, expect } from '@playwright/test'
import { seedConfig } from './helpers'

test.describe('navigation', () => {
  test.beforeEach(async ({ page }) => {
    await seedConfig(page)
  })

  test('tab strip links to all three modes and reflects the active route', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Single File' })).toHaveClass(/active/)

    await page.getByRole('link', { name: 'Batch' }).click()
    await expect(page).toHaveURL('/batch')
    await expect(page.getByRole('link', { name: 'Batch' })).toHaveClass(/active/)
    await expect(page.getByRole('link', { name: 'Single File' })).not.toHaveClass(/active/)

    await page.getByRole('link', { name: 'Multi-Language' }).click()
    await expect(page).toHaveURL('/multi-language')
    await expect(page.getByRole('link', { name: 'Multi-Language' })).toHaveClass(/active/)

    await page.getByRole('link', { name: 'Single File' }).click()
    await expect(page).toHaveURL('/')
    await expect(page.getByRole('link', { name: 'Single File' })).toHaveClass(/active/)
  })

  test('LLM config is shared across all three pages', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.getByPlaceholder('sk-••••••••••••••••')).toHaveValue('test-key')
    await page.getByRole('button', { name: 'Cancel' }).click()

    await page.goto('/batch')
    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.getByPlaceholder('sk-••••••••••••••••')).toHaveValue('test-key')
    await page.getByRole('button', { name: 'Cancel' }).click()

    await page.goto('/multi-language')
    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.getByPlaceholder('sk-••••••••••••••••')).toHaveValue('test-key')
  })
})

test.describe('clear local data', () => {
  // Deliberately does not use the shared seedConfig() helper: it seeds via
  // addInitScript, which re-runs on every navigation — including the reload
  // Clear Data triggers — and would silently re-seed the config right after
  // it's cleared, masking whether the clear actually took effect. A one-time
  // evaluate() write avoids that.
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.setItem(
        'autol10n_config',
        JSON.stringify({ apiUrl: 'https://example.test/v1/chat/completions', apiKey: 'test-key', model: 'test-model', promptMode: 'standard', customPrompt: '' })
      )
      localStorage.setItem('autol10n_onboarded', '1')
    })
    await page.reload()
  })

  test('wipes the saved config after confirmation', async ({ page }) => {
    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.getByPlaceholder('sk-••••••••••••••••')).toHaveValue('test-key')

    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Clear All Local Data' }).click()
    await page.waitForLoadState('load')

    // Clearing data also wipes the "onboarded" flag, so the onboarding
    // wizard correctly reappears on reload — dismiss it to reach Settings.
    await page.getByRole('button', { name: 'Skip setup' }).click()

    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(page.getByPlaceholder('sk-••••••••••••••••')).toHaveValue('')
  })

  test('dismissing the confirmation leaves the config intact', async ({ page }) => {
    await page.getByRole('button', { name: 'Settings' }).click()

    page.once('dialog', (dialog) => dialog.dismiss())
    await page.getByRole('button', { name: 'Clear All Local Data' }).click()

    await expect(page.getByPlaceholder('sk-••••••••••••••••')).toHaveValue('test-key')
  })
})
