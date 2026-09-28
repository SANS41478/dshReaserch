// Capture a page scrolled to a given anchor/heading, for below-the-fold review.
import { chromium } from 'playwright'
import { pathToFileURL } from 'node:url'

const url = pathToFileURL('D:/临时/dsh研究/index.html').href
const OUT = 'D:/临时/dsh研究/.shots'

// [name, hash, heading-text-to-scroll-to (or null = full page)]
const shots = [
  ['composition-2', '#/composition', '五个内置 bundle'],
  ['composition-3', '#/composition', '叠加顺序'],
  ['spine-code', '#/layer/spine', '关键源码'],
  ['tools-code', '#/layer/tools', '关键源码'],
  ['seam-pipeline', '#/layer/tools', '九段管道'],
  ['composition-layers', '#/composition', '叠加顺序（重要）'],
]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })

for (const [name, hash, heading] of shots) {
  await page.goto(url + hash, { waitUntil: 'load' })
  await page.waitForTimeout(250)
  if (heading) {
    const ok = await page.evaluate(h => {
      const els = [...document.querySelectorAll('h2,h3')]
      const t = els.find(e => e.textContent.includes(h))
      if (!t) return false
      t.scrollIntoView({ block: 'start' })
      return true
    }, heading)
    if (!ok) { console.log(`${name}: heading "${heading}" not found`); }
    await page.waitForTimeout(250)
  }
  await page.screenshot({ path: `${OUT}/${name}.png` })
}
console.log('done')
await browser.close()
