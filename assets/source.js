/* ============================================================
   源码浏览器 —— 前端模块

   两个使用场景，共用同一套渲染：
     ① 右栏侧边面板（推荐）：架构讲解在左，源码在右，互不打断
     ② 整页路由 #/code、#/files（宽屏外打开、或直接在分屏里看）

   依赖 server.mjs 提供的 /api/*。若服务不可用，整块功能优雅降级。
   ============================================================ */

const SRC = {
  online: false,
  repo: '',
  tree: null,
  expanded: new Set(),
  traceCache: new Map(),

  /* ---- 右栏面板状态 ---- */
  pane: false,                             // 是否展开
  paneWide: false,                         // 全屏（只看源码）
  paneW: 0,                                // 宽度（0 = 用 CSS 默认）
  tabs: [],                                // [{ cid, type:'code'|'tree', title, path, line }]
  active: null,                            // 当前 cid
  seq: 0,                                  // cid 自增
  pending: null,                           // 面板打开后要滚到 / 高亮的目标
  focusPath: null,                         // 文件树当前定位到的路径
  focusLine: null,
  selFile: null,                           // 文件树中被点开的文件
  mounted: new Map(),                      // cid → 已构建的 DOM 容器
}

/* ---------- API ---------- */
async function api(path) {
  const r = await fetch('/api' + path)
  if (!r.ok) throw new Error(r.status + ' ' + path)
  return r.json()
}

async function probeServer() {
  try {
    let m
    try { m = await api('/ping') }
    catch { m = await api('/meta') }
    SRC.online = !!m.exists
    SRC.repo = m.repo
    if (m.tree) SRC.tree = m.tree
    return SRC.online
  } catch {
    SRC.online = false
    return false
  }
}

/** 文件树按需加载：探活只拿仓库状态，不把 1.7MB 树塞进每次打开源码 */
async function loadTree() {
  if (SRC.tree) return SRC.tree
  SRC.tree = await api('/tree')
  return SRC.tree
}

/* ---------- 文件类型 → 图标/颜色 ---------- */
const EXT_META = {
  ts: { ico: 'TS', cls: 'ts' }, tsx: { ico: 'TX', cls: 'tsx' },
  mts: { ico: 'TS', cls: 'ts' }, js: { ico: 'JS', cls: 'js' },
  mjs: { ico: 'JS', cls: 'js' }, cjs: { ico: 'JS', cls: 'js' },
  json: { ico: '{}', cls: 'json' }, yaml: { ico: 'YM', cls: 'yaml' }, yml: { ico: 'YM', cls: 'yaml' },
  md: { ico: 'MD', cls: 'md' }, css: { ico: 'CS', cls: 'css' },
  html: { ico: '<>', cls: 'html' }, py: { ico: 'PY', cls: 'py' },
  sh: { ico: 'SH', cls: 'sh' }, ps1: { ico: 'PS', cls: 'sh' },
  toml: { ico: 'TM', cls: 'yaml' }, txt: { ico: '##', cls: 'md' },
}
const extOf = n => (n.split('.').pop() || '').toLowerCase()
const extMeta = n => EXT_META[extOf(n)] || { ico: '·', cls: 'other' }

/* ---------- 侧栏额外区域：源码入口 ---------- */
function renderSourceNav() {
  const el = document.getElementById('nav-src')
  if (!el) return
  el.innerHTML = `
    <div class="nav-sec">
      <a class="nav-head" id="ns-code" href="#/code">源码浏览器</a>
    </div>
    <div class="nav-sec">
      <a class="nav-head" id="ns-files" href="#/files">仓库文件树</a>
    </div>`
}

function markSourceNav() {
  const on = SRC.pane && !SRC.paneWide
  const tab = SRC.tabs.find(t => t.cid === SRC.active)
  document.getElementById('ns-code')?.classList.toggle('on', on && tab?.type === 'code')
  document.getElementById('ns-files')?.classList.toggle('on', on && tab?.type === 'tree')
}

/* ============================================================
   右栏面板（核心新增）
   ------------------------------------------------------------
   设计要点：
     · 面板里可以同时开多个标签（源码 / 文件树混排），各自保留
       滚动位置与定位状态——切来切去不丢上下文。
     · 打开面板绝不改变左侧 #content 的内容与滚动位置，
       所以「左边看讲解、右边读源码」是真正的并行，不是替换。
     · 每个标签的 DOM 只构建一次（SRC.mounted 缓存），
       切回来是瞬时的。
   ============================================================ */
function paneEl() { return document.getElementById('pane') }
function paneBody() { return document.getElementById('pane-body') }
function paneOpen() { return SRC.pane }

/** 打开面板（不切标签时保留原活动标签） */
function openPane() {
  if (!SRC.pane) {
    SRC.pane = true
    document.getElementById('app').classList.add('pane-open')
    applyPaneWidth()
    markSourceNav()
  }
  return true
}

function closePane() {
  SRC.pane = false
  SRC.paneWide = false
  const app = document.getElementById('app')
  app.classList.remove('pane-open', 'pane-wide')
  markSourceNav()
  renderStrip()
}

/** 左栏顶部的「返回架构内容」提示条（窄屏 / 全屏模式下才显示） */
function renderStrip() {
  const c = document.getElementById('content')
  if (!c) return
  const old = c.querySelector('.pane-strip')
  const show = SRC.pane && SRC.paneWide
  if (!show) { old?.remove(); return }
  if (old) return
  const div = document.createElement('div')
  div.className = 'pane-strip'
  div.innerHTML = `<b>源码全屏中</b><span>·</span><span>架构讲解已隐藏</span>
    <a href="#" id="strip-back">← 返回左右分屏</a>`
  c.prepend(div)
  div.querySelector('#strip-back').addEventListener('click', e => {
    e.preventDefault()
    togglePaneWide(false)
  })
}

function togglePaneWide(force) {
  SRC.paneWide = typeof force === 'boolean' ? force : !SRC.paneWide
  if (SRC.paneWide) openPane()
  document.getElementById('app').classList.toggle('pane-wide', SRC.paneWide)
  renderStrip()
  markSourceNav()
}

/* ---- 面板宽度（拖动分隔条） ---- */
function applyPaneWidth() {
  const p = paneEl()
  if (!p) return
  if (SRC.paneW) p.style.setProperty('--pane-w', SRC.paneW + 'px')
  else p.style.removeProperty('--pane-w')
}

