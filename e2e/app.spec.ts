import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let electronApp: ElectronApplication
let page: Page

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: [path.join(__dirname, '../dist-electron/main.js')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  })

  page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await electronApp.close()
})

test.describe('Application Launch', () => {
  test('window has correct title', async () => {
    const title = await page.title()
    expect(title).toContain('ECTEVEAssets')
  })

  test('shows login screen when not authenticated', async () => {
    await expect(page.getByText('ECT EVE Assets')).toBeVisible()
    await expect(page.getByText('We Like The Data')).toBeVisible()
  })

  test('has EVE SSO login button', async () => {
    const loginButton = page.getByRole('button').filter({ has: page.getByAltText('Log in with EVE Online') })
    await expect(loginButton).toBeVisible()
  })

  test('shows info text about SSO requirement', async () => {
    await expect(page.getByText(/requires EVE SSO authentication/)).toBeVisible()
  })
})

test.describe('Login Screen UI', () => {
  test('login button is enabled initially', async () => {
    const loginButton = page.getByRole('button').filter({ has: page.getByAltText('Log in with EVE Online') })
    await expect(loginButton).toBeEnabled()
  })

  test('no error message shown initially', async () => {
    const errorDiv = page.locator('.border-red-500\\/50')
    await expect(errorDiv).not.toBeVisible()
  })
})
