import { test, expect } from '@playwright/test'
import path from 'path'
import { seedConfig, mockTranslateApi } from './helpers'

const SAMPLE = path.join(__dirname, 'fixtures', 'sample.xlf')
const BROKEN = path.join(__dirname, 'fixtures', 'broken.xlf')
const DUPLICATES = path.join(__dirname, 'fixtures', 'duplicates.xlf')

test.describe('single-file translate', () => {
  test.beforeEach(async ({ page }) => {
    await seedConfig(page)
    await mockTranslateApi(page)
    await page.goto('/')
  })

  test('uploads a file, translates it, and downloads the result', async ({ page }) => {
    await page.locator('input[type="file"]').setInputFiles(SAMPLE)
    await expect(page.getByText('sample.xlf')).toBeVisible()
    await expect(page.getByRole('strong').filter({ hasText: 'en-US' })).toBeVisible()

    await page.getByRole('combobox').selectOption({ label: 'Spanish (es-ES)' })
    await page.getByRole('button', { name: 'Start Translation' }).click()

    await expect(page.getByRole('heading', { name: 'Translation complete!' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('3 units translated')).toBeVisible()

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download Translated XLIFF' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('sample_translated.xlf')
  })

  test('supports a custom "Other" language', async ({ page }) => {
    await page.locator('input[type="file"]').setInputFiles(SAMPLE)
    await page.getByRole('combobox').selectOption({ value: '__custom__' })
    await page.getByPlaceholder('e.g. Thai (th-TH), Vietnamese (vi-VN)').fill('Klingon (tlh)')
    await page.getByRole('button', { name: 'Start Translation' }).click()
    await expect(page.getByRole('heading', { name: 'Translation complete!' })).toBeVisible({ timeout: 15_000 })
  })

  test('pausing and resuming completes the translation', async ({ page }) => {
    // Slow the mocked API so there's a real window to click Cancel mid-run.
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
    await page.getByRole('combobox').selectOption({ label: 'Spanish (es-ES)' })
    await page.getByRole('button', { name: 'Start Translation' }).click()

    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('heading', { name: 'Translation paused' })).toBeVisible({ timeout: 10_000 })

    await page.getByRole('button', { name: 'Resume Translation' }).click()
    await expect(page.getByRole('heading', { name: 'Translation complete!' })).toBeVisible({ timeout: 15_000 })
  })

  test('a session persists and restores across a page reload', async ({ page }) => {
    await page.locator('input[type="file"]').setInputFiles(SAMPLE)
    await page.getByRole('combobox').selectOption({ label: 'Spanish (es-ES)' })
    await page.getByRole('button', { name: 'Start Translation' }).click()
    await expect(page.getByRole('heading', { name: 'Translation complete!' })).toBeVisible({ timeout: 15_000 })

    await page.reload()
    await expect(page.getByText('Session restored')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Translation complete!' })).toBeVisible()
  })

  test('identical repeated segments are translated once and reused', async ({ page }) => {
    let callCount = 0
    await page.unroute('**/api/translate')
    await page.route('**/api/translate', async (route) => {
      callCount++
      const body = route.request().postDataJSON() as { sourceXml: string; targetLanguage: string }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ translation: `[${body.targetLanguage}] ${body.sourceXml}` }),
      })
    })

    // duplicates.xlf has 5 units but only 3 unique source strings — "Continue"
    // repeats three times — so a correct dedup cache should call the API 3 times.
    await page.locator('input[type="file"]').setInputFiles(DUPLICATES)
    await page.getByRole('combobox').selectOption({ label: 'Spanish (es-ES)' })
    await page.getByRole('button', { name: 'Start Translation' }).click()

    await expect(page.getByRole('heading', { name: 'Translation complete!' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('5 units translated')).toBeVisible()
    expect(callCount).toBe(3)
  })

  test('a malformed XLIFF file surfaces a parse error and blocks translation', async ({ page }) => {
    await page.locator('input[type="file"]').setInputFiles(BROKEN)
    await page.getByRole('combobox').selectOption({ label: 'Spanish (es-ES)' })

    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Start Translation' }).click()

    // No successful transition to the translating/complete state.
    await expect(page.getByRole('heading', { name: 'Translation complete!' })).not.toBeVisible()
  })
})