function initPaneSplit() {
  const sp = document.getElementById('pane-split')
  const p = paneEl()
  if (!sp || !p) return
  let dragging = false

  const onMove = e => {
    if (!dragging) return
    const right = window.innerWidth - e.clientX
    SRC.paneW = Math.max(340, Math.min(window.innerWidth - 420, right))
    applyPaneWidth()
  }
  const onUp = () => {
    if (!dragging) return
    dragging = false
    sp.classList.remove('dragging')
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
  }

  sp.addEventListener('mousedown', e => {
    dragging = true
    sp.classList.add('dragging')
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    e.preventDefault()
  })
  sp.addEventListener('dblclick', () => { SRC.paneW = 0; applyPaneWidth() })
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)

  document.getElementById('pane-close')?.addEventListener('click', closePane)
  document.getElementById('pane-wide')?.addEventListener('click', () => togglePaneWide())

  window.addEventListener('resize', () => {
    if (!SRC.paneW) return
    SRC.paneW = Math.max(340, Math.min(window.innerWidth - 420, SRC.paneW))
    applyPaneWidth()
  })
}

/* ---- 标签管理 ---- */
/** 面板里的标签标题：带类型前缀，避免「两个 index.ts」分不清 */
function paneTabTitle(type, path) {
  if (type === 'tree') return 'TREE / 文件树'
  const base = (path || '').split('/').pop() || '源码'
  const parts = (path || '').split('/')
  const owner = parts[0] === 'packages' ? parts[2] : parts[0]
  return owner ? `${owner}/${base}` : base
}

function paneTabAdd(type, opts = {}) {
  const cid = 'c' + (++SRC.seq)
  SRC.tabs.push({ cid, type, title: paneTabTitle(type, opts.path), path: opts.path, line: opts.line })
  SRC.active = cid
  openPane()
  syncPane()
  return cid
}

function paneTabClose(cid) {
  const i = SRC.tabs.findIndex(t => t.cid === cid)
  if (i < 0) return
  SRC.tabs.splice(i, 1)
  SRC.mounted.delete(cid)
  if (SRC.active === cid) SRC.active = SRC.tabs.length ? SRC.tabs[Math.min(i, SRC.tabs.length - 1)].cid : null
  if (!SRC.tabs.length) closePane()
  else syncPane()
}

function paneTabActivate(cid) {
  if (SRC.active === cid) return
  SRC.active = cid
  syncPane()
}

/** 把标签栏 + 面板内容与状态对齐（唯一的渲染入口） */
function syncPane() {
  const tabsEl = document.getElementById('pane-tabs')
  const body = paneBody()
  if (!tabsEl || !body) return

  if (!SRC.tabs.length) {
    tabsEl.innerHTML = `<span class="ptab empty">没有打开的内容</span>`
    body.innerHTML = paneEmptyHtml()
    markSourceNav()
    return
  }
  syncPaneEmptyState()

  tabsEl.innerHTML = SRC.tabs.map(t => `
    <span class="ptab${t.cid === SRC.active ? ' active' : ''}" data-cid="${t.cid}" title="${esc(t.path || '文件树')}">
      <span class="ptab-ico">${t.type === 'tree' ? 'TREE' : 'SRC'}</span>
      <span class="ptab-tx">${esc(t.title)}</span>
      <span class="ptab-x" data-x="${t.cid}">✕</span>
    </span>`).join('')

  tabsEl.querySelectorAll('.ptab[data-cid]').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.ptab-x')) return
      paneTabActivate(el.dataset.cid)
    })
  })
  tabsEl.querySelectorAll('.ptab-x').forEach(el => {
    el.addEventListener('click', e => { e.stopPropagation(); paneTabClose(el.dataset.x) })
  })

  // 内容：隐藏旧的、显示/构建当前；先建好内容再撤掉空状态，避免闪一下空白
  for (const el of body.querySelectorAll('.pane-ctn')) {
    if (el.dataset.cid !== SRC.active) el.hidden = true
  }
  for (const t of SRC.tabs) {
    if (t.cid === SRC.active) buildPaneCtn(t)
  }
  syncPaneEmptyState()
  markSourceNav()
}

function paneEmptyHtml() {
  return `<div class="pane-empty">
    <span class="big">[ ]</span>
    <p>侧栏里还没有内容。</p>
    <p style="margin-top:10px">
      <a class="dep" href="#/files">打开文件树</a>
      <a class="dep" href="#/">回首页</a>
    </p>
  </div>`
}

/** 空状态与真实内容互斥：同一时刻只留一个 */
function syncPaneEmptyState() {
  const body = paneBody()
  if (!body) return
  const hasReal = !!body.querySelector('.pane-ctn')
  const empty = body.querySelector('.pane-empty')
  if (hasReal) empty?.remove()
  else if (!empty) body.insertAdjacentHTML('afterbegin', paneEmptyHtml())
}

function buildPaneCtn(t) {
  const body = paneBody()
  let host = body.querySelector(`.pane-ctn[data-cid="${t.cid}"]`)
  if (!host) {
    host = document.createElement('div')
    host.className = 'pane-ctn'
    host.dataset.cid = t.cid
    body.appendChild(host)
  }
  host.hidden = false

  const done = SRC.mounted.get(t.cid)

  if (done && t.type === 'code') {
    // 已构建过：同文件只挪行，不同文件要重建
    if (done.path === t.path) {
      if (done.line !== t.line) {
        done.line = t.line
        if (t.line) flashSourceLine(host, t.line, true)
      }
      return
    }
    // 路径变了 → 重新拉数据（下面重建分支会覆盖）
    SRC.mounted.delete(t.cid)
  }
  if (done && t.type === 'tree') {
    if (done.focus !== SRC.focusPath) {
      done.focus = SRC.focusPath
      updateFocusNote(host)
      focusTreeNode(host, SRC.focusPath)
    }
    return
  }

  /* 关键：先占位再异步渲染。
     否则在 await 结束前又来一次 syncPane，会重新进入这里
     再发一遍请求、并插进第二个内容容器。 */
  SRC.mounted.set(t.cid, t.type === 'code'
    ? { path: t.path, line: t.line, building: true }
    : { focus: SRC.focusPath, building: true })

  host.innerHTML = `<div class="loading">读取中…</div>`

  if (t.type === 'code') {
    paneRenderCode(host, t).then(() => {
      // 渲染期间用户可能已经切到别的行 → 以最新的 tab 状态为准
      const cur = SRC.tabs.find(x => x.cid === t.cid) || t
      SRC.mounted.set(t.cid, { path: cur.path, line: cur.line })
      if (cur.line) flashSourceLine(host, cur.line, true)
    })
  } else {
    paneRenderTree(host).then(() => {
      SRC.mounted.set(t.cid, { focus: SRC.focusPath })
      if (SRC.focusPath) focusTreeNode(host, SRC.focusPath, true)
    })
  }
}

