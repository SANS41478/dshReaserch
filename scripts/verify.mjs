// Render key pages of the site headlessly and capture screenshots + console errors.
import { chromium } from 'playwright'
import { pathToFileURL } from 'node:url'

const SITE = 'D:/临时/dsh研究/index.html'
const OUT = 'D:/临时/dsh研究/.shots'
const url = pathToFileURL(SITE).href

const ROUTES = [
  ['home', '#/'],
  ['map', '#/map'],
  ['layer-cordis', '#/layer/cordis'],
  ['layer-spine', '#/layer/spine'],
  ['layer-tools', '#/layer/tools'],
  ['layer-seam', '#/layer/seam'],
  ['seams', '#/seams'],
  ['events', '#/events'],
  ['tools', '#/tools'],
  ['composition', '#/composition'],
  ['pkg-agent-loop', '#/pkg/core/agent-loop'],
  ['pkg-shell', '#/pkg/shell/shell'],
  ['svc-shell', '#/svc/shell'],
  ['svc-tools', '#/svc/tools'],
  ['svc-sessions', '#/svc/sessions'],
  ['svc-llm', '#/svc/llm'],
  ['layer-session', '#/layer/session'],
  ['layer-persistence', '#/layer/persistence'],
  ['layer-multiagent', '#/layer/multiagent'],
  ['layer-extensibility', '#/layer/extensibility'],
  ['layer-surface-ui', '#/layer/surface-ui'],
  ['about', '#/about'],
]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })

const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`) })
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`))

for (const [name, hash] of ROUTES) {
  await page.goto(url + hash, { waitUntil: 'load' })
  await page.waitForTimeout(220)
  const info = await page.evaluate(() => {
    const c = document.getElementById('content')
    return {
      len: c ? c.innerHTML.length : 0,
      h1: c?.querySelector('h1')?.textContent?.trim() || '(无 h1)',
      nav: document.querySelectorAll('.nav-item').length,
      overflow: c ? c.scrollWidth > c.clientWidth + 4 : false,
    }
  })
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false })
  console.log(`${name.padEnd(16)} h1="${info.h1}" len=${info.len} navItems=${info.nav}${info.overflow ? ' OVERFLOW!' : ''}`)
}

console.log('\n--- errors ---')
console.log(errors.length ? errors.join('\n') : 'none')
await browser.close()
