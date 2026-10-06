import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { SHOTS as OUT, siteUrl, launchBrowser } from './_paths.mjs'

mkdirSync(OUT, { recursive: true })

const url = siteUrl()
const b = await launchBrowser()
const p = await b.newPage({ viewport: { width: 1500, height: 900 } })
await p.goto(url + '#/events', { waitUntil: 'load' })
await p.waitForTimeout(250)
await p.screenshot({ path: join(OUT, 'events_top.png') })
// scroll to the waterfall section
await p.evaluate(() => document.querySelector('#events-waterfall')?.scrollIntoView())
await p.waitForTimeout(200)
await p.screenshot({ path: join(OUT, 'events_wf.png') })
await b.close()
console.log('ok')