/* ============================================================
   对外的「跳转」接口 —— 左侧所有链接都走这里
   ============================================================ */

/** 在右栏打开某个源文件的某一行。同文件同行 = 只闪一下，不重复开标签。 */
async function openSource(path, line) {
  if (!path) return false
  const ln = line ? Number(line) : null
  if (!SRC.online) {
    const ok = await probeServer()
    if (!ok) { location.hash = '#/code/' + encodeURI(path) + (ln ? ':' + ln : ''); return false }
  }
  const same = SRC.tabs.find(t => t.type === 'code' && t.path === path)
  if (same) {
    const had = same.line
    same.line = ln
    // 一律走 syncPane，让「已构建 → 只挪行」这条唯一路径处理定位，
    // 避免这里再闪一次造成两套状态打架。
    SRC.active = same.cid
    syncPane()
    if (!ln && had) {
      // 明确要求「打开文件、不指定行」→ 清掉旧的目标行标记
      const host = paneBody().querySelector(`.pane-ctn[data-cid="${same.cid}"]`)
      host?.querySelectorAll('.cl.target').forEach(x => x.classList.remove('target'))
    }
    return true
  }
  paneTabAdd('code', { path, line: ln })
  return true
}

/** 在右栏打开文件树，并定位到 focus 路径（展开 + 滚动 + 闪烁） */
async function openTreeAt(focusPath) {
  if (!SRC.online) {
    const ok = await probeServer()
    if (!ok) { location.hash = '#/files'; return false }
  }
  await loadTree()
  if (focusPath !== undefined) {
    SRC.focusPath = focusPath || null
    SRC.focusLine = null
  }
  const t = SRC.tabs.find(x => x.type === 'tree')
  if (t) {
    if (SRC.active !== t.cid) { SRC.active = t.cid; syncPane() }
    else {
      const host = paneBody().querySelector(`.pane-ctn[data-cid="${t.cid}"]`)
      const done = SRC.mounted.get(t.cid)
      if (done) done.focus = SRC.focusPath
      if (host) focusTreeNode(host, SRC.focusPath, true)
    }
    return true
  }
  paneTabAdd('tree')
  return true
}

/** 面板里打开一个架构页面（反向链接：源码 → 讲解） */
function openArch(hash) { location.hash = hash }

/* ============================================================
   面板初始化（在 app.js 启动时调用）
   ============================================================ */
function initPane() {
  initPaneSplit()
  paneBody().innerHTML = paneEmptyHtml()
  document.getElementById('pane-tabs').innerHTML = `<span class="ptab empty">没有打开的内容</span>`
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return
    if (!SRC.pane) return
    if (SRC.paneWide) { togglePaneWide(false); return }
    closePane()
  })
}

/* ============================================================
   文件树
   ============================================================ */
/* 归类：包目录 → 把子节点按 src / test / doc / other 分组 */
const KIND_ORDER = ['src', 'test', 'doc', 'other']
const KIND_LABEL = { src: '源码', test: '测试', doc: '文档', other: '配置' }

function isPkgDir(node) {
  return node.type === 'dir' && node.children?.some(c => c.name === 'package.json')
}

/** 把文件树节点重排为「归类视图」：目录优先，文件按 kind 分组 */
function classifyNode(node) {
  if (node.type !== 'dir') return node
  const dirs = node.children.filter(c => c.type === 'dir').map(classifyNode)
  const files = node.children.filter(c => c.type === 'file')

  if (!isPkgDir(node)) {
    // 非包目录：目录在前，文件按名字
    return { ...node, children: [...dirs, ...files.sort((a, b) => a.name.localeCompare(b.name))] }
  }

  // 包目录：先放 src/test/doc 等分类文件夹，再放目录，再放其余文件
  const buckets = {}
  for (const f of files) (buckets[f.kind] ??= []).push(f)
  const groups = KIND_ORDER
    .filter(k => buckets[k]?.length)
    .map(k => ({
      name: KIND_LABEL[k] + ' (' + buckets[k].length + ')',
      type: 'group', kind: k, path: node.path,
      children: buckets[k].sort((a, b) => a.name.localeCompare(b.name)),
    }))
  return { ...node, children: [...dirs, ...groups] }
}

/* 默认展开：顶层 + packages 的分组层 + 包内的 src。
   刻意不展开 .agents / snapshots 这类噪声目录。 */
function defaultExpand(node) {
  if (node.type !== 'dir') return
  const full = node.path
  const depth = full ? full.split('/').length : 0
  if (depth <= 2) SRC.expanded.add(full)
  for (const c of node.children || []) {
    if (c.type === 'dir') defaultExpand(c)
  }
}

let TREE_ROOT = null

/** 建树：一次性完成归类 + 默认展开 + 源码组展开 */
function ensureTree() {
  if (TREE_ROOT) return TREE_ROOT
  TREE_ROOT = classifyNode(SRC.tree)
  defaultExpand(TREE_ROOT)
  // 包内的「源码」组默认展开，其余（测试/配置）收起
  const walk = n => {
    if (n.type === 'group' && n.kind === 'src') SRC.expanded.add(`${n.path}::src`)
    for (const c of n.children || []) walk(c)
  }
  walk(TREE_ROOT)
  return TREE_ROOT
}

/** 展开到某个目标路径，返回需要的展开键集合 */
function keysForPath(path) {
  const keys = []
  const isGroupKey = k => k.includes('::')
  const parts = path.split('/')
  // 逐级祖先目录
  for (let i = 1; i < parts.length; i++) keys.push(parts.slice(0, i).join('/'))
  // 归属的「源码/测试/文档/配置」归类组（只在包目录这一层需要）
  const walk = (n, acc) => {
    if (!n || n.type === 'file') return
    for (const c of n.children || []) {
      if (c.type === 'group') {
        if (c.children.some(x => x.path === path)) keys.push(`${c.path}::${c.kind}`)
      } else if (c.type === 'dir') {
        if (path === c.path || path.startsWith(c.path + '/')) walk(c, acc)
      }
    }
  }
  if (TREE_ROOT) walk(TREE_ROOT, [])
  return keys
}

