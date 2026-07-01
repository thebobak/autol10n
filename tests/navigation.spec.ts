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
