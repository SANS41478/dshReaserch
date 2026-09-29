// Verify the source browser: tree, file view, traceability, and click-through.
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/admin/.workbuddy/binaries/node/workspace/node_modules/playwright/index.js')

const BASE = 'http://127.0.0.1:5319/'
const OUT = 'D:/临时/dsh研究/.shots'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`) })
page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`))

const go = async h => {
  await page.goto(BASE + h, { waitUntil: 'load' })
  // 等页面真正渲染完成（源码页要建符号索引，首次可能较慢）
  await page.waitForFunction(() => {
    const c = document.getElementById('content')
    return c && c.innerHTML.length > 200 && !c.querySelector('.loading')
  }, { timeout: 60000 }).catch(() => { })
  await page.waitForTimeout(400)
}
const info = () => page.evaluate(() => ({
  h1: document.querySelector('#content h1')?.textContent?.trim() || '(none)',
  len: document.getElementById('content')?.innerHTML.length || 0,
}))

console.log('=== 1. 离线兜底（用 file:// 打开，服务不可用）===')
const filePage = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
await filePage.goto('file:///D:/%E4%B8%B4%E6%97%B6/dsh%E7%A0%94%E7%A9%B6/index.html#/files', { waitUntil: 'load' })
await filePage.waitForTimeout(800)
console.log('  #/files ->', await filePage.evaluate(() => document.querySelector('#content h1')?.textContent?.trim()))
const offNote = await filePage.evaluate(() => !!document.querySelector('.note.warn'))
console.log('  显示启动指引:', offNote)
await filePage.screenshot({ path: `${OUT}/src-offline.png` })
await filePage.close()

console.log('\n=== 2. 文件树页 ===')
await go('#/files')
console.log(' ', JSON.stringify(await info()))
const treeStats = await page.evaluate(() => ({
  rows: document.querySelectorAll('.trow').length,
  files: document.querySelectorAll('.tfile').length,
  dirs: document.querySelectorAll('.tdir').length,
  groups: document.querySelectorAll('.tgroup-row').length,
}))
console.log('  树节点:', JSON.stringify(treeStats))
await page.screenshot({ path: `${OUT}/src-tree.png` })

console.log('\n=== 3. 源码页（agent.ts 无行号）===')
await go('#/code/packages/core/agent-loop/src/agent.ts')
console.log(' ', JSON.stringify(await info()))
const codeStats = await page.evaluate(() => ({
  lines: document.querySelectorAll('.src-view .cl').length,
  hasTrace: !!document.querySelector('.trace'),
  traceSecs: document.querySelectorAll('.trace .tp-sec').length,
  symbols: document.querySelectorAll('.trace .sym').length,
  injects: document.querySelectorAll('.trace .tp-sec:nth-child(3) .dep').length,
}))
console.log('  代码行/溯源面板:', JSON.stringify(codeStats))
await page.screenshot({ path: `${OUT}/src-code.png`, fullPage: false })

console.log('\n=== 4. 精确行号跳转 agent.ts:296 (turn 方法) ===')
await go('#/code/packages/core/agent-loop/src/agent.ts:296')
const targeted = await page.evaluate(() => {
  const t = document.querySelector('.src-view .cl.target')
  return {
    exists: !!t,
    lineNo: t?.querySelector('.ln')?.textContent,
    text: t?.querySelector('.lt')?.textContent?.slice(0, 70),
  }
})
console.log('  目标行:', JSON.stringify(targeted))
await page.screenshot({ path: `${OUT}/src-line296.png` })

console.log('\n=== 5. 溯源面板：点击符号跳转 ===')
const symLink = await page.$('.trace .sym[href*=":547"]')
console.log('  prepareRequest 符号链接:', symLink ? await symLink.getAttribute('href') : 'NOT FOUND')
if (symLink) {
  await symLink.click(); await page.waitForTimeout(700)
  const now = await page.evaluate(() => document.querySelector('.src-view .cl.target')?.querySelector('.ln')?.textContent)
  console.log('  跳转后目标行:', now)
  console.log('  当前 hash:', await page.evaluate(() => location.hash))
}

console.log('\n=== 6. 双向溯源：包页 -> 源码（分屏版）===')
/* 分屏改造后，左侧页面的源码链接不再替换整页，而是开在右栏。
   分屏本身的完整回归见 scripts/verify-split.mjs。 */
await go('#/pkg/shell/shell')
const pkgSrcLink = await page.$('#content .srclink')
console.log('  包页源码链接:', pkgSrcLink ? await pkgSrcLink.getAttribute('href') : 'NOT FOUND')
await page.screenshot({ path: `${OUT}/src-pkgentry.png` })
if (pkgSrcLink) {
  await pkgSrcLink.click()
  await page.waitForFunction(() => !!document.querySelector('.pane-ctn .pane-bar'), { timeout: 20000 })
  const r = await page.evaluate(() => ({
    pane: document.getElementById('app').classList.contains('pane-open'),
    leftPage: document.querySelector('#content .hero h1')?.textContent?.trim(),
    tab: document.querySelector('.ptab.active .ptab-tx')?.textContent?.trim(),
  }))
  console.log('  点进去 ->', JSON.stringify(r))
}

console.log('\n=== 7. 双向溯源：服务页 -> 定义处源码 ===')
await go('#/svc/shell')
const svcSrcLink = await page.$('#content .srclink')
console.log('  服务页定义处链接:', svcSrcLink ? await svcSrcLink.getAttribute('href') : 'NOT FOUND')
await page.screenshot({ path: `${OUT}/src-svcentry.png` })

console.log('\n=== 8. 分层页 -> 读全文（分屏版，需落到目标行）===')
await go('#/layer/spine')
const liveLink = await page.$('#content .code-live')
console.log('  读全文链接:', liveLink ? await liveLink.getAttribute('href') : 'NOT FOUND')
if (liveLink) {
  await liveLink.click()
  await page.waitForFunction(() => !!document.querySelector('.pane-ctn .pane-bar'), { timeout: 20000 })
  await page.waitForTimeout(900)
  const r = await page.evaluate(() => ({
    pane: document.getElementById('app').classList.contains('pane-open'),
    leftPage: document.querySelector('#content h1')?.textContent?.trim(),
    target: document.querySelector('.pane-ctn:not([hidden]) .cl.target')?.dataset.line,
  }))
  console.log('  点进去 ->', JSON.stringify(r))
  await page.screenshot({ path: `${OUT}/src-fromlayer.png` })
}

console.log('\n=== 9. 溢出检查 ===')
for (const h of ['#/files', '#/code/packages/core/agent-loop/src/agent.ts', '#/code/packages/core/tools/src/index.ts']) {
  await go(h)
  const ov = await page.evaluate(() => {
    const c = document.getElementById('content')
    const v = document.querySelector('.src-view')
    return { content: c.scrollWidth > c.clientWidth + 4, viewer: v ? v.scrollWidth > v.clientWidth + 4 : null }
  })
  console.log(`  ${h} 横向溢出:`, JSON.stringify(ov))
}

console.log('\n--- errors ---')
console.log(errors.length ? errors.join('\n') : 'none')
await browser.close()