/** 只渲染展开的节点，避免 1000+ 行一次性塞进 DOM */
function treeNodeHtml(n, depth) {
  const pad = `style="--d:${depth}"`

  if (n.type === 'group') {
    const key = `${n.path}::${n.kind}`
    const open = SRC.expanded.has(key)
    const kids = open ? n.children.map(c => treeNodeHtml(c, depth + 1)).join('') : ''
    return `<div class="tnode tgroup">
      <div class="trow tgroup-row ${open ? 'open' : ''}" data-toggle="${esc(key)}" ${pad}>
        <span class="tcaret">${open ? '▾' : '▸'}</span>
        <span class="tgroup-name">${esc(n.name)}</span>
      </div>
      <div class="tkids">${kids}</div>
    </div>`
  }

  if (n.type === 'dir') {
    const open = SRC.expanded.has(n.path)
    const kids = open ? n.children.map(c => treeNodeHtml(c, depth + 1)).join('') : ''
    const isPkg = isPkgDir(n)
    return `<div class="tnode">
      <div class="trow tdir ${open ? 'open' : ''}" data-toggle="${esc(n.path)}" ${pad}>
        <span class="tcaret">${open ? '▾' : '▸'}</span>
        <span class="tico-folder${isPkg ? ' pkg' : ''}"></span>
        <span class="tname">${esc(n.name)}</span>
        ${isPkg ? `<span class="tpkg" title="打开包页">↗</span>` : ''}
      </div>
      <div class="tkids">${kids}</div>
    </div>`
  }

  const m = extMeta(n.name)
  return `<div class="tnode">
    <div class="trow tfile" data-file="${esc(n.path)}" ${pad}>
      <span class="tcaret" style="visibility:hidden">·</span>
      <span class="tico tico-${m.cls}">${m.ico}</span>
      <span class="tname">${esc(n.name)}</span>
    </div>
  </div>`
}

/** 渲染整棵树到容器；每次重渲染保留滚动位置，并在渲染后重新执行定位 */
function renderTree(container, opts = {}) {
  const wrap = container.querySelector('.tree-wrap') || container
  const scroller = container.classList.contains('pane-scroll') ? container : null
  const prev = scroller ? scroller.scrollTop : 0
  const focus = opts.focus !== undefined ? opts.focus : SRC.focusPath

  wrap.innerHTML = `<div class="tree">${TREE_ROOT.children.map(c => treeNodeHtml(c, 0)).join('')}</div>`

  wrap.querySelectorAll('[data-toggle]').forEach(el => {
    el.addEventListener('click', () => {
      const k = el.dataset.toggle
      if (SRC.expanded.has(k)) SRC.expanded.delete(k)
      else SRC.expanded.add(k)
      renderTree(container, { focus })
      if (scroller) requestAnimationFrame(() => { scroller.scrollTop = prev })
    })
  })
  wrap.querySelectorAll('[data-file]').forEach(el => {
    el.addEventListener('click', () => {
      const p = el.dataset.file
      SRC.selFile = p
      // 在同一个面板里开一个源码标签，文件树保留在旁边
      openSource(p)
    })
  })
  // 包目录上的 ↗ → 在左侧打开包页
  wrap.querySelectorAll('.tpkg').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation()
      const dir = el.closest('[data-toggle]')?.dataset.toggle
      if (dir?.startsWith('packages/')) openArch('#/pkg/' + dir.slice('packages/'.length))
    })
  })

  if (focus) focusTreeNode(container, focus)
}

/** 面板里文件树的「已定位」提示条：与 SRC.focusPath 保持一致 */
function updateFocusNote(host) {
  const bar = host.querySelector('.pane-bar')
  if (!bar) return
  let note = host.querySelector('.focus-note')
  if (!SRC.focusPath) { note?.remove(); return }
  if (!note) {
    note = document.createElement('div')
    note.className = 'focus-note'
    bar.insertAdjacentElement('afterend', note)
  }
  note.innerHTML = `<span>已定位</span><code>${esc(SRC.focusPath)}</code>`
}

/** 定位：展开祖先 → 滚动到位 → 闪烁。 */
function focusTreeNode(container, path, flash) {
  if (!path) return
  const keys = keysForPath(path)
  let changed = false
  for (const k of keys) {
    if (!SRC.expanded.has(k)) { SRC.expanded.add(k); changed = true }
  }
  const wrap = container.querySelector('.tree-wrap') || container
  const has = !!wrap.querySelector(`[data-file="${cssEsc(path)}"]`)
  if (changed || !has) {
    const scroller = container.querySelector('.pane-scroll')
    if (container.classList.contains('pane-ctn')) rerenderPaneTree(container)
    else renderTree(container, { focus: path })
    if (scroller) requestAnimationFrame(() => scrollNodeIntoView(container, path, flash))
    return
  }
  scrollNodeIntoView(container, path, flash)
}

function scrollNodeIntoView(container, path, flash) {
  const node = container.querySelector(`[data-file="${cssEsc(path)}"]`)
  if (!node) return
  node.classList.add('focus')
  const scroller = container.classList.contains('pane-scroll')
    ? container
    : container.querySelector('.pane-scroll') || container.closest('.pane-scroll') || container
  const scRect = scroller.getBoundingClientRect()
  const nRect = node.getBoundingClientRect()
  scroller.scrollTop += (nRect.top - scRect.top) - (scroller.clientHeight - nRect.height) / 2
  if (flash !== false) {
    node.classList.remove('flash')
    void node.offsetWidth
    node.classList.add('flash')
    setTimeout(() => node.classList.remove('flash'), 1600)
  }
}

