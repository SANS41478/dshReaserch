// Functional test: click-through traceability + search, starting from a dep-rich page.
import { chromium } from 'playwright'
import { pathToFileURL } from 'node:url'

const url = pathToFileURL('D:/临时/dsh研究/index.html').href
const OUT = 'D:/临时/dsh研究/.shots'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`) })
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`))

const h1 = () => page.evaluate(() => document.querySelector('#content h1')?.textContent?.trim() || '(none)')
const go = async h => { await page.evaluate(x => { location.hash = x }, h); await page.waitForTimeout(300) }
const clickFirst = async sel => {
  const el = await page.$(sel)
  if (!el) return null
  const href = await el.getAttribute('href')
  await el.click(); await page.waitForTimeout(320)
  return href
}

const chain = []

// Start on the seam layer (rich in package/service links)
await page.goto(url + '#/layer/seam', { waitUntil: 'load' })
await page.waitForTimeout(300)
chain.push(['start', await h1()])

let href = await clickFirst('#content a[href^="#/pkg/"]')
chain.push(['click pkg', href, await h1()])

href = await clickFirst('#content a[href^="#/svc/"]')
chain.push(['click svc', href, await h1()])

href = await clickFirst('#content a[href^="#/pkg/"]')
chain.push(['click provider pkg', href, await h1()])

href = await clickFirst('#content a[href^="#/pkg/"]')
chain.push(['click dep from pkg', href, await h1()])

for (const c of chain) console.log(c.map(x => String(x).padEnd(28)).join(' '))

// service page: verify three-role sections exist
await go('#/svc/subagents')
const svcSections = await page.evaluate(() => {
  const hs = [...document.querySelectorAll('#content h2')].map(e => e.textContent.trim())
  return hs
})
console.log('\nctx.subagents sections:', JSON.stringify(svcSections))

// tools page: verify every tool links to a package
await go('#/tools')
const toolStats = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#content tbody tr')]
  const withLink = rows.filter(r => r.querySelector('a[href^="#/pkg/"]')).length
  return { rows: rows.length, withLink }
})
console.log('tools rows:', JSON.stringify(toolStats))

// seams page: count service cards and check they all have a definer link
await go('#/seams')
const seamStats = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('#content .svc')]
  return { cards: cards.length, withDefiner: cards.filter(c => c.textContent.includes('定义于')).length }
})
console.log('seam cards:', JSON.stringify(seamStats))

// search
await page.goto(url + '#/', { waitUntil: 'load' })
await page.waitForTimeout(250)
await page.fill('#search', 'agent-loop')
await page.waitForTimeout(350)
const s1 = await page.evaluate(() => {
  const r = document.getElementById('search-results')
  return r ? { hidden: r.hidden, n: r.querySelectorAll('a').length, first: r.querySelector('a')?.textContent?.trim().slice(0, 60) } : null
})
console.log('search "agent-loop":', JSON.stringify(s1))
await page.screenshot({ path: `${OUT}/search.png` })

await page.fill('#search', 'shell')
await page.waitForTimeout(350)
const s2 = await page.evaluate(() => {
  const r = document.getElementById('search-results')
  return r ? [...r.querySelectorAll('a')].slice(0, 8).map(a => a.textContent.trim().slice(0, 48)) : null
})
console.log('search "shell":', JSON.stringify(s2, null, 1))

console.log('\n--- errors ---')
console.log(errors.length ? errors.join('\n') : 'none')
await browser.close()
