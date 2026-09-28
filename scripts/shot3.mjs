import { chromium } from 'playwright'
import { pathToFileURL } from 'node:url'
const url = pathToFileURL('D:/临时/dsh研究/index.html').href
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1500, height: 900 } })
await p.goto(url + '#/events', { waitUntil: 'load' })
await p.waitForTimeout(250)
await p.screenshot({ path: 'D:/临时/dsh研究/.shots/events_top.png' })
// scroll to the waterfall section
await p.evaluate(() => document.querySelector('#events-waterfall')?.scrollIntoView())
await p.waitForTimeout(200)
await p.screenshot({ path: 'D:/临时/dsh研究/.shots/events_wf.png' })
await b.close()
console.log('ok')