/** CSS.escape 的兜底（路径里有 / . 等字符，属性选择器要转义） */
function cssEsc(s) {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s)
  return String(s).replace(/["\\]/g, '\\$&')
}


/* ============================================================
   整页版：文件树页（#/files）
   ------------------------------------------------------------
   整页版仍然保留，用于：
     · 直接在浏览器里打开 #/files（没走分屏）
     · 右栏切到全屏模式
   ============================================================ */
async function pageFiles() {
  const ok = SRC.online || await probeServer()
  if (!ok) return offlineNotice()
  await loadTree()
  ensureTree()

  const rows = TREE_ROOT.children.map(c => treeNodeHtml(c, 0)).join('')
  let fileCount = 0
  const count = nodes => nodes.forEach(n => { if (n.type === 'file') fileCount++; else if (n.children) count(n.children) })
  count(TREE_ROOT.children)
  return `
  <div class="crumb"><a href="#/">首页</a><span>/</span>仓库文件树</div>
  <div class="page-head">
    <div class="page-head-inner">
      <div>
        <p class="eyebrow">SOURCE / TREE</p>
        <h1>仓库文件树</h1>
        <p class="lead">按「包 → 源码 / 测试 / 文档 / 配置」归类，默认展开源码。点任意文件在<strong>右侧面板</strong>里读，左侧这份树不会消失。</p>
      </div>
      <aside class="page-head-side">
        <div class="row"><span>REPO</span><b>${esc(SRC.repo.split(/[\\/]/).pop() || '—')}</b></div>
        <div class="row"><span>FILES</span><b>${fileCount}</b></div>
        <div class="row"><span>MODE</span><b>LIVE DISK</b></div>
      </aside>
    </div>
  </div>
  <div class="note ok">
    <span class="t">实时读取</span>
    源码从磁盘现读，路径 <code>${esc(SRC.repo)}</code>。你在编辑器里改完保存，这里刷新即是最新内容。
  </div>
  <div class="tree-wrap" id="tree-host"><div class="tree">${rows}</div></div>`
}

/* ============================================================
   离线提示
   ============================================================ */
function offlineNotice() {
  return `
  <div class="crumb"><a href="#/">首页</a><span>/</span>源码浏览器</div>
  <div class="page-head">
    <div class="page-head-inner">
      <div>
        <p class="eyebrow">SOURCE / OFFLINE</p>
        <h1>源码浏览器</h1>
        <p class="lead">源码浏览器需要本地服务实时读磁盘（浏览器不允许网页直接读本地文件）。</p>
      </div>
      <aside class="page-head-side">
        <div class="row"><span>STATUS</span><b>OFFLINE</b></div>
        <div class="row"><span>PORT</span><b>5319</b></div>
        <div class="row"><span>ACTION</span><b>START SERVER</b></div>
      </aside>
    </div>
  </div>
  <div class="note warn">
    <span class="t">服务未启动</span>
    启动本地服务后，这里会改为实时读取磁盘的仓库文件树与源码查看器。
  </div>
  <h2>怎么启动</h2>
  <div class="mech">
    <div class="mech-row"><div class="mech-k">方式一（推荐）</div><div class="mech-v">在本目录双击 <code>start.bat</code>，浏览器会自动打开。</div></div>
    <div class="mech-row"><div class="mech-k">方式二</div><div class="mech-v">命令行执行 <code>node server.mjs</code>，然后访问 <code>http://127.0.0.1:5319/</code></div></div>
    <div class="mech-row"><div class="mech-k">仓库路径不对？</div><div class="mech-v">改 <code>config.json</code> 里的 <code>repo</code> 字段，或设环境变量 <code>DSH_REPO</code>。</div></div>
  </div>
  <p style="margin-top:18px">服务未启动时，本站其余部分（分层讲解、服务总表、事件矩阵、包清单）<strong>仍可正常浏览</strong>，因为它们的数据已内嵌。</p>`
}

/* ============================================================
   源码查看器
   ============================================================ */
/** 语法高亮：单趟扫描，不搞「多轮 replace + 占位符」那套。
 *
 *  为什么不用占位符方案：第一轮生成的占位符会被后面的轮次重新匹配，
 *  导致编号被破坏、控制字符泄漏到页面上，或者 &#39; 这类实体残留。
 *  改成一次扫描出 token 序列，天然没有嵌套问题。
 */
const HL_KEYWORDS = new Set('import from export default const let var class interface type enum extends implements return async await function if else for of in new this super readonly private public protected abstract static override declare module throw try catch finally while break continue yield typeof instanceof as is void null undefined true false def self lambda None True False with pass raise'.split(' '))
const HL_BUILTIN = new Set(['string', 'number', 'boolean', 'object', 'unknown', 'never', 'any', 'symbol', 'bigint'])

function hlSrc(code) {
  let out = ''
  let i = 0
  const n = code.length

  while (i < n) {
    const c = code[i]

    // 行注释 //
    if (c === '/' && code[i + 1] === '/') {
      let j = code.indexOf('\n', i)
      if (j < 0) j = n
      out += `<span class="hl-c">${esc(code.slice(i, j))}</span>`
      i = j
      continue
    }
    // 块注释 /* */
    if (c === '/' && code[i + 1] === '*') {
      let j = code.indexOf('*/', i + 2)
      j = j < 0 ? n : j + 2
      out += `<span class="hl-c">${esc(code.slice(i, j))}</span>`
      i = j
      continue
    }
    // Python 注释 #
    if (c === '#' && !/[A-Za-z0-9_$)'"\]]/.test(code[i - 1] || '')) {
      let j = code.indexOf('\n', i)
      if (j < 0) j = n
      out += `<span class="hl-c">${esc(code.slice(i, j))}</span>`
      i = j
      continue
    }
    // 字符串（单/双/反引号），支持转义
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1
      while (j < n) {
        if (code[j] === '\\') { j += 2; continue }
        if (code[j] === c) { j++; break }
        if (c !== '`' && code[j] === '\n') break
        j++
      }
      out += `<span class="hl-s">${esc(code.slice(i, j))}</span>`
      i = j
      continue
    }
    // 数字
    if (/[0-9]/.test(c) && !/[A-Za-z0-9_$]/.test(code[i - 1] || '')) {
      let j = i
      while (j < n && /[0-9_.eExXa-fA-F]/.test(code[j])) j++
      out += `<span class="hl-n">${esc(code.slice(i, j))}</span>`
      i = j
      continue
    }
    // 标识符 / 关键字 / 类型名
    if (/[A-Za-z_$]/.test(c)) {
      let j = i
      while (j < n && /[A-Za-z0-9_$]/.test(code[j])) j++
      const w = code.slice(i, j)
      if (HL_KEYWORDS.has(w)) out += `<span class="hl-k">${esc(w)}</span>`
      else if (HL_BUILTIN.has(w)) out += `<span class="hl-t">${esc(w)}</span>`
      else if (/^[A-Z]/.test(w) && w.length > 2) out += `<span class="hl-t">${esc(w)}</span>`
      else out += esc(w)
      i = j
      continue
    }

    out += esc(c)
    i++
  }
  return out
}

/* ---------- 行渲染（整页版与面板版共用） ---------- */
function renderCodeLines(filePath, text, line) {
  const lines = text.split(/\r?\n/)
  return lines.map((L, i) => {
    const n = i + 1
    const isTarget = line && n === Number(line)
    return `<div class="cl${isTarget ? ' target' : ''}" id="L${n}" data-line="${n}">
      <a class="ln" href="#/code/${encodeURI(filePath)}:${n}" data-ln="${n}">${n}</a>
      <span class="lt">${L ? hlSrc(L) : ''}</span></div>`
  }).join('')
}

