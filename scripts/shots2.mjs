// Capture specific below-the-fold sections for review.
import { mkdirSync } from 'node:fs'
import { SHOTS as OUT, siteUrl, launchBrowser } from './_paths.mjs'

const url = siteUrl()
mkdirSync(OUT, { recursive: true })

const shots = [
  ['flow', '#/layer/spine', '.flow'],
  ['pipeline', '#/layer/tools', '.mech'],
  ['svcpage', '#/svc/shell', '#content'],
  ['pkgpage', '#/pkg/core/agent-loop', '#content'],
  ['events2', '#/events', '#content'],
  ['toolspage', '#/tools', '#content'],
]

const browser = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })

for (const [name, hash, sel] of shots) {
  await page.goto(url + hash, { waitUntil: 'load' })
  await page.waitForTimeout(200)
  const el = await page.$(sel)
  if (el) await el.screenshot({ path: `${OUT}/${name}.png` })
  else console.log(`${name}: selector ${sel} not found`)
}
console.log('done')
await browser.close()
