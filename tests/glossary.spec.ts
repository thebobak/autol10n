import { test, expect } from '@playwright/test'
import path from 'path'
import { seedConfig } from './helpers'

const SAMPLE = path.join(__dirname, 'fixtures', 'sample.xlf')

test.describe('glossary', () => {
  test.beforeEach(async ({ page }) => {
    await seedConfig(page)
    await page.goto('/')
  })

  test('manually added terms persist across a reload', async ({ page }) => {
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('button', { name: 'Manage Glossary' }).click()
    const dialog = page.getByRole('dialog')

    await dialog.getByRole('combobox').selectOption({ label: 'Spanish (es-ES)' })
    await dialog.getByRole('button', { name: 'Add Term' }).click()
    await dialog.getByPlaceholder('Source term').fill('Dashboard')
    await dialog.getByPlaceholder('Preferred translation').fill('Panel')
    await dialog.getByRole('button', { name: 'Done' }).click()

    await page.reload()
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('button', { name: 'Manage Glossary' }).click()
    const dialog2 = page.getByRole('dialog')
    await dialog2.getByRole('combobox').selectOption({ label: 'Spanish (es-ES)' })

    await expect(dialog2.getByPlaceholder('Source term')).toHaveValue('Dashboard')
    await expect(dialog2.getByPlaceholder('Preferred translation')).toHaveValue('Panel')
  })

  test('imports terms from a CSV file', async ({ page }) => {
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('button', { name: 'Manage Glossary' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('combobox').selectOption({ label: 'French (fr-FR)' })

    const csvPath = path.join(__dirname, 'fixtures', 'glossary.csv')
    await dialog.locator('input[type="file"][accept=".csv"]').setInputFiles(csvPath)

    await expect(dialog.getByPlaceholder('Source term').first()).toHaveValue('Dashboard')
    await expect(dialog.getByPlaceholder('Preferred translation').first()).toHaveValue('Tableau de bord')
    await expect(dialog.getByPlaceholder('Source term').nth(1)).toHaveValue('Continue')
    await expect(dialog.getByPlaceholder('Preferred translation').nth(1)).toHaveValue('Continuer')
  })

  test('exports terms to a CSV file', async ({ page }) => {
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('button', { name: 'Manage Glossary' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('combobox').selectOption({ label: 'German (de-DE)' })
    await dialog.getByRole('button', { name: 'Add Term' }).click()
    await dialog.getByPlaceholder('Source term').fill('Continue')
    await dialog.getByPlaceholder('Preferred translation').fill('Weiter')

    const downloadPromise = page.waitForEvent('download')
    await dialog.getByRole('button', { name: 'Download CSV' }).click()
    const download = await downloadPromise
    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream!) chunks.push(chunk as Buffer)
    const content = Buffer.concat(chunks).toString('utf-8')

    expect(content).toContain('Source Term,Translation')
    expect(content).toContain('Continue,Weiter')
  })

  test('a matching glossary term is sent with the translation request', async ({ page }) => {
    // Seed the glossary directly — faster and more targeted than driving the
    // UI for a test that's really about the request payload, not the modal.
    await page.evaluate(() => {
      localStorage.setItem(
        'autol10n_glossary',
        JSON.stringify({
          'Spanish (es-ES)': [{ id: '1', sourceTerm: 'course', translation: 'curso' }],
        })
      )
    })

    let sawGlossaryTerm = false
    await page.route('**/api/translate', async (route) => {
      const body = route.request().postDataJSON() as { sourceXml: string; glossaryTerms?: { sourceTerm: string }[] }
      if (body.sourceXml.includes('course') && body.glossaryTerms?.some((t) => t.sourceTerm === 'course')) {
        sawGlossaryTerm = true
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ translation: `[es] ${body.sourceXml}` }),
      })
    })

    await page.locator('input[type="file"]').setInputFiles(SAMPLE)
    await page.getByRole('combobox').selectOption({ label: 'Spanish (es-ES)' })
    await page.getByRole('button', { name: 'Start Translation' }).click()

    await expect(page.getByRole('heading', { name: 'Translation complete!' })).toBeVisible({ timeout: 15_000 })
    expect(sawGlossaryTerm).toBe(true)
  })

  test('a segment missing its glossary translation is flagged as a mismatch in the Review drawer', async ({ page }) => {
    // "course" appears only in the "title" segment of sample.xlf. The mock
    // API deliberately never includes "curso" in any response, so that
    // segment should be the only one flagged.
    await page.evaluate(() => {
      localStorage.setItem(
        'autol10n_glossary',
        JSON.stringify({
          'Spanish (es-ES)': [{ id: '1', sourceTerm: 'course', translation: 'curso' }],
        })
      )
    })

    await page.route('**/api/translate', async (route) => {
      const body = route.request().postDataJSON() as { sourceXml: string }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ translation: `[es] ${body.sourceXml}` }),
      })
    })

    await page.locator('input[type="file"]').setInputFiles(SAMPLE)
    await page.getByRole('combobox').selectOption({ label: 'Spanish (es-ES)' })
    await page.getByRole('button', { name: 'Start Translation' }).click()
    await expect(page.getByRole('heading', { name: 'Translation complete!' })).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: 'Review & Edit Translation' }).click()
    await page.getByRole('button', { name: /^Mismatches/ }).click()

    await expect(page.getByText('Welcome to the course', { exact: true })).toBeVisible()
    await expect(page.getByText('This lesson covers the basics.')).not.toBeVisible()
    await expect(page.getByText('Please continue to the next slide.')).not.toBeVisible()
  })

  test('clearing all local data also wipes the glossary', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem(
        'autol10n_glossary',
        JSON.stringify({ 'Spanish (es-ES)': [{ id: '1', sourceTerm: 'a', translation: 'b' }] })
      )
    })
    await page.reload()

    await page.getByRole('button', { name: 'Settings' }).click()
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Clear All Local Data' }).click()
    await page.waitForLoadState('load')

    const remaining = await page.evaluate(() => localStorage.getItem('autol10n_glossary'))
    expect(remaining).toBeNull()
  })
})
