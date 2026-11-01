/* ============================================================
   分屏功能的端到端验证
   ------------------------------------------------------------
   验证的是「用户报的两个问题被真正修好了」，不是「页面能打开」：
     A. 点「在文件树里定位」→ 右栏展开完整路径 + 滚动到位 + 高亮闪烁
     B. 源码/文件树不再替换左侧页面，左右同时可见
     C. 双向链接：右侧溯源点回左侧概念页，面板保持
   跑法：node scripts/verify-split.mjs
   ============================================================ */

import { PORT, launchBrowser } from './_paths.mjs'

const BASE = `http://127.0.0.1:${PORT}/`

let pass = 0
let fail = 0
const log = (ok, name, extra = '') => {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${extra ? '  — ' + extra : ''}`)
  ok ? pass++ : fail++
}
const sec = t => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 56 - t.length))}`)

const browser = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 1680, height: 950 } })

const errors = []
page.on('pageerror', e => errors.push('pageerror: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

const settled = async () => {
  await page.waitForFunction(() => {
    const c = document.getElementById('content')
    return c && !c.querySelector('.loading')
  }, { timeout: 30000 })
}
const goto = async h => {
  await page.goto(BASE + h, { waitUntil: 'domcontentloaded' })
  await settled()
  await page.waitForTimeout(320)
}

/* ============================================================ */
sec('1. 分屏唤起：从包页点「读源码」')

await goto('#/pkg/core/agent')
const beforeContent = await page.evaluate(() => document.getElementById('content').innerHTML.length)
log(true, '包页加载', `content ${beforeContent} 字符`)

const linkCount = await page.locator('a.srclink').count()
log(linkCount >= 2, '包页有「读源码 / 在文件树里定位」入口', `${linkCount} 个`)

await page.locator('a.srclink').first().click()
await page.waitForSelector('#app.pane-open #pane', { timeout: 10000 })
await page.waitForFunction(() => !!document.querySelector('.pane-ctn .pane-bar'), { timeout: 20000 })
const afterContent = await page.evaluate(() => document.getElementById('content').innerHTML.length)
log(Math.abs(afterContent - beforeContent) < 50, '左侧页面内容未被替换', `${beforeContent} → ${afterContent}`)

const hasCrumb = await page.evaluate(() => !!document.querySelector('#content .crumb, #content .hero'))
log(hasCrumb, '左侧仍是包页（面包屑/hero 还在）')

const tabTitle = await page.locator('.ptab.active .ptab-tx').innerText()
log(/\.ts$/.test(tabTitle), '右栏出现源码标签', tabTitle)

/* ============================================================ */
sec('2. 左右同时可见')

const geo = await page.evaluate(() => {
  const c = document.getElementById('content').getBoundingClientRect()
  const p = document.getElementById('pane').getBoundingClientRect()
  const sp = document.getElementById('pane-split').getBoundingClientRect()
  return { cLeft: c.left, cRight: c.right, pLeft: p.left, pRight: p.right, spW: sp.width, vw: innerWidth }
})
log(geo.pLeft >= geo.cRight - 2, '右栏在左栏右侧，不重叠',
  `content right=${geo.cRight.toFixed(0)} pane left=${geo.pLeft.toFixed(0)}`)
log(geo.cLeft >= 0 && geo.pRight <= geo.vw + 1, '两者都在视口内',
  `pane right=${geo.pRight.toFixed(0)} vw=${geo.vw}`)
log(geo.spW >= 4, '分隔手柄可见可拖', `${geo.spW}px`)

/* ============================================================ */
sec('3. 源码视图：行号 + 目标行')

const lineCount = await page.locator('.pane-ctn .pane-scroll .cl').count()
log(lineCount > 200, '源码正文已渲染', `${lineCount} 行`)

const hls = await page.evaluate(() => ({
  k: document.querySelectorAll('.pane-ctn .hl-k').length,
  s: document.querySelectorAll('.pane-ctn .hl-s').length,
  c: document.querySelectorAll('.pane-ctn .hl-c').length,
}))
log(hls.k > 50 && hls.s > 5, '语法高亮生效', `kw=${hls.k} str=${hls.s} cmt=${hls.c}`)

const ctrl = await page.evaluate(() => {
  const t = document.querySelector('.pane-ctn .pane-scroll')?.innerText || ''
  return (t.match(/[\u0001\u0002\u0000]/g) || []).length + (t.match(/&(lt|amp|#39|quot);/g) || []).length
})
log(ctrl === 0, '无控制字符 / 实体残留', `${ctrl} 处`)

/* ============================================================ */
sec('4. 文件树定位（用户报的核心缺陷）')

await page.locator('#nav-src a[href="#/files"]').click()
await page.waitForFunction(() => {
  const t = [...document.querySelectorAll('.ptab')].find(x => x.textContent.includes('文件树'))
  return !!t
}, { timeout: 15000 })
await page.waitForFunction(() => !!document.querySelector('.pane-ctn:not([hidden]) .tree'), { timeout: 20000 })
log(true, '文件树在右栏打开（第二个标签）')

const stillPkg = await page.evaluate(() => !!document.querySelector('#content .hero h1'))
log(stillPkg, '左侧包页仍在（未被文件树替换）')

// 从层级页点「📍」定位按钮
await goto('#/pkg/core/agent')
await page.waitForTimeout(300)
const paneKept = await page.evaluate(() => document.getElementById('app').classList.contains('pane-open'))
log(paneKept, '切到别的架构页后，分屏保持打开')

const locBtn = page.locator('a[data-tree]').first()
const focusTarget = await locBtn.getAttribute('data-tree')
log(!!focusTarget, '定位链接携带目标路径', focusTarget)

await locBtn.click()
await page.waitForTimeout(600)

const focusState = await page.evaluate(() => {
  const host = document.querySelector('.pane-ctn:not([hidden])')
  const node = host?.querySelector('.trow.focus')
  const note = host?.querySelector('.focus-note')
  if (!node) return { found: false }
  const r = node.getBoundingClientRect()
  const sc = host.querySelector('.pane-scroll').getBoundingClientRect()
  return {
    found: true,
    path: node.dataset.file,
    inView: r.top >= sc.top - 4 && r.bottom <= sc.bottom + 4,
    noteText: note?.innerText || '(无)',
    bg: getComputedStyle(node).backgroundColor,
    shadow: getComputedStyle(node).boxShadow,
  }
})
log(focusState.found, '目标节点在树中被定位到', focusState.path || '')
log(focusState.path === focusTarget, '定位路径与请求一致', `${focusTarget} vs ${focusState.path}`)
log(focusState.inView, '目标节点滚动进入可视区')
log(/rgba?\(255,\s*180/.test(focusState.bg), '目标节点有高亮底色', focusState.bg)
log(focusState.shadow !== 'none', '目标节点有左侧标记条', focusState.shadow.slice(0, 46))
log(focusState.noteText.includes('已定位'), '面板显示定位提示条', focusState.noteText.replace(/\n/g, ' '))

const ancestorOpen = await page.evaluate(() => {
  const node = document.querySelector('.pane-ctn:not([hidden]) .trow.focus')
  if (!node) return false
  // 所有祖先 .tkids 都必须没有被收起的父行
  let el = node.parentElement
  while (el) {
    if (el.classList.contains('tnode')) {
      const row = el.querySelector(':scope > .trow')
      if (row && row.classList.contains('trow') && !row.classList.contains('open') &&
          (row.classList.contains('tdir') || row.classList.contains('tgroup-row'))) return false
    }
    el = el.parentElement
  }
  return true
})
log(ancestorOpen, '全部祖先层级已自动展开')

/* ============================================================ */
sec('5. 双向链接：右侧 → 左侧')

// 切回源码标签，用溯源里的包链接回左侧
const tabs = await page.locator('.ptab .ptab-tx').allInnerTexts()
log(tabs.length >= 2, '两个标签并存', tabs.join(' | '))

const codeTab = page.locator('.ptab').filter({ hasText: 'SRC' }).first()
const codeTabExists = await codeTab.count() > 0
if (codeTabExists) {
  await codeTab.click()
  await page.waitForTimeout(250)
  const archLink = page.locator('.pane-ctn:not([hidden]) .pane-trace a[data-arch]').first()
  const n = await archLink.count()
  if (n) {
    await archLink.click()
    await page.waitForTimeout(500)
    const after = await page.evaluate(() => ({
      hash: location.hash,
      pane: document.getElementById('app').classList.contains('pane-open'),
      tabs: document.querySelectorAll('.ptab').length,
    }))
    log(after.pane && after.tabs === 2, '点溯源链接后，右栏分屏保持打开（左侧换页）',
      `${after.hash} · 标签 ${after.tabs} 个`)
  } else {
    log(false, '溯源面板里有指向架构的链接', '未找到 data-arch')
  }
} else {
  log(false, '源码标签存在', tabs.join(' | '))
}

/* ============================================================ */
sec('6. 文案 / 侧栏状态 / 关闭')

const navOn = await page.evaluate(() => {
  const a = document.getElementById('ns-files')
  return { cls: a.className, dot: getComputedStyle(a, '::after').content }
})
log(true, '侧栏入口状态可读', `class="${navOn.cls}"`)

await page.keyboard.press('Escape')
await page.waitForTimeout(320)
const closed = await page.evaluate(() => !document.getElementById('app').classList.contains('pane-open'))
log(closed, 'Esc 收起右栏')

/* ============================================================ */
sec('7. 整页路由仍然可用（直接访问）')

await goto('#/files')
const fullTree = await page.evaluate(() => {
  const t = document.getElementById('tree-host')
  return t ? t.querySelectorAll('.trow').length : 0
})
log(fullTree > 100, '#/files 整页版渲染完整', `${fullTree} 行`)

await goto('#/code/packages/core/agent-loop/src/agent.ts:296')
const fullCode = await page.evaluate(() => {
  const s = document.getElementById('src-host')
  const t = s?.querySelector('.cl.target')
  return { lines: s ? s.querySelectorAll('.cl').length : 0, target: t?.dataset.line || null,
           trace: !!document.querySelector('.trace') }
})
log(fullCode.lines > 500, '#/code 整页版渲染完整', `${fullCode.lines} 行`)
log(fullCode.target === '296', '指定行被标记为 target', `line=${fullCode.target}`)
log(fullCode.trace, '整页版保留右侧溯源面板')

/* 整页里点文件 → 仍然开分屏（不该替换整页） */
await goto('#/files')
await page.locator('#tree-host [data-file]').first().click()
await page.waitForTimeout(700)
const fromFull = await page.evaluate(() => ({
  pane: document.getElementById('app').classList.contains('pane-open'),
  treeStill: !!document.getElementById('tree-host'),
}))
log(fromFull.pane && fromFull.treeStill, '整页树里点文件 → 右栏打开，整页树不动')

/* ============================================================ */
sec('8. 窄屏退化')

await page.setViewportSize({ width: 980, height: 900 })
await page.waitForTimeout(400)
const narrow = await page.evaluate(() => {
  const p = document.getElementById('pane')
  const sp = document.getElementById('pane-split')
  return {
    pos: getComputedStyle(p).position,
    splitHidden: getComputedStyle(sp).display === 'none',
    strip: !!document.querySelector('.pane-strip'),
  }
})
log(narrow.pos === 'fixed', '窄屏下面板改为覆盖层', narrow.pos)
log(narrow.splitHidden, '窄屏下拖动条隐藏')

/* ============================================================ */
sec('9. 控制台')

log(errors.length === 0, '无页面错误 / 控制台报错',
  errors.length ? errors.slice(0, 4).join(' ;; ') : '0')

/* ============================================================ */
console.log(`\n${'='.repeat(62)}`)
console.log(`  结果：${pass} 通过 / ${fail} 失败`)
console.log(`${'='.repeat(62)}\n`)

await browser.close()
process.exit(fail ? 1 : 0)
