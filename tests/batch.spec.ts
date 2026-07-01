import { test, expect } from '@playwright/test'
import path from 'path'
import { seedConfig, mockTranslateApi } from './helpers'

const SAMPLE = path.join(__dirname, 'fixtures', 'sample.xlf')
const SAMPLE2 = path.join(__dirname, 'fixtures', 'sample2.xlf')
const BROKEN = path.join(__dirname, 'fixtures', 'broken.xlf')

test.describe('batch translate', () => {
  test.beforeEach(async ({ page }) => {
    await seedConfig(page)
    await mockTranslateApi(page)
    await page.goto('/batch')
  })

  test('translates multiple files sequentially and downloads a zip', async ({ page }) => {
    await page.locator('input[type="file"]').setInputFiles([SAMPLE, SAMPLE2])
    await expect(page.getByText('sample.xlf')).toBeVisible()
    await expect(page.getByText('sample2.xlf')).toBeVisible()

    await page.getByRole('combobox').selectOption({ label: 'French (fr-FR)' })
    await page.getByRole('button', { name: 'Start Batch Translation' }).click()

    await expect(page.getByRole('heading', { name: 'Batch complete!' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('2 done')).toBeVisible()

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /Download All \(\.zip\)/ }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/^autol10n_batch_.*\.zip$/)
  })

  test('warns but does not block when more than 25 files are selected', async ({ page }) => {
    const many = Array.from({ length: 26 }, () => SAMPLE)
    await page.locator('input[type="file"]').setInputFiles(many)
    await expect(page.getByText(/you've selected 26 files/i)).toBeVisible()
  })

  test('a fatal parse error prompts to skip the file or cancel the batch', async ({ page }) => {
    await page.locator('input[type="file"]').setInputFiles([BROKEN, SAMPLE])
    await page.getByRole('combobox').selectOption({ label: 'French (fr-FR)' })
    await page.getByRole('button', { name: 'Start Batch Translation' }).click()

    await expect(page.getByRole('heading', { name: "Couldn't parse this file" })).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Skip This File' }).click()

    await expect(page.getByRole('heading', { name: 'Batch complete!' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('1 done')).toBeVisible()
    await expect(page.getByText('1 skipped')).toBeVisible()
  })

  test('cancelling the batch after a parse failure stops the run', async ({ page }) => {
    await page.locator('input[type="file"]').setInputFiles([BROKEN, SAMPLE])
    await page.getByRole('combobox').selectOption({ label: 'French (fr-FR)' })
    await page.getByRole('button', { name: 'Start Batch Translation' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await dialog.getByRole('button', { name: 'Cancel Batch' }).click()

    // The second (valid) file should never have started translating.
    await expect(page.getByText('sample.xlf')).toBeVisible()
    await expect(page.locator('.retro-file-row').filter({ hasText: 'sample.xlf' }).getByRole('paragraph').filter({ hasText: 'queued' })).toBeVisible()
  })

  test('a session persists and restores across a page reload', async ({ page }) => {
    await page.locator('input[type="file"]').setInputFiles([SAMPLE, SAMPLE2])
    await page.getByRole('combobox').selectOption({ label: 'French (fr-FR)' })
    await page.getByRole('button', { name: 'Start Batch Translation' }).click()
    await expect(page.getByRole('heading', { name: 'Batch complete!' })).toBeVisible({ timeout: 20_000 })

    await page.reload()
    await expect(page.getByText('Session restored')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Batch complete!' })).toBeVisible()
  })
})