/** 行链接：面板里不跳路由，直接在面板内定位 */
function wireLineLinks(host, filePath) {
  host.querySelectorAll('.ln[data-ln]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault()
      const ln = Number(a.dataset.ln)
      if (SRC.pane && !SRC.paneWide) {
        const t = SRC.tabs.find(x => x.cid === SRC.active)
        if (t && t.type === 'code' && t.path === filePath) {
          t.line = ln
          flashSourceLine(host, ln, true)
          return
        }
      }
      location.hash = `#/code/${encodeURI(filePath)}:${ln}`
    })
  })
}

/** 滚动到某一行 + 闪烁；keep=true 时同时把 .target 标记移过去 */
function flashSourceLine(host, line, keep) {
  const ln = Number(line)
  if (!ln) return
  const scroller = host.querySelector('.pane-scroll') || host
  requestAnimationFrame(() => {
    const node = host.querySelector(`.cl[data-line="${ln}"]`)
    if (!node) return
    if (keep) {
      host.querySelectorAll('.cl.target').forEach(x => x.classList.remove('target'))
      node.classList.add('target')
    }
    const scRect = scroller.getBoundingClientRect()
    const nRect = node.getBoundingClientRect()
    scroller.scrollTop += (nRect.top - scRect.top) - (scroller.clientHeight - nRect.height) / 2
    node.classList.remove('flash')
    void node.offsetWidth
    node.classList.add('flash')
    setTimeout(() => node.classList.remove('flash'), 1600)
    // 行号锚点的 hash 也跟着走，方便复制链接
    if (!SRC.pane || SRC.paneWide) history.replaceState(null, '', `#/code/${encodeURI(filePathOf(host))}:${ln}`)
  })
}

function filePathOf(host) {
  return host.dataset.path || ''
}

/* ============================================================
   整页版：源码查看器（#/code/<path>:<line>）
   ============================================================ */
async function pageCode(filePath, line) {
  const ok = SRC.online || await probeServer()
  if (!ok) return offlineNotice()

  let f, tr
  try {
    [f, tr] = await Promise.all([
      api('/file?path=' + encodeURIComponent(filePath)),
      api('/trace?path=' + encodeURIComponent(filePath)),
    ])
  } catch (e) {
    return `<div class="crumb"><a href="#/files">文件树</a><span>/</span>错误</div>
      <h1>读不到文件</h1><div class="note warn">${esc(String(e.message))}</div>
      <p><code>${esc(filePath)}</code></p>`
  }

  const base = filePath.split('/').pop()

  return `
  <div class="crumb"><a href="#/">首页</a><span>/</span><a href="#/files">文件树</a><span>/</span><code>${esc(filePath)}</code></div>
  <h1 class="code-title">${esc(base)}${line ? ` <span class="line-pin">第 ${line} 行</span>` : ''}</h1>
  <div class="code-layout">
    <div class="code-main">
      <div class="code-head sticky">
        <span class="lbl">${esc(base)}</span>
        <span class="code-meta">${f.lines} 行 · ${(f.size / 1024).toFixed(1)} KB · ${esc(filePath)}</span>
      </div>
      <div class="src-view" id="src-host" data-path="${esc(filePath)}">${renderCodeLines(filePath, f.text, line)}</div>
    </div>
    ${tracePanel(tr, filePath, line)}
  </div>`
}

/* ============================================================
   面板版：源码视图
   ============================================================ */
async function paneRenderCode(host, tab) {
  const filePath = tab.path
  let f, tr
  try {
    [f, tr] = await Promise.all([
      api('/file?path=' + encodeURIComponent(filePath)),
      api('/trace?path=' + encodeURIComponent(filePath)),
    ])
  } catch (e) {
    host.innerHTML = `<div class="pane-empty">
      <span class="big">!</span>
      <p>读不到文件</p>
      <p style="margin-top:6px"><code>${esc(filePath)}</code></p>
      <p style="margin-top:6px;font-size:11.5px">${esc(String(e.message))}</p>
    </div>`
    return
  }

  const base = filePath.split('/').pop()
  host.dataset.path = filePath
  host.innerHTML = `
    <div class="pane-bar">
      <span class="pb-name">${esc(base)}</span>
      <span class="pb-meta">${f.lines} 行 · ${(f.size / 1024).toFixed(1)} KB</span>
      <a class="pb-act" href="#/code/${encodeURI(filePath)}${tab.line ? ':' + tab.line : ''}" title="在整页里打开">整页 ↗</a>
    </div>
    <div class="pane-scroll">${renderCodeLines(filePath, f.text, tab.line)}</div>
    <div class="pane-trace">${paneTraceInner(tr, filePath, tab.line)}</div>`

  renderPaneTrace(host, tr, filePath)
  wireLineLinks(host, filePath)
}

/** 面板底部的紧凑溯源块（复用 tracePanel 的数据，重新排版） */
function paneTraceInner(tr, filePath, line) {
  const pkg = tr.pkg
  const p = pkg && window.DSH_DATA.packages.find(x => x.group === pkg.group && x.dir === pkg.dir)
  const kindZh = {
    class: '类', method: '方法', function: '函数', interface: '接口',
    type: '类型', const: '常量', inject: '依赖声明', module: '声明合并',
  }
  const kindCls = {
    class: 'cls', method: 'mth', function: 'fn', interface: 'ifc',
    type: 'typ', const: 'cst', inject: 'inj', module: 'mod',
  }

  return `
  <div class="pt-head">
    <span class="tp-h" style="margin:0">溯源</span>
    ${pkg ? `<a class="dep" href="#/pkg/${esc(pkg.group)}/${esc(pkg.dir)}" data-arch>${esc(pkg.dir)}</a>` : `<span class="pt-note">仓库基础设施</span>`}
  </div>
  ${tr.injects?.length ? `
    <div class="tp-sec" style="padding:9px 14px">
      <div class="tp-h">声明的依赖 <span class="tp-n">${tr.injects.length}</span></div>
      <div class="deps">${tr.injects.map(k => `<a class="dep" href="#/svc/${esc(k)}" data-arch>ctx.${esc(k)}</a>`).join('')}</div>
    </div>` : ''}
  ${tr.symbols?.length ? `
    <div class="tp-sec" style="padding:9px 14px">
      <div class="tp-h">本文件符号 <span class="tp-n">${tr.symbols.length}</span></div>
      <div class="sym-list">
        ${tr.symbols.slice(0, 200).map(s => `
          <a class="sym" href="#/code/${encodeURI(filePath)}:${s.line}" data-goline="${s.line}">
            <span class="sym-ln">${s.line}</span>
            <span class="schip s-${kindCls[s.kind] || 'oth'}">${kindZh[s.kind] || s.kind}</span>
            <span class="sym-name">${s.owner ? `<span class="sym-own">${esc(s.owner)}.</span>` : ''}${esc(s.name)}</span>
          </a>`).join('')}
      </div>
    </div>` : ''}
  ${p ? `<div class="tp-sec" style="padding:9px 14px">
    <div class="tp-h">相关架构概念</div>
    <div class="sib-list">${relatedConceptLinks(p)}</div>
  </div>` : ''}
  ${tr.siblings?.length > 1 ? `
    <div class="tp-sec" style="padding:9px 14px">
      <div class="tp-h">同包其它文件</div>
      <div class="sib-list">
        ${tr.siblings.map(s => {
          const nm = s.split('/').pop()
          return `<a class="sib${s === filePath ? ' active' : ''}" href="#/code/${encodeURI(s)}" data-opensrc="${esc(s)}">${esc(nm)}</a>`
        }).join('')}
      </div>
    </div>` : ''}`
}

