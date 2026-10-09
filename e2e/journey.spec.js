import { test, expect, expectAccessible, expectNoSidewaysScroll } from './fixtures.js'

// The main journey: sign in, set a mood, see your partner, open a photo,
// visit the playground and the profile, log out.
test('signs in and walks through every screen', async ({ page, world, go }) => {
  world.signedIn = false
  await go('login.html')
  await expect(page.getByRole('heading', { name: 'twogether' })).toBeVisible()
  await expectAccessible(page)

  await page.locator('#loginForm').getByLabel('Email').fill('sam@example.test')
  await page.locator('#loginForm').getByLabel('Password').fill('not-a-real-password')
  await page.getByRole('button', { name: 'Log in' }).click()

  // Home: names, day counter, partner's mood, gallery.
  await expect(page).toHaveURL(/index\.html$/)
  await expect(page.locator('#namesHeading')).toHaveText('Sam&Riley')
  await expect(page.locator('#badge')).toContainText(/^Day [\d,]+ together$/)
  await expect(page.getByRole('heading', { name: 'How Riley feels' })).toBeVisible()
  await expect(page.locator('#partnerNote')).toHaveText('Riley is sleepy. Let them drift off.')
  await expect(page.getByRole('button', { name: 'Open this memory' })).toHaveCount(2)
  await expectNoSidewaysScroll(page)
  await expectAccessible(page)

  // Picking a mood updates the page and saves it.
  await expect(page.getByRole('button', { name: 'Happy' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Excited' }).click()
  await expect(page.getByRole('button', { name: 'Excited' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('body')).toHaveClass('mood-excited')
  await expect(page.locator('#bubbleText')).not.toBeEmpty()
  await expect.poll(() => world.moods['user-me']).toBe('excited')

  // A photo opens in the lightbox and closes again.
  const firstPhoto = page.getByRole('button', { name: 'Open this memory' }).first()
  await firstPhoto.click()
  const lightbox = page.getByRole('dialog', { name: 'Photo' })
  await expect(lightbox).toBeVisible()
  await expect(page.getByRole('button', { name: 'Close' })).toBeFocused()
  await expectAccessible(page, '#lightbox')
  await page.keyboard.press('Escape')
  await expect(lightbox).toBeHidden()
  await expect(firstPhoto).toBeFocused()

  // Playground reflects the partner.
  await page.getByRole('link', { name: 'Playground' }).first().click()
  await expect(page).toHaveURL(/playground\.html$/)
  await expect(page.locator('#hint')).toContainText('Riley')
  await expect(page.locator('body')).toHaveClass('mood-sleepy')
  await expectNoSidewaysScroll(page)
  await expectAccessible(page)

  // Profile shows the pairing and lets you log out.
  await page.getByRole('link', { name: 'Profile' }).first().click()
  await expect(page.locator('#helloName')).toHaveText('Sam')
  await expect(page.locator('#helloSub')).toHaveText('Paired with Riley')
  await expect(page.locator('#partnerName')).toHaveText('Riley')
  await expectNoSidewaysScroll(page)
  await expectAccessible(page)

  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page).toHaveURL(/login\.html$/)
})
