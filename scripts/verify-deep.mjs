// 精读解读页回归：抽样包页断言（章节齐全/带读表/通俗复述/角标）+ 带读链接点击开分屏 + 控制台零报错。
// 用法：先起服务（node server.mjs），再 NODE_PATH=托管workspace node scripts/verify-deep.mjs
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/admin/.workbuddy/binaries/node/workspace/node_modules/playwright/index.js')

const BASE = 'http://127.0.0.1:5319'
const SITE = 'D:/临时/dsh研究'

// 等服务就绪
async function waitServer() {
  for (let i = 0; i < 30; i++) {
    try { const r = await fetch(BASE + '/'); if (r.ok) return } catch {}
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error('server not reachable at ' + BASE)
}

const server = spawn(process.execPath, [`${SITE}/server.mjs`], { stdio: 'ignore' })
process.on('exit', () => server.kill())
try { await waitServer() } catch { console.error('服务起不来（可能端口被旧进程占用）'); process.exit(1) }

// 抽样：跨批次的代表性包（大/小/数据包/纯前端/lib-only）
const SAMPLES = [
  ['core/agent', '脊柱接口包'],
  ['core/agent-loop', '循环包'],
  ['shell/tool-bash', '薄工具包'],
  ['client/ui-dockkit', '前端大包'],
  ['experimental/inspector', '实验巨包'],
  ['util/brand', '零依赖小包'],
  ['bundle/base', '数据补丁包'],
  ['session/session-format-v0-to-v1', '迁移包'],
  ['acp/acp', '服务出口'],
  ['api/session-controller', '最大控制器'],
]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(`[console] ${m.text().slice(0, 160)}`) })
page.on('pageerror', e => errors.push(`[pageerror] ${e.message.slice(0, 160)}`))

let fails = 0
const fail = m => { fails++; console.log('  ✗ ' + m) }
const ok = m => console.log('  ✓ ' + m)

console.log('== 抽样包页章节断言 ==')
for (const [path, label] of SAMPLES) {
  await page.goto(`${BASE}/#/pkg/${path}`, { waitUntil: 'load' })
  await page.waitForFunction(() => document.getElementById('content')?.innerHTML.length > 500, null, { timeout: 15000 })
    .catch(() => {})
  const r = await page.evaluate(() => {
    const c = document.getElementById('content')
    const txt = c?.textContent || ''
    return {
      why: txt.includes('为什么必须有它'),
      pos: txt.includes('在系统里的位置'),
      inside: txt.includes('内部结构'),
      boundary: txt.includes('职责边界'),
      tour: c?.querySelectorAll('table.tour tbody tr').length || 0,
      analogy: !!c?.querySelector('.analogy'),
      badge: txt.includes('已逐包精读'),
      summaryDetails: !!c?.querySelector('details.official-summary'),
      overflow: c ? c.scrollWidth > c.clientWidth + 4 : false,
      h1: c?.querySelector('h1')?.textContent?.trim(),
    }
  })
  const name = r.h1 || path
  if (!r.why) fail(`${path} 缺「为什么必须有它」`)
  if (!r.pos) fail(`${path} 缺「在系统里的位置」`)
  if (!r.inside) fail(`${path} 缺「内部结构」`)
  if (!r.boundary) fail(`${path} 缺「职责边界」`)
  if (r.tour < 3) fail(`${path} 源码带读只有 ${r.tour} 条`)
  if (!r.analogy) fail(`${path} 缺通俗复述`)
  if (!r.badge) fail(`${path} 缺「已逐包精读」角标`)
  if (!r.summaryDetails) fail(`${path} 缺官方摘要折叠块`)
  if (r.overflow) fail(`${path} 横向溢出`)
  if (fails === 0 || !fails) ok(`${path}（${label}）— 章节齐全，带读 ${r.tour} 条`)
  else ok(`${path}（${label}）— 见上方问题`)
}

console.log('== 带读链接点击 → 右栏分屏 ==')
await page.goto(`${BASE}/#/pkg/core/agent`, { waitUntil: 'load' })
await page.waitForFunction(() => document.getElementById('content')?.querySelectorAll('table.tour tbody tr').length > 0, null, { timeout: 15000 })
const before = await page.evaluate(() => document.getElementById('content').innerHTML.length)
await page.click('table.tour tbody tr:first-child a.srclink')
await page.waitForFunction(() => {
  const p = document.getElementById('pane')
  return p && p.querySelector('.src-view, .code-view, [class*="src"]') && p.innerHTML.length > 1000
}, null, { timeout: 20000 }).catch(() => {})
const after = await page.evaluate(() => document.getElementById('content').innerHTML.length)
const paneLen = await page.evaluate(() => document.getElementById('pane')?.innerHTML.length || 0)
if (Math.abs(before - after) < 80) ok(`左栏讲解未被动（${before} → ${after} 字符）`)
else fail(`左栏被替换了（${before} → ${after}）`)
if (paneLen > 1000) ok(`右栏分屏打开了源码（${paneLen} 字符）`)
else fail('右栏分屏没打开')

console.log('== 全量 265 包页渲染零报错扫查 ==')
const deep = await (await fetch(BASE + '/data/bundle.js')).text()
const keys = [...deep.matchAll(/"(group)":"([^"]+)","dir":"([^"]+)"/g)].map(m => `${m[2]}/${m[3]}`)
let scanned = 0
for (const k of keys) {
  await page.goto(`${BASE}/#/pkg/${k}`, { waitUntil: 'load' })
  await page.waitForTimeout(40)
  scanned++
  if (errors.length) break
}
console.log(`  扫了 ${scanned} 个包页，控制台错误 ${errors.length} 条`)
if (errors.length) { fails++; errors.slice(0, 5).forEach(e => console.log('  ✗ ' + e)) }

await browser.close()
console.log(fails ? `\n❌ ${fails} 项失败` : '\n✅ 精读页回归全部通过')
process.exit(fails ? 1 : 0)