/** 面板内的溯源交互（不跳路由） */
function renderPaneTrace(host, tr, filePath) {
  const traceEl = host.querySelector('.pane-trace')
  if (!traceEl) return
  traceEl.querySelectorAll('[data-opensrc]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault()
      openSource(a.dataset.opensrc)
    })
  })
  traceEl.querySelectorAll('[data-goline]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault()
      const ln = Number(a.dataset.goline)
      const t = SRC.tabs.find(x => x.cid === SRC.active)
      if (t) t.line = ln
      flashSourceLine(host, ln, true)
    })
  })
}

/* ============================================================
   面板版：文件树视图
   ============================================================ */
async function paneRenderTree(host) {
  await loadTree()
  ensureTree()
  host.innerHTML = `
    <div class="pane-bar">
      <span class="pb-name">TREE / 仓库文件树</span>
      <span class="pb-meta">${esc(SRC.repo.split(/[\\/]/).pop())}</span>
      <a class="pb-act" href="#/files" title="在整页里打开">整页 ↗</a>
    </div>
    <div class="pane-scroll tree-scroll">
      <div class="tree-wrap"><div class="tree">${TREE_ROOT.children.map(c => treeNodeHtml(c, 0)).join('')}</div></div>
    </div>`

  updateFocusNote(host)
  if (SRC.focusPath) keysForPath(SRC.focusPath).forEach(k => SRC.expanded.add(k))
  mountPaneTreeHandlers(host)
}

/** 面板内文件树的事件绑定：初次渲染与局部重渲染共用一份 */
function mountPaneTreeHandlers(host) {
  const scroller = host.querySelector('.pane-scroll')
  const wrap = host.querySelector('.tree-wrap')
  if (!wrap) return

  const rerender = () => {
    const prev = scroller ? scroller.scrollTop : 0
    wrap.innerHTML = `<div class="tree">${TREE_ROOT.children.map(c => treeNodeHtml(c, 0)).join('')}</div>`
    if (SRC.focusPath) {
      const node = wrap.querySelector(`[data-file="${cssEsc(SRC.focusPath)}"]`)
      node?.classList.add('focus')
    }
    updateFocusNote(host)
    mountPaneTreeHandlers(host)
    requestAnimationFrame(() => { if (scroller) scroller.scrollTop = prev })
  }

  wrap.querySelectorAll('[data-toggle]').forEach(el => {
    el.addEventListener('click', () => {
      const k = el.dataset.toggle
      if (SRC.expanded.has(k)) SRC.expanded.delete(k)
      else SRC.expanded.add(k)
      rerender()
    })
  })
  wrap.querySelectorAll('[data-file]').forEach(el => {
    el.addEventListener('click', () => {
      SRC.selFile = el.dataset.file
      openSource(el.dataset.file)
    })
  })
  wrap.querySelectorAll('.tpkg').forEach(el => {
    el.setAttribute('title', '在左侧打开该包页')
    el.addEventListener('click', e => {
      e.stopPropagation()
      const dir = el.closest('[data-toggle]')?.dataset.toggle
      if (dir?.startsWith('packages/')) openArch('#/pkg/' + dir.slice('packages/'.length))
    })
  })
}

/** 局部重渲染：只重建树体，保留滚动与定位 */
function rerenderPaneTree(host) {
  const wrap = host.querySelector('.tree-wrap')
  if (!wrap) return
  wrap.innerHTML = `<div class="tree">${TREE_ROOT.children.map(c => treeNodeHtml(c, 0)).join('')}</div>`
  if (SRC.focusPath) {
    const node = wrap.querySelector(`[data-file="${cssEsc(SRC.focusPath)}"]`)
    node?.classList.add('focus')
  }
  updateFocusNote(host)
  mountPaneTreeHandlers(host)
}

/* ============================================================
   双向溯源面板
   ============================================================ */
