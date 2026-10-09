import { test, expect, expectAccessible, expectNoSidewaysScroll, smallTapTargets } from './fixtures.js'

test.describe('login', () => {
  test.beforeEach(({ world }) => {
    world.signedIn = false
  })

  test('shows the error when the password is wrong', async ({ page, world, go, allowConsole }) => {
    world.loginError = 'Invalid login credentials'
    allowConsole.push(/status of 400/)
    await go('login.html')
    const form = page.locator('#loginForm')
    await form.getByLabel('Email').fill('sam@example.test')
    await form.getByLabel('Password').fill('wrong-password')
    await form.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByRole('status')).toHaveText('Invalid login credentials')
    await expect(form.getByRole('button', { name: 'Log in' })).toBeEnabled()
    await expect(page).toHaveURL(/login\.html$/)
    await expectAccessible(page)
  })

  test('sign up tells you to confirm your email when needed', async ({ page, world, go }) => {
    world.signupNeedsConfirm = true
    await go('login.html')
    await page.getByRole('tab', { name: 'Sign up' }).click()
    await expect(page.getByRole('tab', { name: 'Sign up' })).toHaveAttribute('aria-selected', 'true')
    const form = page.locator('#signupForm')
    await expectAccessible(page)
    await form.getByLabel('Your name').fill('Sam')
    await form.getByLabel('Email').fill('sam@example.test')
    await form.getByLabel('Password').fill('long-enough')
    await form.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByRole('status')).toHaveText('Check your email to confirm your account, then log in.')
  })

  test('signed-out visitors are sent to login from every page', async ({ page, go }) => {
    for (const path of ['index.html', 'playground.html', 'profile.html']) {
      await go(path)
      await expect(page).toHaveURL(/login\.html$/)
    }
  })
})

