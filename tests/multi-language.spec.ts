import { test, expect } from '@playwright/test'
import path from 'path'
import { seedConfig, mockTranslateApi } from './helpers'

const SAMPLE = path.join(__dirname, 'fixtures', 'sample.xlf')
const BROKEN = path.join(__dirname, 'fixtures', 'broken.xlf')

test.describe('multi-language translate', () => {
  test.beforeEach(async ({ page }) => {
    await seedConfig(page)
    await mockTranslateApi(page)
    await page.goto('/multi-language')
  })

  test('translates one file into multiple checked + custom languages and downloads a zip', async ({ page }) => {
    await page.locator('input[type="file"]').setInputFiles(SAMPLE)
    await expect(page.getByText('sample.xlf')).toBeVisible()
    await expect(page.getByText('3 segments')).toBeVisible()

    await page.getByText('Spanish (es-ES)', { exact: true }).click()
    await page.getByText('French (fr-FR)', { exact: true }).click()

    await page.getByRole('button', { name: 'Add Other Language' }).click()
    await page.getByPlaceholder('e.g. Thai (th-TH), Vietnamese (vi-VN)').fill('Klingon (tlh)')

    await page.getByRole('button', { name: 'Start Translation' }).click()

    await expect(page.getByRole('heading', { name: 'All languages complete!' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('3 done')).toBeVisible()

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /Download All \(\.zip\)/ }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/^autol10n_multilang_.*\.zip$/)
  })

  test('supports multiple custom "Other" language entries at once', async ({ page }) => {
    await page.locator('input[type="file"]').setInputFiles(SAMPLE)

    await page.getByRole('button', { name: 'Add Other Language' }).click()
    await page.getByRole('button', { name: 'Add Other Language' }).click()
    const customInputs = page.getByPlaceholder('e.g. Thai (th-TH), Vietnamese (vi-VN)')
    await customInputs.nth(0).fill('Klingon (tlh)')
    await customInputs.nth(1).fill('Elvish (sjn)')

    await page.getByRole('button', { name: 'Start Translation' }).click()
    await expect(page.getByRole('heading', { name: 'All languages complete!' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('2 done')).toBeVisible()
  })

  test('rejects a malformed file eagerly, before any language selection', async ({ page }) => {
    await page.locator('input[type="file"]').setInputFiles(BROKEN)
    await expect(page.getByText(/failed to parse xliff/i)).toBeVisible()

    await page.getByText('Spanish (es-ES)', { exact: true }).click()
    await expect(page.getByRole('button', { name: 'Start Translation' })).toBeDisabled()
  })

  test('pausing and resuming completes all selected languages', async ({ page }) => {
    await page.unroute('**/api/translate')
    await page.route('**/api/translate', async (route) => {
      await new Promise((r) => setTimeout(r, 400))
      const body = route.request().postDataJSON() as { sourceXml: string; targetLanguage: string }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ translation: `[${body.targetLanguage}] ${body.sourceXml}` }),
      })
    })

    await page.locator('input[type="file"]').setInputFiles(SAMPLE)
    await page.getByText('Spanish (es-ES)', { exact: true }).click()
    await page.getByText('French (fr-FR)', { exact: true }).click()
    await page.getByRole('button', { name: 'Start Translation' }).click()

    await page.getByRole('button', { name: 'Pause After Current Segment' }).click()
    await expect(page.getByRole('button', { name: 'Resume Translation' })).toBeVisible({ timeout: 10_000 })

    await page.getByRole('button', { name: 'Resume Translation' }).click()
    await expect(page.getByRole('heading', { name: 'All languages complete!' })).toBeVisible({ timeout: 20_000 })
  })

  test('a session persists and restores across a page reload', async ({ page }) => {
    await page.locator('input[type="file"]').setInputFiles(SAMPLE)
    await page.getByText('Spanish (es-ES)', { exact: true }).click()
    await page.getByRole('button', { name: 'Start Translation' }).click()
    await expect(page.getByRole('heading', { name: 'All languages complete!' })).toBeVisible({ timeout: 15_000 })

    await page.reload()
    await expect(page.getByText('Session restored')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'All languages complete!' })).toBeVisible()
  })
})
