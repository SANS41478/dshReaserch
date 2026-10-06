/* 分屏功能的视觉截图：宽屏分屏 / 文件树定位 / 窄屏覆盖 / 全屏模式 */
import { mkdirSync } from 'node:fs'
import { PORT, SHOTS as OUT, launchBrowser } from './_paths.mjs'

mkdirSync(OUT, { recursive: true })

const BASE = `http://127.0.0.1:${PORT}/`
const browser = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 1680, height: 950 } })
const settled = async () => {
  await page.waitForFunction(() => {
    const c = document.getElementById('content')
    return c && !c.querySelector('.loading')
  }, { timeout: 30000 })
  await page.waitForTimeout(400)
}
const shot = (f, o) => page.screenshot({ path: `shots/${f}.png`, ...o })

/* 1. 宽屏分屏：左讲解 + 右源码 */
await page.goto(BASE + '#/pkg/core/agent-loop', { waitUntil: 'domcontentloaded' })
await settled()
await page.locator('a.srclink').first().click()
await page.waitForFunction(() => !!document.querySelector('.pane-ctn .pane-bar'), { timeout: 20000 })
await page.waitForTimeout(600)
await shot('01-split-pkg-code')

/* 2. 从层级页跳到源码某一行（关键源码 → 读全文） */
await page.goto(BASE + '#/layer/spine', { waitUntil: 'domcontentloaded' })
await settled()
const live = page.locator('a.code-live').first()
if (await live.count()) {
  await live.click()
  await page.waitForTimeout(1200)
  await shot('02-split-layer-line')
}

/* 3. 文件树定位（用户报的核心缺陷） */
await page.goto(BASE + '#/pkg/core/tools', { waitUntil: 'domcontentloaded' })
await settled()
const loc = page.locator('a[data-tree]').first()
if (await loc.count()) {
  await loc.click()
  await page.waitForTimeout(1400)
  await shot('03-tree-focused')
}

/* 4. 双标签并存（源码 + 文件树） */
await page.goto(BASE + '#/pkg/shell/shell', { waitUntil: 'domcontentloaded' })
await settled()
await page.locator('a.srclink').first().click()
await page.waitForTimeout(900)
await page.locator('#nav-src a[href="#/files"]').click()
await page.waitForTimeout(1400)
await shot('04-two-tabs')

/* 5. 全屏模式 */
await page.click('#pane-wide')
await page.waitForTimeout(500)
await shot('05-pane-wide')
await page.click('#pane-wide')
await page.waitForTimeout(400)

/* 6. 窄屏：面板为覆盖层，左侧留返回条 */
await page.setViewportSize({ width: 1100, height: 900 })
await page.waitForTimeout(500)
await shot('06-narrow-split')

await page.setViewportSize({ width: 1680, height: 950 })
await page.waitForTimeout(300)

/* 7. 拖动分隔条后的宽度 */
await page.goto(BASE + '#/layer/tools', { waitUntil: 'domcontentloaded' })
await settled()
await page.locator('a.code-live').first().click().catch(() => {})
await page.waitForTimeout(1000)
const box = await page.locator('#pane-split').boundingBox()
if (box) {
  await page.mouse.move(box.x + 3, box.y + 300)
  await page.mouse.down()
  await page.mouse.move(box.x - 260, box.y + 300, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(400)
}
await shot('07-resized')

/* 8. 整页版（仍然可用） */
await page.goto(BASE + '#/code/packages/core/agent-loop/src/agent.ts:296', { waitUntil: 'domcontentloaded' })
await settled()
await page.waitForTimeout(700)
await shot('08-full-page-code')

console.log('screenshots written to shots/')
await browser.close()