test.describe('home', () => {
  test('unpaired: shows your invite code instead of a partner', async ({ page, world, go }) => {
    world.partner = null
    await go('index.html')
    await expect(page.getByRole('heading', { name: 'Waiting for your person' })).toBeVisible()
    await expect(page.locator('#inviteCode')).toHaveText('K7Q2ZP')
    await expect(page.locator('#partnerCard')).toBeHidden()
    await expect(page.locator('#namesHeading')).toHaveText('Sam&...')
    await expectAccessible(page)
  })

  test('first visit plays the intro, then the page appears', async ({ page, world, go }) => {
    world.introSeen = false
    await go('index.html')
    await expect(page.locator('#intro-overlay')).toBeVisible()
    await expect(page.locator('#namesHeading')).toHaveText('Sam&Riley')
    await expect(page.locator('#intro-overlay')).toHaveCount(0, { timeout: 8000 })
    await expect(page.locator('#partnerNote')).not.toBeEmpty()
  })

  test('empty gallery shows only the add button', async ({ page, world, go }) => {
    world.files = []
    await go('index.html')
    await expect(page.getByRole('button', { name: 'Add a photo' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open this memory' })).toHaveCount(0)
    await expect(page.locator('#galleryHint')).toBeEmpty()
  })

  test('a failed gallery load says so', async ({ page, world, go, allowConsole }) => {
    world.fail.galleryList = true
    allowConsole.push(/status of 500/)
    await go('index.html')
    await expect(page.locator('#galleryHint')).toHaveText("Couldn't load our photos. Try refreshing?")
  })

  test('uploads a photo, and refuses files that are not images', async ({ page, go }) => {
    await go('index.html')
    await expect(page.getByRole('button', { name: 'Open this memory' })).toHaveCount(2)
    const input = page.locator('#photoInput')
    await input.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') })
    await expect(page.locator('#galleryHint')).toHaveText("That doesn't look like a photo. Try a different file.")
    await input.setInputFiles({ name: 'us.png', mimeType: 'image/png', buffer: Buffer.from('fake-png') })
    await expect(page.locator('#galleryHint')).toHaveText('Added to our photos.')
    await expect(page.getByRole('button', { name: 'Open this memory' })).toHaveCount(3)
  })

  test('deleting a photo takes two taps', async ({ page, world, go }) => {
    await go('index.html')
    const del = page.getByRole('button', { name: 'Delete this memory' }).first()
    await del.click()
    await expect(del).toHaveText('delete?')
    expect(world.files).toHaveLength(2)
    await del.click()
    await expect(page.locator('#galleryHint')).toHaveText('Memory removed.')
    await expect(page.getByRole('button', { name: 'Open this memory' })).toHaveCount(1)
    expect(world.files).toHaveLength(1)
  })

  test('editing the date: failure keeps the old date, success updates it', async ({ page, world, go, allowConsole }) => {
    allowConsole.push(/status of 500/)
    world.fail.saveDate = true
    await go('index.html')
    await page.getByRole('button', { name: 'Edit our date' }).click()
    await expect(page.getByLabel('The day you got together')).toHaveValue('2025-02-14')
    expect(await smallTapTargets(page)).toEqual([])
    await page.getByLabel('The day you got together').fill('2025-01-01')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('alert')).toHaveText("Couldn't save that date. Try again?")
    expect(world.pair.since_date).toBe('2025-02-14')

    world.fail.saveDate = false
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.locator('#sinceDate')).toContainText('2025')
    await expect(page.locator('#dateEditRow')).toBeHidden()
    expect(world.pair.since_date).toBe('2025-01-01')
  })
})

test.describe('profile', () => {
  test('unpaired: a bad invite code shows the reason', async ({ page, world, go, allowConsole }) => {
    world.partner = null
    world.joinResult = { error: 'That code does not match anyone.' }
    allowConsole.push(/status of 400/)
    await go('profile.html')
    await expect(page.locator('#helloSub')).toHaveText('Not paired yet')
    await expect(page.locator('#inviteCode')).toHaveText('K7Q2ZP')
    await expectAccessible(page)
    const join = page.getByRole('button', { name: 'Join' })
    await expect(join).toBeDisabled()
    await page.locator('#joinCode').fill('ZZZZZZ')
    await join.click()
    await expect(page.locator('#joinMsg')).toHaveText('That code does not match anyone.')
  })

  test('unpaired: a good code asks before joining, and warns about your photos', async ({ page, world, go }) => {
    world.partner = null
    await go('profile.html')
    await page.locator('#joinCode').fill('ABC123')
    await page.getByRole('button', { name: 'Join' }).click()
    const dialog = page.getByRole('dialog', { name: 'Join Jordan?' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('The 2 photos in your own gallery will be deleted.')
    await expectAccessible(page)
    expect(await smallTapTargets(page)).toEqual([])
    await dialog.getByRole('button', { name: 'Never mind' }).click()
    await expect(dialog).toBeHidden()
    expect(world.files).toHaveLength(2)
  })

  test('deleting the account needs the word typed first', async ({ page, go }) => {
    await go('profile.html')
    await page.getByRole('button', { name: 'Delete account' }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete your account?' })
    await expect(dialog).toContainText('Riley keeps your shared date and photos.')
    const go2 = dialog.getByRole('button', { name: 'Delete forever' })
    await expect(go2).toBeDisabled()
    await dialog.getByLabel('Type "delete" to confirm').fill('delete')
    await expect(go2).toBeEnabled()
    await expectAccessible(page)
    await go2.click()
    await expect(page).toHaveURL(/login\.html$/)
  })

  test('renaming: a failed save says so, then a retry works', async ({ page, world, go, allowConsole }) => {
    allowConsole.push(/status of 500/)
    world.fail.saveName = true
    await go('profile.html')
    const input = page.getByLabel('Display name')
    await input.fill('Sammy')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.locator('#nameMsg')).toHaveText("Couldn't save that name. Try again?")
    world.fail.saveName = false
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.locator('#nameMsg')).toHaveText('Saved.')
    await expect(page.locator('#helloName')).toHaveText('Sammy')
  })
})

test.describe('small phone (375px)', () => {
  test.use({ viewport: { width: 375, height: 740 } })
  test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== 'phone', 'phone-only check'))

  for (const [path, ready] of [
    ['login.html', '#loginForm'],
    ['index.html', '.photo-open'],
    ['playground.html', '#faceWanderer'],
    ['profile.html', '#pairedView'],
  ]) {
    test(`${path}: nothing scrolls sideways and every control is a 44px target`, async ({ page, world, go }) => {
      if (path === 'login.html') world.signedIn = false
      await go(path)
      await expect(page.locator(ready).first()).toBeVisible()
      await expectNoSidewaysScroll(page)
      expect(await smallTapTargets(page)).toEqual([])
    })
  }
})
