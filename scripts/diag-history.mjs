// Diagnose history-back behaviour in isolation.
import { chromium } from 'playwright'
import { pathToFileURL } from 'node:url'

const url = pathToFileURL('D:/临时/dsh研究/index.html').href
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`) })
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`))

const snap = async tag => {
  const s = await page.evaluate(() => ({
    hash: location.hash,
    h1: document.querySelector('#content h1')?.textContent?.trim() || '(none)',
    len: document.getElementById('content')?.innerHTML.length,
    hasSearch: !!document.getElementById('search'),
    hasSidebar: !!document.getElementById('sidebar'),
    bodyChildren: document.body.children.length,
  }))
  console.log(tag, JSON.stringify(s))
}

await page.goto(url + '#/', { waitUntil: 'load' })
await page.waitForTimeout(250)
await snap('start      ')

// navigate via hash assignment (like clicking a link)
await page.evaluate(() => { location.hash = '#/layer/cordis' })
await page.waitForTimeout(300)
await snap('-> cordis  ')

await page.evaluate(() => { location.hash = '#/map' })
await page.waitForTimeout(300)
await snap('-> map     ')

await page.goBack()
await page.waitForTimeout(350)
await snap('back 1     ')

await page.goBack()
await page.waitForTimeout(350)
await snap('back 2     ')

await page.goBack()
await page.waitForTimeout(350)
await snap('back 3     ')

await page.goForward()
await page.waitForTimeout(350)
await snap('forward 1  ')

console.log('\nerrors:', errors.length ? errors.join('\n') : 'none')
await browser.close()