function tracePanel(tr, filePath, line) {
  const pkg = tr.pkg
  const p = pkg && window.DSH_DATA.packages.find(x => x.group === pkg.group && x.dir === pkg.dir)

  const kindChip = k => {
    const map = {
      class: ['类', 'cls'], method: ['方法', 'mth'], function: ['函数', 'fn'],
      interface: ['接口', 'ifc'], type: ['类型', 'typ'], const: ['常量', 'cst'],
      inject: ['依赖声明', 'inj'], module: ['声明合并', 'mod'],
    }
    const [zh, cls] = map[k] || [k, 'oth']
    return `<span class="schip s-${cls}">${zh}</span>`
  }

  let symsHtml = ''
  if (tr.symbols?.length) {
    symsHtml = `
    <div class="tp-sec">
      <div class="tp-h">本文件符号 <span class="tp-n">${tr.symbols.length}</span></div>
      <div class="sym-list">
        ${tr.symbols.map(s => `
          <a class="sym" href="#/code/${encodeURI(filePath)}:${s.line}">
            <span class="sym-ln">${s.line}</span>
            ${kindChip(s.kind)}
            <span class="sym-name">${s.owner ? `<span class="sym-own">${esc(s.owner)}.</span>` : ''}${esc(s.name)}</span>
          </a>`).join('')}
      </div>
    </div>`
  }

  let injectHtml = ''
  if (tr.injects?.length) {
    injectHtml = `
    <div class="tp-sec">
      <div class="tp-h">声明的依赖 <span class="tp-n">${tr.injects.length}</span></div>
      <p class="tp-note">文件里 <code>static inject</code> 声明：要等到这些服务就绪，本插件才会加载。</p>
      <div class="deps">${tr.injects.map(k => svcLink(k)).join('')}</div>
    </div>`
  }

  return `
  <aside class="trace">
    <div class="tp-sec">
      <div class="tp-h">这个文件</div>
      <div class="tp-file">${esc(filePath)}</div>
    </div>

    ${pkg ? `
    <div class="tp-sec">
      <div class="tp-h">所属包</div>
      <a class="dep big" href="#/pkg/${esc(pkg.group)}/${esc(pkg.dir)}">${esc(pkg.dir)}</a>
      ${pkg.name ? `<div class="tp-mono">${esc(pkg.name)}</div>` : ''}
      <div class="tp-sub">分组 <a class="dep" href="#/map" data-anchor="group-${esc(pkg.group)}">${esc(pkg.group)}</a></div>
      ${pkg.description ? `<p class="tp-desc">${esc(pkg.description)}</p>` : ''}
    </div>` : `
    <div class="tp-sec">
      <div class="tp-h">所属包</div>
      <p class="tp-note">不在 packages/ 下（属于仓库基础设施）。</p>
    </div>`}

    ${injectHtml}

    ${tr.exports?.length ? `
    <div class="tp-sec">
      <div class="tp-h">导出 <span class="tp-n">${tr.exports.length}</span></div>
      <div class="tp-exports">${tr.exports.slice(0, 20).map(e => `<code>${esc(e)}</code>`).join(' ')}</div>
    </div>` : ''}

    ${symsHtml}

    ${p ? relatedConcepts(p) : ''}

    ${tr.siblings?.length > 1 ? `
    <div class="tp-sec">
      <div class="tp-h">同包其它文件</div>
      <div class="sib-list">
        ${tr.siblings.map(s => {
          const nm = s.split('/').pop()
          const active = s === filePath
          return `<a class="sib${active ? ' active' : ''}" href="#/code/${encodeURI(s)}">${esc(nm)}</a>`
        }).join('')}
      </div>
    </div>` : ''}

    <div class="tp-sec">
      <div class="tp-h">外部</div>
      <a class="tp-ext" href="https://github.com/deepseek-ai/deepseek-harness" target="_blank" rel="noopener">在 GitHub 查看 ↗</a>
    </div>
  </aside>`
}

/** 服务 key → 链接 */
function svcLink(key) {
  const s = window.DSH_DATA.services.find(x => x.key === key)
  if (s) return `<a class="dep" href="#/svc/${esc(key)}">ctx.${esc(key)}</a>`
  return `<span class="dep">ctx.${esc(key)}</span>`
}

/** 根据包的分组，挑出相关的架构概念页（返回 id 列表） */
const CONCEPT_MAP = {
  core: ['spine', 'session', 'tools'],
  llm: ['llm'],
  shell: ['seam', 'exec'],
  fs: ['seam', 'exec'],
  subprocess: ['exec'],
  session: ['session', 'persistence'],
  compaction: ['longrun'],
  subagent: ['multiagent'],
  scope: ['scope'],
  skill: ['extensibility'],
  hooks: ['extensibility'],
  web: ['seam'],
}

function conceptItems(p) {
  const ids = CONCEPT_MAP[p.group]
  if (!ids) return []
  const L = window.DSH_DATA.layers
  return ids.map(id => L.find(l => l.id === id)).filter(Boolean)
}

/** 整页版：带外框的概念列表 */
function relatedConcepts(p) {
  const items = conceptItems(p)
  if (!items.length) return ''
  return `
  <div class="tp-sec">
    <div class="tp-h">相关架构概念</div>
    <div class="sib-list">
      ${items.map(l => `<a class="sib" href="#/layer/${l.id}">${esc(l.title)}</a>`).join('')}
    </div>
  </div>`
}

/** 面板版：只输出标签本身（外层由 paneTraceInner 包好） */
function relatedConceptLinks(p) {
  const items = conceptItems(p)
  if (!items.length) return `<span class="tp-note" style="font-size:11.5px">这个包在站内没有对应的分层讲解。</span>`
  return items.map(l => `<a class="sib" href="#/layer/${l.id}" data-arch>${esc(l.title)}</a>`).join('')
}

/* ============================================================
   源码页面的交互挂载（在 route() 之后调用）
   ============================================================ */
function mountSourcePage() {
  /* ---- 整页版文件树 ---- */
  const host = document.getElementById('tree-host')
  if (host && TREE_ROOT) {
    const wrap = host
    wrap.querySelectorAll('[data-toggle]').forEach(el => {
      el.addEventListener('click', () => {
        const k = el.dataset.toggle
        if (SRC.expanded.has(k)) SRC.expanded.delete(k)
        else SRC.expanded.add(k)
        const prev = window.scrollY
        wrap.innerHTML = `<div class="tree">${TREE_ROOT.children.map(c => treeNodeHtml(c, 0)).join('')}</div>`
        mountTreeHandlers(wrap)
        window.scrollTo(0, prev)
      })
    })
    mountTreeHandlers(wrap)
  }

  /* ---- 整页版源码：目标行高亮并滚动到位 ---- */
  const src = document.getElementById('src-host')
  const target = src?.querySelector('.cl.target')
  if (target) {
    requestAnimationFrame(() => {
      const scRect = src.getBoundingClientRect()
      const tRect = target.getBoundingClientRect()
      src.scrollTop += (tRect.top - scRect.top) - (src.clientHeight - tRect.height) / 2
      target.classList.add('flash')
      setTimeout(() => target.classList.remove('flash'), 1400)
    })
  }
  if (src) wireLineLinks(src, src.dataset.path)
}

function mountTreeHandlers(wrap) {
  wrap.querySelectorAll('[data-file]').forEach(el => {
    el.addEventListener('click', () => {
      SRC.selFile = el.dataset.file
      openSource(el.dataset.file)
    })
  })
  wrap.querySelectorAll('[data-toggle]').forEach(el => {
    el.addEventListener('click', () => {
      const k = el.dataset.toggle
      if (SRC.expanded.has(k)) SRC.expanded.delete(k)
      else SRC.expanded.add(k)
      const prev = window.scrollY
      wrap.innerHTML = `<div class="tree">${TREE_ROOT.children.map(c => treeNodeHtml(c, 0)).join('')}</div>`
      mountTreeHandlers(wrap)
      window.scrollTo(0, prev)
    })
  })
  wrap.querySelectorAll('.tpkg').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation()
      const dir = el.closest('[data-toggle]')?.dataset.toggle
      if (dir?.startsWith('packages/')) openArch('#/pkg/' + dir.slice('packages/'.length))
    })
  })
}
