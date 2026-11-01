/* ============================================================
   DeepSeek Harness · 全量解构  —  应用逻辑
   纯原生 JS，hash 路由，无构建
   ============================================================ */
'use strict'

const D = window.DSH_DATA
const { packages: PKGS, services: SVCS, tools: TOOLS, events: EVENTS, bundles: BUNDLES, layers: LAYERS, code: CODE, deep: DEEP, filemap: FILEMAP } = D
/** 数据快照元信息（源仓库名/版本/HEAD/生成时间），由 scripts/bundle.mjs 现读仓库写入 */
const META = D.meta || {}

/* ---------- 索引 ---------- */
const byShort = new Map(PKGS.map(p => [p.short, p]))
const byName = new Map(PKGS.map(p => [p.name, p]))
/** 逐包精读解读，键 group/dir。精读是人工/子代理逐包写的，与 packages.json 并非同一版本，
 *  可能少于包总数（新加的包还没写），所以一律用 deepOf() 判空后再渲染。 */
const deepOf = p => DEEP && DEEP[`${p.group}/${p.dir}`]
/** 有精读的包数 / 总包数 —— 用于在地图与详情页如实标注覆盖情况 */
const DEEP_N = DEEP ? Object.keys(DEEP).length : 0
/** 每包文件清单（行号引用 → 完整路径用），键 group/dir；缺数据时优雅降级为纯文本 */
const DIR_INDEX = DeepFmt.buildDirIndex(PKGS)
const FMT_CTX = { filemap: FILEMAP || null, dirIndex: DIR_INDEX }
const byGroup = new Map()
for (const p of PKGS) {
  if (!byGroup.has(p.group)) byGroup.set(p.group, [])
  byGroup.get(p.group).push(p)
}
for (const arr of byGroup.values()) arr.sort((a, b) => a.short.localeCompare(b.short))

/* 分组元信息（中文解释） */
const GROUP_META = {
  core:            { zh: '核心脊柱',   ico: '🦴', d: '会话日志、提示词组装、工具注册表、agent 接口与默认循环——所有组合都会启动的包。' },
  api:             { zh: 'Remote API', ico: '🌉', d: 'Client → Host 的类型化能力调用层：选暴露什么、怎么把调用送到正确的会话 agent。' },
  typert:          { zh: '类型图',     ico: '🔮', d: '构建期类型生成器把源码类型声明变成运行时反射、schema 与 Remote 描述符，免手写 wire 代码。' },
  bundle:          { zh: '组合包',     ico: '🎛️', d: '可安装的 profile 补丁层。base 是共享核心，其余各形态在其上叠加。' },
  boot:            { zh: '启动',       ico: '🚀', d: '共享的 app-bin 启动胶水：profile 加载、补丁叠加、环境层。' },
  llm:             { zh: '模型接入',   ico: '🧠', d: 'LLM 能力家族：抽象服务 + 各厂商适配器 + 重试 + token 计量。' },
  session:         { zh: '会话数据面', ico: '📜', d: '持久化的会话数据平面：存储接缝、后端、投影、标题、遥测、格式迁移。' },
  'session-query': { zh: '会话检索',   ico: '🔍', d: '会话读取家族：逻辑语料、有界读取、血缘、语义过滤、SQLite 全文搜索。' },
  shell:           { zh: 'Shell 执行', ico: '⌨️', d: 'Bash 能力家族：执行器接缝、本地实现、模型面向工具、持久 PTY。' },
  subprocess:      { zh: '子进程',     ico: '⚙️', d: '子进程能力 + 本地进程树提供者 + 共享 Win32 库。' },
  ssh:             { zh: 'SSH 远程',   ico: '🔌', d: '共享 OpenSSH 连接 + 带版本的 POSIX 远端助手；在其上复用 fs / subprocess / terminal / sandbox 四种能力。' },
  terminal:        { zh: '终端',       ico: '🖥️', d: '持久 PTY 会话能力：owner 作用域会话、本地实现、模型面向工具。' },
  sandbox:         { zh: '沙箱',       ico: '🛡️', d: '进程围栏接缝；bwrap / Landlock / Seatbelt / Windows ACL 后端。' },
  fs:              { zh: '文件系统',   ico: '📁', d: '文件系统能力家族：接缝、本地实现、模型面向文件工具、发现工具。' },
  'ptc-runtime':   { zh: 'PTC 运行时', ico: '▶️', d: '程序化工具调用（PTC）执行接缝 ctx.ptcRuntime + 沙箱化 Node 实现——取代旧的 code-runtime 家族。' },
  lsp:             { zh: '语言服务',   ico: '🧭', d: 'LSP 能力家族：接缝、通用 stdio 提供者、lsp 工具。' },
  skill:           { zh: '技能',       ico: '📚', d: '技能能力家族：提供者注册表、本地提供者、模型面向的目录/加载器。' },
  compaction:      { zh: '上下文压缩', ico: '🗜️', d: '压缩能力家族：服务定义 + 基础提供者 + 命令消费者 + 图片外置。' },
  context:         { zh: '上下文注入', ico: '📍', d: '模型可见的请求上下文：工作区指令、时间上下文、引用。' },
  subagent:        { zh: '子智能体',   ico: '👥', d: '子智能体能力家族：提供者注册契约与模型面向的委托工具。' },
  jobs:            { zh: '后台作业',   ico: '⏱️', d: '通用后台作业运行时与模型面向的作业控制工具。' },
  workflow:        { zh: '工作流',     ico: '🔄', d: '工作流接缝、worker 线程引擎、workflow/ralph 工具，以及 PTC 版工作流。' },
  webhook:         { zh: 'Webhook',    ico: '📡', d: '经签名验证的外部事件、可信规则、发射即忘的工作区会话。' },
  web:             { zh: '网络访问',   ico: '🌐', d: '网络能力家族：接缝、搜索/抓取提供者、模型面向网络工具。' },
  'browser-use':   { zh: '浏览器操控', ico: '🌍', d: '浏览器操控提供者的具名注册点（独占一个名字，具体实现由实验组或 MCP 驱动提供）。' },
  'computer-use':  { zh: '电脑操控',   ico: '🖱️', d: '桌面/电脑操控提供者的具名注册点，与浏览器操控同构。' },
  document:        { zh: '文档处理',   ico: '📄', d: 'Office → PDF 转换：有界队列 + 结果缓存，供附件与交付链路复用。' },
  deliverables:    { zh: '交付物',     ico: '📤', d: '本回合工作区改动的记录与显式交付声明：从 git 工作树快照与整文件捕获算差异，再声明给用户。' },
  attachment:      { zh: '附件',       ico: '📎', d: '持久附件身份、校验、本地内容寻址存储。' },
  spill:           { zh: '溢出存储',   ico: '💧', d: '溢出能力家族：存储接缝、本地实现、工具结果溢出策略。' },
  todo:            { zh: '任务清单',   ico: '✅', d: '模型面向的 todo_write 工具。' },
  plan:            { zh: '计划模式',   ico: '🗺️', d: '计划协作状态：直接入口命令与经过审核的退出。' },
  preset:          { zh: 'Agent 预设', ico: '🎚️', d: '从预设 cordis.yml 文件做每会话的 agent 组合。' },
  guard:           { zh: '循环守卫',   ico: '🚧', d: '循环卫生守卫：重复调用提醒 + tools/execute 截止时间执行器。' },
  extensions:      { zh: '自我修改',   ico: '🪄', d: 'Agent 运行时自我修改：实时插件/服务检查与模型编写的挂载/卸载。' },
  hooks:           { zh: '钩子桥',     ico: '🪝', d: '钩子桥 + 共享的 Claude Code / Codex 线协议库。' },
  storage:         { zh: '通用存储',   ico: '🗄️', d: '非会话存储中枢 + 后端 + 域形态。' },
  settings:        { zh: '用户设置',   ico: '⚙️', d: '用户设置接缝 + 文件后端提供者。' },
  credentials:     { zh: '凭据授权',   ico: '🔑', d: '凭据引用/记录接缝 + env 优先于 .env 的提供者 + 需要问人的授权流。' },
  interaction:     { zh: '人机交互',   ico: '🙋', d: '人类协作平面：审批/交互接缝、权限预设、命令、ask-user 工具。' },
  workspace:       { zh: '工作区',     ico: '📂', d: '工作区实体。' },
  identity:        { zh: '身份',       ico: '🆔', d: '共享的匿名身份；含 DeepSeek 账号凭据与账号态模型接入。' },
  goal:            { zh: '目标',       ico: '🎯', d: '同会话目标持久化与生命周期。' },
  schedule:        { zh: '定时',       ico: '⏰', d: '会话本地的定时跟进。' },
  feedback:        { zh: '反馈',       ico: '💬', d: '人类反馈捕获与命令。' },
  mcp:             { zh: 'MCP 桥',     ico: '🧩', d: 'MCP 客户端桥：把外部 MCP server 的工具注册为本地工具（含 resources 读取）。' },
  telemetry:       { zh: '遥测',       ico: '📈', d: '基于 OTLP 的遥测出口：普通事件与字节有界的会话日志各走独立通道。' },
  acp:             { zh: 'ACP 服务',   ico: '🤖', d: '仅用于自动化的 Agent Client Protocol 服务。' },
  sdk:             { zh: 'SDK',        ico: '📦', d: '进程外 SDK：JSON-RPC 协议与 TypeScript 客户端/服务端。' },
  host:            { zh: 'Web 主机',   ico: '🏠', d: 'Web GUI 主机半边：HTTP 路由服务器、目录选择、静态资源、产品遥测。' },
  client:          { zh: 'Web 客户端', ico: '🎨', d: 'Web GUI 浏览器半边：壳、wire、对象服务、槽位、ui-* 插件。' },
  'test-support':  { zh: '测试支撑',   ico: '🧪', d: '支撑设施：testkit、不变式、回放、Loader 冒烟、远端 mock。' },
  util:            { zh: '基础工具',   ico: '🧰', d: '跨组共享的零依赖底层工具（Branded、home/path 助手、超时、分块列表、语言识别）。' },
  experimental:    { zh: '实验性',     ico: '🧫', d: '私有原型与仅内部使用的插件：语音输入/转写、浏览器与电脑操控驱动、审查、会话检查器、PTC Python。' },
}

/* ---------- 工具函数 ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

/** 行内 markdown（供已含 HTML 的机制文本使用）：
 *  先保护 HTML 标签与行内 code，再处理 **bold**，最后还原。 */
function md(s) {
  const store = []
  const keep = html => { store.push(html); return `\u0000${store.length - 1}\u0000` }
  let out = String(s ?? '')
    // 保护既有 HTML 标签（<strong>/<code>/<em> 等）
    .replace(/<\/?[a-zA-Z][^>]*>/g, keep)
    // 行内代码 → 转义内容后包 code
    .replace(/`([^`]+)`/g, (_, c) => keep(`<code>${esc(c)}</code>`))
    // 纯文本部分整体转义
  out = out.replace(/\u0000(\d+)\u0000/g, (_, i) => `@@${i}@@`)
  out = esc(out)
  // bold
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  // 还原保护块
  out = out.replace(/@@(\d+)@@/g, (_, i) => store[Number(i)])
  // 保护块内部可能残留的行内代码标记，交给 code() 处理
  return out.replace(/&lt;code&gt;([^&]*)&lt;\/code&gt;/g, '<code>$1</code>')
}

/** 精读正文的结构化渲染已移到 assets/deepfmt.js（DeepFmt.renderField）：
 *  分句 + 领句小标题 + 行号引用转链接，浏览器与校验脚本共用同一实现。 */

/** 纯文本版的行内 md（无既有 HTML 的场合） */
function mdPlain(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
}

/** 极简 TS 高亮 */
function hl(code) {
  return esc(code)
    .replace(/(\/\*\*[\s\S]*?\*\/|\/\/[^\n]*)/g, '<span class="c">$1</span>')
    .replace(/\b(import|from|export|const|let|class|interface|extends|implements|return|async|await|function|if|else|for|of|in|new|this|type|readonly|private|public|abstract|static|default|throw|try|catch|while|break|yield)\b/g, '<span class="k">$1</span>')
    .replace(/'([^'\n]*)'/g, '<span class="s">\'$1\'</span>')
}

function pkgLink(short, label) {
  const p = byShort.get(short)
  if (!p) return `<span class="dep">${esc(label || short)}</span>`
  return `<a class="dep" href="#/pkg/${p.group}/${p.dir}">${esc(label || short)}</a>`
}

/* 依赖名 → short 名 */
function depShort(name) {
  if (byName.has(name)) return byName.get(name).short
  return name.replace('@deepseek-ai/dsh-', '').replace('@deepseek-ai/cordis-plugin-', 'cordis:').replace('@deepseek-ai/', '')
}

/* ---------- 侧栏导航 ---------- */
function renderNav() {
  const groups = [...byGroup.keys()].sort((a, b) => {
    const am = GROUP_META[a]?.zh || a, bm = GROUP_META[b]?.zh || b
    return am.localeCompare(bm, 'zh')
  })
  let html = `
    <div class="nav-sec">
      <a class="nav-head" href="#/">从这里开始</a>
    </div>
    <div class="nav-sec">
      <a class="nav-head" href="#/map">全站地图<span class="nav-num">${PKGS.length}</span></a>
    </div>
    <div class="nav-sec">
      <a class="nav-head" href="#/seams">能力接缝<span class="nav-num">${SVCS.length}</span></a>
    </div>
    <div class="nav-sec">
      <a class="nav-head" href="#/events">事件矩阵<span class="nav-num">${EVENTS.length}</span></a>
    </div>
    <div class="nav-sec">
      <a class="nav-head" href="#/tools">工具目录<span class="nav-num">${TOOLS.length}</span></a>
    </div>
    <div class="nav-label">分层深入 / LAYERS</div>
  `
  for (const g of groups) {
    const meta = GROUP_META[g] || { zh: g }
    const kids = byGroup.get(g)
    html += `<div class="nav-sec">
      <div class="nav-head" data-group="${g}">
        <span>${esc(meta.zh)}</span>
        <span class="nav-arrow">▶</span><span class="nav-num">${kids.length}</span>
      </div>
      <div class="nav-kids" data-kids="${g}">
        ${kids.map(p => `<a class="nav-item" href="#/pkg/${p.group}/${p.dir}" title="${esc(p.desc || p.short)}">${esc(p.short)}</a>`).join('')}
      </div>
    </div>`
  }
  document.getElementById('nav').innerHTML = html

  document.querySelectorAll('.nav-head[data-group]').forEach(h => {
    h.addEventListener('click', () => {
      const g = h.dataset.group
      h.classList.toggle('open')
      document.querySelector(`[data-kids="${g}"]`).classList.toggle('open')
    })
  })
}

function markActive(hash) {
  document.querySelectorAll('.nav-item').forEach(a => a.classList.remove('active'))
  const a = document.querySelector(`.nav-item[href="${hash}"]`)
  if (!a) return
  a.classList.add('active')
  const kids = a.closest('.nav-kids')
  if (kids && !kids.classList.contains('open')) {
    kids.classList.add('open')
    document.querySelector(`.nav-head[data-group="${kids.dataset.kids}"]`)?.classList.add('open')
  }
  a.scrollIntoView({ block: 'nearest' })
}

let pendingAnchor = null

/* ---------- 顶栏 / 移动目录 ---------- */
function markTopNav(hash) {
  const h = hash || '#/'
  let key = ''
  if (/^#\/?$/.test(h)) key = 'home'
  else if (/^#\/(map|pkg|layer|composition)/.test(h)) key = 'map'
  else if (h.startsWith('#/seams')) key = 'seams'
  else if (h.startsWith('#/events')) key = 'events'
  else if (h.startsWith('#/tools')) key = 'tools'
  else if (h.startsWith('#/about')) key = 'about'

  document.querySelectorAll('.nav a[data-nav]').forEach(a => {
    if (a.dataset.nav === key) a.setAttribute('aria-current', 'page')
    else a.removeAttribute('aria-current')
  })
  const src = document.getElementById('head-source')
  if (src) {
    if (/^#\/(files|code)/.test(h)) src.setAttribute('aria-current', 'page')
    else src.removeAttribute('aria-current')
  }
}

function closeSidebar() {
  const side = document.getElementById('sidebar')
  const backdrop = document.getElementById('side-backdrop')
  const toggle = document.getElementById('nav-toggle')
  side?.classList.remove('open')
  document.body.classList.remove('side-open')
  if (backdrop) backdrop.hidden = true
  toggle?.setAttribute('aria-expanded', 'false')
}

function initHeader() {
  const side = document.getElementById('sidebar')
  const backdrop = document.getElementById('side-backdrop')
  const toggle = document.getElementById('nav-toggle')
  const closeBtn = document.getElementById('side-close')

  const open = () => {
    if (!side) return
    side.classList.add('open')
    document.body.classList.add('side-open')
    if (backdrop) backdrop.hidden = false
    toggle?.setAttribute('aria-expanded', 'true')
    requestAnimationFrame(() => {
      const nav = document.getElementById('nav')
      if (!nav) return
      const active = nav.querySelector('.nav-item.active')
      if (active) active.scrollIntoView({ block: 'center' })
      else nav.scrollTop = 0
    })
  }
  const close = closeSidebar

  toggle?.addEventListener('click', open)
  closeBtn?.addEventListener('click', close)
  backdrop?.addEventListener('click', close)
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && side?.classList.contains('open')) close()
  })
  side?.addEventListener('click', e => {
    if (e.target.closest('a') && window.innerWidth <= 1000) close()
  })

  const meta = document.getElementById('head-meta')
  if (meta) {
    const v = META.version ? ` / v${META.version}` : ''
    meta.textContent = `ARCHIVE / ${PKGS.length} PKGS${v}`
  }
}

document.addEventListener('click', e => {
  const skip = e.target.closest('a.skip')
  if (skip) {
    e.preventDefault()
    const c = document.getElementById('content')
    c?.focus({ preventScroll: true })
    window.scrollTo(0, 0)
    return
  }
  const top = e.target.closest('a[data-top]')
  if (top) {
    e.preventDefault()
    window.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }
  const a = e.target.closest('a[data-anchor]')
  if (!a) return
  const id = a.dataset.anchor
  const el = document.getElementById(id)
  if (el) {
    e.preventDefault()
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  } else {
    pendingAnchor = id
  }
})

/** 表格统一包一层横向滚动容器；不改变表格语义与现有选择器 */
function wrapTables(scope) {
  scope.querySelectorAll('table').forEach(t => {
    if (t.parentElement?.classList.contains('table-wrap')) return
    const w = document.createElement('div')
    w.className = 'table-wrap'
    w.tabIndex = 0
    w.setAttribute('role', 'region')
    w.setAttribute('aria-label', '表格，可横向滚动')
    t.parentNode.insertBefore(w, t)
    w.appendChild(t)
  })
}

function docFooter() {
  const v = META.version ? ` / v${esc(META.version)}` : ''
  return `<footer class="doc-foot">
    <span>DEEPSEEK HARNESS / ARCHIVE${v}</span>
    <span><a href="#/">首页</a><span class="sep">/</span><a href="#/map">全站地图</a><span class="sep">/</span><a href="#/about">数据来源</a><span class="sep">/</span><a href="#content" data-top>回到顶部 ↑</a></span>
  </footer>`
}

/* ---------- 搜索 ---------- */
function initSearch() {
  const inp = document.getElementById('search')
  const box = document.getElementById('search-results')
  let idx = null

  const build = () => {
    if (idx) return idx
    idx = []
    for (const p of PKGS) { const dd = deepOf(p); idx.push({ kind: '包', name: p.short, sub: (dd?.oneLiner) || p.desc || p.group, href: `#/pkg/${p.group}/${p.dir}`, hay: `${p.short} ${p.name} ${p.desc} ${p.summary} ${p.group} ${dd?.oneLiner || ''}`.toLowerCase() }) }
    for (const s of SVCS) idx.push({ kind: '服务', name: `ctx.${s.key}`, sub: s.desc, href: `#/svc/${s.key}`, hay: `ctx.${s.key} ${s.desc} ${s.owners.join(' ')}`.toLowerCase() })
    for (const t of TOOLS) idx.push({ kind: '工具', name: t.names, sub: t.pkg, href: `#/tools`, hay: `${t.names} ${t.pkg} ${t.requires}`.toLowerCase() })
    for (const e of EVENTS) idx.push({ kind: '事件', name: e.name, sub: `${e.mode} · ${e.consumers.slice(0, 50)}`, href: `#/events`, hay: `${e.name} ${e.mode}`.toLowerCase() })
    for (const l of LAYERS) idx.push({ kind: '分层', name: l.title, sub: l.tagline, href: `#/layer/${l.id}`, hay: `${l.title} ${l.en} ${l.tagline} ${l.beginner}`.toLowerCase() })
    return idx
  }

  /* 相关性排序：精确名 > 名前缀 > 名字包含 > 描述包含。
     没有它，搜索 "shell" 会被一堆描述里恰好提到 shell 的
     client-ui-* 包淹没，反而找不到 shell 包本身。 */
  const score = (x, q) => {
    const n = x.name.toLowerCase().replace(/^ctx\./, '')
    if (n === q) return 0
    if (n === q + 's' || n + 's' === q) return 1          // shell / tools 单复数互认
    if (n.startsWith(q)) return 2
    if (n.includes(q)) return 3
    if (n.replace(/[^a-z0-9]/g, '') === q.replace(/[^a-z0-9]/g, '')) return 2
    return 4
  }
  // 同一分数内，更短的包名 = 更核心，排前面（在下方 sort 中内联）

  inp.addEventListener('input', () => {
    const q = inp.value.trim().toLowerCase()
    if (q.length < 1) { box.hidden = true; return }
    const hits = build()
      .filter(x => x.hay.includes(q))
      .map(x => ({ ...x, _s: score(x, q) }))
      .sort((a, b) => a._s - b._s || a.name.length - b.name.length || a.name.localeCompare(b.name))
      .slice(0, 16)
    if (!hits.length) { box.innerHTML = `<div class="sr-item" style="color:var(--tx-3)">无结果</div>`; box.hidden = false; return }
    box.innerHTML = hits.map(h =>
      `<a class="sr-item" href="${h.href}" style="text-decoration:none;display:block">
        <span class="sr-kind sr-k${h._s}">${h.kind}</span>
        <span class="sr-name">${esc(h.name)}</span>
        <span class="sr-sub">${esc(h.sub || '').slice(0, 70)}</span>
      </a>`).join('')
    box.hidden = false
  })

  box.addEventListener('click', e => { if (e.target.closest('a')) { box.hidden = true; inp.value = '' } })
  document.addEventListener('click', e => { if (!e.target.closest('.search-wrap')) box.hidden = true })
  inp.addEventListener('keydown', e => {
    if (e.key === 'Escape') { box.hidden = true; inp.blur() }
    if (e.key === 'Enter') { const a = box.querySelector('a'); if (a) location.hash = a.getAttribute('href') }
  })
  document.addEventListener('keydown', e => {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
    if (e.target.closest('input,textarea,select,[contenteditable="true"]')) return
    e.preventDefault()
    inp.focus()
    inp.select()
  })
}

/* ============================================================
   页面渲染
   ============================================================ */

/* ---------- 首页 ---------- */
function pageHome() {
  const spine = ['agent-loop', 'agent', 'session', 'system-prompt', 'tools', 'llm']
  const spineCards = spine.map((s, i) => {
    const p = byShort.get(s)
    if (!p) return ''
    return `<a class="card" href="#/pkg/${p.group}/${p.dir}">
      <span class="c-ico">${String(i + 1).padStart(2, '0')} / PACKAGE</span>
      <div class="c-title">${esc(p.short)}</div>
      <div class="c-en">packages/${p.group}/${p.dir}</div>
      <div class="c-desc">${esc(((deepOf(p)?.oneLiner) || p.desc || '').slice(0, 96))}</div>
      <span class="c-tag">${p.srcFiles} FILES / ${p.srcLoc.toLocaleString()} LOC</span>
    </a>`
  }).join('')

  const path = ['cordis', 'composition', 'spine', 'session', 'prompt', 'tools', 'llm', 'seam', 'scope']
  const pathRows = path.map((id, i) => {
    const l = LAYERS.find(x => x.id === id)
    if (!l) return ''
    return `<tr>
      <td><strong style="color:var(--blue);font-family:var(--mono)">${String(i + 1).padStart(2, '0')}</strong></td>
      <td><a href="#/layer/${id}"><strong>${esc(l.title)}</strong></a> <span style="color:var(--ink-3);font-size:11px;font-family:var(--mono)">${esc(l.en)}</span></td>
      <td style="font-size:12.5px">${esc(l.tagline)}</td>
    </tr>`
  }).join('')

  return `
  <section class="hero hero-home">
    <div class="hero-copy">
      <p class="kicker"><span class="live-dot"></span>DEEPSEEK HARNESS / FIELD MANUAL 001</p>
      <h1><span>一切皆插件的</span><span>Agent Harness</span></h1>
      <p class="lede">DeepSeek Harness（<code>dsh</code>）是 DeepSeek AI 开源的 agent harness，建立在 <strong>everything-is-a-plugin</strong> 架构之上，底层是 Cordis 插件框架。本站把它从根到叶完整拆开。</p>
      <div class="actions">
        <a class="btn btn-primary" href="#/layer/cordis">开始阅读</a>
        <a class="text-link" href="#/map">查看全站地图 →</a>
      </div>
    </div>
    <div class="hero-figure">
      <div class="fig-top hero-mobile-top"><span><b>FIG. 00</b> / TURN LOOP</span><span>MOBILE VIEW</span></div>
      <figure class="plate hero-plate">
        <div class="plate-bar"><span>PLATE 01 / TURN LOOP</span><span class="live"><i></i>SCHEMATIC</span></div>
        <svg class="hero-svg" viewBox="0 0 720 560" role="img" aria-label="dsh turn loop：六个核心包围绕 agent-loop，蓝色路径表示一次 turn 的流转。">
          <defs><pattern id="hero-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#202020" stroke-width="1"/></pattern></defs>
          <rect width="720" height="560" fill="url(#hero-grid)" opacity=".65"/>
          <g fill="none" stroke="#2E2E2E" stroke-width="1">
            <path d="M360 64V498" stroke-dasharray="3 7"/>
            <path d="M90 280H632" stroke-dasharray="3 7"/>
          </g>
          <g font-family="Geist Mono, Noto Sans SC, monospace" font-size="11" fill="#8B8B8B" letter-spacing=".04em">
            <text x="24" y="36">ONE TURN / SIX PACKAGES</text>
            <text x="24" y="536">SOLID = CALL / DASHED = INJECT</text>
            <text x="596" y="36" text-anchor="end">SCHEMATIC</text>
          </g>
          <g fill="none" stroke="#3A3A3A" stroke-width="1">
            <path d="M120 154L342 286"/><path d="M120 280L330 292"/><path d="M360 144V254"/>
            <path d="M586 166L394 274"/><path d="M586 392L394 312"/>
          </g>
          <g fill="none" stroke="#4C8DFF" stroke-width="1.8">
            <path d="M144 276Q256 262 336 148"/>
            <path d="M386 140Q506 150 580 180"/>
            <path d="M608 206Q638 300 606 374"/>
            <path d="M582 414Q386 512 156 312"/>
          </g>
          <g fill="#4C8DFF">
            <circle cx="236" cy="232" r="4"/><circle cx="486" cy="152" r="4"/>
            <circle cx="632" cy="292" r="4"/><circle cx="380" cy="474" r="4"/>
          </g>
          <g font-family="Geist Mono, Noto Sans SC, monospace" font-size="10" fill="#5E6B80">
            <text x="248" y="208">assemble</text>
            <text x="468" y="136">llm/stream</text>
            <text x="636" y="330">tool/call</text>
            <text x="330" y="508">append</text>
          </g>
          <g>
            <circle cx="120" cy="130" r="22" fill="#3A5BC7"/><circle cx="120" cy="130" r="29" fill="none" stroke="#14823E" stroke-width="1.5"/>
            <circle cx="120" cy="300" r="24" fill="#107D98"/><circle cx="120" cy="300" r="32" fill="none" stroke="#14823E" stroke-width="1.5"/>
            <circle cx="360" cy="120" r="20" fill="#6550B9"/><circle cx="360" cy="120" r="27" fill="none" stroke="#007E7F" stroke-width="1.5"/>
            <circle cx="610" cy="160" r="22" fill="#3A5BC7"/><circle cx="610" cy="160" r="29" fill="none" stroke="#007E7F" stroke-width="1.5"/>
            <circle cx="610" cy="420" r="24" fill="#107D98"/><circle cx="610" cy="420" r="32" fill="none" stroke="#14823E" stroke-width="1.5"/>
          </g>
          <g text-anchor="middle" font-family="Geist Mono, Noto Sans SC, monospace" font-size="11" fill="#F3F3F3">
            <text x="120" y="180">agent</text>
            <text x="120" y="350">session</text>
            <text x="360" y="172">system-prompt</text>
            <text x="610" y="210">llm</text>
            <text x="610" y="470">tools</text>
          </g>
          <g>
            <circle cx="360" cy="300" r="38" fill="#111" stroke="#F3F3F3" stroke-width="1.2"/>
            <circle cx="360" cy="300" r="8" fill="#0B66D6"/>
            <circle cx="360" cy="300" r="50" fill="none" stroke="#4C8DFF" stroke-width="1.8"/>
            <text x="360" y="372" text-anchor="middle" font-family="Geist Mono, Noto Sans SC, monospace" font-size="12" fill="#F3F3F3">agent-loop</text>
          </g>
          <g font-family="Geist Mono, Noto Sans SC, monospace" font-size="9" fill="#8B8B8B" letter-spacing=".04em">
            <text x="24" y="72">MODEL / TOOLS / SESSION</text>
            <text x="596" y="508" text-anchor="end">CONTEXT IS SHARED</text>
          </g>
        </svg>
        <figcaption><b>fig. 00</b> — one turn / six packages / one shared context</figcaption>
      </figure>
      <div class="hero-mobile">
        <div class="m-layer"><span>01</span><b>agent-loop</b><em>turn / step 循环与执行驱动</em></div>
        <div class="m-layer"><span>02</span><b>agent</b><em>身份、注册表与生命周期</em></div>
        <div class="m-layer"><span>03</span><b>session</b><em>append-only 会话日志</em></div>
        <div class="m-layer"><span>04</span><b>system-prompt</b><em>上下文组装与提示词</em></div>
        <div class="m-layer"><span>05</span><b>tools</b><em>工具注册表与执行管道</em></div>
        <div class="m-layer"><span>06</span><b>llm</b><em>模型接入与流式响应</em></div>
      </div>
    </div>
  </section>

  <div class="spec-strip">
    <div><b>${PKGS.length}</b><span>NPM 包 / PACKAGES</span></div>
    <div><b>${byGroup.size}</b><span>能力分组 / GROUPS</span></div>
    <div><b>${SVCS.length}</b><span>核心服务 / SERVICES</span></div>
    <div><b>${TOOLS.length}</b><span>模型工具 / TOOLS</span></div>
    <div><b>${EVENTS.length}</b><span>类型化事件 / EVENTS</span></div>
    <div><b>5</b><span>启动形态 / PROFILES</span></div>
  </div>

  <section class="chapter">
    <div class="chapter-head">
      <span class="fig">FIG. 01</span>
      <h2>一句话抓住它是什么</h2>
      <p class="note">EVERYTHING IS A PLUGIN / CORDIS</p>
    </div>
    <div class="chapter-body">
      <div class="chapter-copy">
        <p class="lead">dsh 是一台<strong>由插件拼装起来的 AI 智能体引擎</strong>。它没有需要打补丁的核心——模型适配器、工具注册表、会话日志、连"agent 循环"本身都是插件，都能从配置里换掉。</p>
        <p>你启动它时，它做的事情是<strong>按顺序把一堆插件插到一根共享上下文上</strong>，插件之间通过服务名互相找到彼此。</p>
        <p class="margin-note">这里没有"主板"：每个包都通过 ctx 上的服务名咬合。替换一个提供者，整个产品的行为随之改变。</p>
      </div>
      <div>
        <div class="plain">
          <div class="t">通俗复述 / IN PLAIN WORDS</div>
          <p>想象一台乐高机器：没有"主板"这种东西，所有零件都是同规格的乐高块，靠凸点（服务名）互相咬合。想换马达？拔下来插一个新的，机器照常运转。dsh 就是这样。</p>
        </div>
        <blockquote class="principle-quote"><small>DESIGN PRINCIPLE</small>它把「可替换」做成了结构本身，而不是事后加的功能。</blockquote>
      </div>
    </div>
  </section>

  <section class="chapter">
    <div class="chapter-head">
      <span class="fig">FIG. 02</span>
      <h2>核心脊柱：一个 turn 流过六个包</h2>
      <p class="note">TURN / STEP / TOOL CALL</p>
    </div>
    <p class="lead">一次对话往返叫一个 <strong>turn</strong>。turn 里可以包含 0 到多个 <strong>step</strong>，一个 step = 一次模型请求 + 它引发的工具调用。这六个包构成循环的主干：</p>
    <div class="grid">${spineCards}</div>
  </section>

  <section class="chapter">
    <div class="chapter-head">
      <span class="fig">FIG. 03</span>
      <h2>推荐阅读路径</h2>
      <p class="note">PATH / 01—09 / START TO SOURCE</p>
    </div>
    <p class="lead">按顺序走完这条路径，你会从"完全不懂"到"能看懂源码"。</p>
    <table>
      <thead><tr><th style="width:52px">NO.</th><th>章节</th><th style="width:40%">你会得到什么</th></tr></thead>
      <tbody>
        ${pathRows}
        <tr><td><strong style="color:var(--running);font-family:var(--mono)">→</strong></td>
          <td><a href="#/map"><strong>全站地图</strong></a></td>
          <td style="font-size:12.5px">按能力域浏览全部 ${PKGS.length} 个包</td></tr>
        <tr><td><strong style="color:var(--running);font-family:var(--mono)">→</strong></td>
          <td><a href="#/seams"><strong>能力接缝总表</strong></a></td>
          <td style="font-size:12.5px">${SVCS.length} 个服务、谁定义、谁实现、谁消费</td></tr>
      </tbody>
    </table>
  </section>

  <section class="chapter">
    <div class="chapter-head">
      <span class="fig">FIG. 04</span>
      <h2>它的四个根本设计</h2>
      <p class="note">STRUCTURE / TRUTH / CONFIG</p>
    </div>
    <div class="notes-grid">
      <div class="note-item">
        <span class="n">01</span>
        <div><h3>没有特权核心</h3><p>你通过"在旁边挂一个插件"来扩展 dsh。注册即副作用（effect），插件卸载时自动回滚。</p></div>
      </div>
      <div class="note-item">
        <span class="n">02</span>
        <div><h3>能力接缝</h3><p>一个能力拆成「服务定义 / 提供者 / 消费者」三角色。换一个提供者，整个产品的行为就变了。</p></div>
      </div>
      <div class="note-item">
        <span class="n">03</span>
        <div><h3>日志即真相</h3><p>会话日志是唯一信源，模型历史从日志推导。"模型可见就意味着被记录"，有运行时不变式断言。</p></div>
      </div>
      <div class="note-item">
        <span class="n">04</span>
        <div><h3>配置即产品</h3><p>profile 决定叠哪些 bundle。同一个启动器，五种形态，全靠配置行的分层覆盖。</p></div>
      </div>
    </div>
  </section>

  <section class="chapter">
    <div class="chapter-head">
      <span class="fig">FIG. 05</span>
      <h2>怎么用这个站</h2>
      <p class="note">SEARCH / TRACE / READ</p>
    </div>
    <div class="mech">
      <div class="mech-row"><div class="mech-k">01 / 左侧目录</div><div class="mech-v">按能力分组列出全部 ${PKGS.length} 个包，点组名展开。当前所在页会自动高亮并滚到可见。</div></div>
      <div class="mech-row"><div class="mech-k">02 / 搜索</div><div class="mech-v">同时搜<strong>包、服务、事件、工具、分层</strong>。按 <code>/</code> 聚焦搜索框，输入即出结果，回车跳第一个。</div></div>
      <div class="mech-row"><div class="mech-k">03 / 点击溯源</div><div class="mech-v">页面里的 <code>包名</code> 标签都能点。从任意包出发，顺着依赖链一路追下去。</div></div>
      <div class="mech-row"><div class="mech-k">04 / 左右分屏</div><div class="mech-v">点「读源码」在右侧打开源码面板，左侧讲解不丢滚动位置；想整页看再点面板里的「整页 ↗」。</div></div>
    </div>
  </section>

  <section class="cta-black">
    <div class="cta-inner">
      <div>
        <p class="eyebrow">OPEN THE SOURCE / 打开源码</p>
        <h2>把黑箱，<br>拆到能改。</h2>
        <p>从全站地图进入任意能力域，或者直接打开源码浏览器。所有讲解都带可点击的包名、服务名和行号。</p>
        <div class="actions">
          <a class="btn btn-primary" href="#/files">打开源码浏览器</a>
          <a class="text-link" href="#/seams">查看能力接缝 →</a>
        </div>
      </div>
      <div class="cta-side">
        <b>DSH / ${esc(META.version || 'unknown')}</b><br>
        ${PKGS.length} PACKAGES · ${SVCS.length} SERVICES<br>
        ${DEEP_N} DEEP READS<br>
        FIELD MANUAL 001 / ARCHIVE
      </div>
    </div>
  </section>
  `
}

/* ---------- 全站地图 ---------- */
function pageMap() {
  const order = ['core', 'bundle', 'boot', 'llm', 'session', 'session-query', 'shell', 'subprocess', 'ssh', 'terminal', 'sandbox', 'fs', 'ptc-runtime', 'lsp', 'skill', 'context', 'compaction', 'todo', 'plan', 'interaction', 'subagent', 'jobs', 'workflow', 'goal', 'schedule', 'guard', 'hooks', 'extensions', 'web', 'webhook', 'mcp', 'browser-use', 'computer-use', 'document', 'deliverables', 'attachment', 'spill', 'storage', 'settings', 'credentials', 'identity', 'preset', 'workspace', 'api', 'typert', 'host', 'client', 'acp', 'sdk', 'telemetry', 'feedback', 'experimental', 'test-support', 'util']
  const rest = [...byGroup.keys()].filter(g => !order.includes(g))
  const sorted = [...order.filter(g => byGroup.has(g)), ...rest]

  return `
  <div class="page-head">
    <div class="page-head-inner">
      <div>
        <p class="eyebrow">ARCHIVE / MAP</p>
        <h1>全站地图</h1>
        <p class="lead">按能力域组织的完整包清单，共 <strong>${PKGS.length}</strong> 个包、<strong>${byGroup.size}</strong> 个能力域。其中 <strong>${DEEP_N}</strong> 个包已完成逐包源码精读${PKGS.length - DEEP_N ? `；其余 <strong>${PKGS.length - DEEP_N}</strong> 个目前只到「依赖关系 + 源码入口」这一层` : ''}。</p>
      </div>
      <aside class="page-head-side">
        <div class="row"><span>PACKAGES</span><b>${PKGS.length}</b></div>
        <div class="row"><span>GROUPS</span><b>${byGroup.size}</b></div>
        <div class="row"><span>DEEP READ</span><b>${DEEP_N} / ${PKGS.length}</b></div>
      </aside>
    </div>
  </div>

  <div class="layer-nav">
    ${sorted.map(g => `<a href="#/map" data-anchor="group-${esc(g)}">${esc((GROUP_META[g] || { zh: g }).zh)}</a>`).join('')}
  </div>

  ${sorted.map(g => {
    const meta = GROUP_META[g] || { zh: g, d: '' }
    const kids = byGroup.get(g)
    return `<section class="map-group" id="group-${esc(g)}">
      <div class="map-group-head">
        <h3>${esc(meta.zh)}</h3>
        <code>packages/${esc(g)}</code>
        <span class="badge">${kids.length}</span>
      </div>
      <p>${esc(meta.d)}</p>
      <div class="deps">${kids.map(p => pkgLink(p.short)).join('')}</div>
    </section>`
  }).join('')}

  <div class="related"><h3>继续探索 / CONTINUE</h3>
    <div class="deps">
      <a class="dep" href="#/seams">能力接缝（${SVCS.length}）</a>
      <a class="dep" href="#/events">事件矩阵（${EVENTS.length}）</a>
      <a class="dep" href="#/tools">工具目录（${TOOLS.length}）</a>
      <a class="dep" href="#/composition">组合与启动</a>
    </div>
  </div>`
}

/* ---------- 分层页 ---------- */
function pageLayer(id) {
  const l = LAYERS.find(x => x.id === id)
  if (!l) return `<div class="empty">未找到该分层</div>`
  const i = LAYERS.indexOf(l)
  const prev = LAYERS[i - 1], next = LAYERS[i + 1]

  const layerNo = String(i + 1).padStart(2, '0')
  let body = `
  <div class="crumb"><a href="#/">首页</a><span>/</span>分层深入<span>/</span>${esc(l.title)}</div>
  <div class="hero hero-split">
    <div class="hero-copy">
      <div class="kicker">${esc(l.en)}</div>
      <h1>${esc(l.title)}</h1>
      <p>${esc(l.tagline)}</p>
    </div>
    <aside class="hero-side">
      <div class="side-title">LAYER / ${layerNo} OF ${String(LAYERS.length).padStart(2, '0')}</div>
      <div class="row"><span>PREVIOUS</span><b>${prev ? esc(prev.title) : '—'}</b></div>
      <div class="row"><span>NEXT</span><b>${next ? esc(next.title) : '—'}</b></div>
      <div class="row"><span>MECHANISMS</span><b>${(l.mechanics || []).length}</b></div>
      <div class="row"><span>STATUS</span><b>DECONSTRUCTED</b></div>
    </aside>
  </div>

  <h2>它是什么</h2>
  <p class="lead">${l.beginner}</p>`

  if (l.mechanics?.length) {
    body += `<h2>关键机制</h2><div class="mech">${l.mechanics.map(m =>
      `<div class="mech-row"><div class="mech-k">${esc(m.k)}</div><div class="mech-v">${md(m.v)}</div></div>`).join('')}</div>`
  }

  if (l.dispatch) {
    body += `<h2>五种事件派发模式</h2>
    <p>事件是 Cordis 的扩展点。"派发模式"是事件公开契约的一部分——决定了监听者能否改变结果、能否并行。选对模式是设计事件时的第一个决定。</p>
    <table>
      <thead><tr><th>模式</th><th>等待?</th><th>派发顺序</th><th>有返回值?</th><th>用来做什么</th></tr></thead>
      <tbody>${l.dispatch.map(d => `<tr>
        <td><code>${d.mode}</code></td><td>${d.awaited}</td><td>${esc(d.order)}</td>
        <td>${d.ret}</td><td style="font-size:12.5px">${esc(d.use)}</td></tr>`).join('')}
      </tbody>
    </table>
    <div class="note">
      <span class="t">waterfall 是洋葱模型</span>
      监听者收到 <code>(...args, next)</code>。调用 <code>next()</code> 把可能被包装过的结果委托给下一个服务；不调用 <code>next()</code> 直接返回就<strong>短路</strong>。值通过 <code>next()</code> 的返回值向上传递。
    </div>`
  }

  if (l.flow) {
    const nodes = [
      ['turn/start', 'durable', 'sessions'], ['pre-step 决策', 'live', 'agents'], ['step/start', 'durable', 'sessions'],
      ['组装提示词+历史', 'live', 'systemPrompt'], ['llm/stream', 'live', 'llm'], ['assistant/message', 'durable', 'sessions'],
      ['tool/call', 'durable', 'tools'], ['工具执行管道', 'live', 'tools'], ['tool/result', 'durable', 'tools'],
      ['step/end', 'durable', 'sessions'], ['turn-stopping', 'live', 'agents'], ['turn/end', 'durable', 'sessions'],
    ]
    body += `<h2>一个 turn 的完整流程</h2>
    <p>这是全系统最核心的一张图。<strong>每个节点都可以点击</strong>，跳到对应的服务或事件说明。</p>
    <div class="flow">
      ${nodes.map(([n, k, svc], idx) => `<a class="flow-node ${k}" href="#/svc/${svc}" title="ctx.${svc}">${esc(n)}</a>${idx < nodes.length - 1 ? '<span class="flow-arrow">→</span>' : ''}`).join('')}
      <div class="flow-legend">
        <span><i style="background:var(--success)"></i>持久会话事件（进日志，可重放）</span>
        <span><i style="background:var(--warning)"></i>实时扩展点（进程内，不持久）</span>
      </div>
    </div>
    <div class="plain">
      <div class="t">这段话在说什么</div>
      <p>一次对话往返（turn）里，agent 先<strong>开门</strong>（turn/start），然后做一次<strong>预检</strong>（pre-step，问所有插件"这批输入要不要放行、要不要改写"）。</p>
      <p>放行后进入 step：把系统提示词和历史组装好，发给模型（llm/stream），模型流式回话。如果模型说"我要调用工具"，就逐个执行（每个都先记录 tool/call，跑完记录 tool/result），然后把结果再发一轮。直到模型不再要求工具、也没有新输入——<strong>关门</strong>（turn/end）。</p>
    </div>`
  }

  if (l.bundles) {
    const bmeta = {
      base: ['共享核心', 'web / headless / sdk / acp 四个 profile 的共同第一层'],
      'web-app': ['Web 界面', '在 base 上叠加浏览器应用、Host、Remote 层'],
      headless: ['一次性任务', '无服务器，直接跑一个任务并打印结果'],
      'sdk-app': ['SDK 服务', '叠加 JSON-RPC over stdio 服务端'],
      'acp-app': ['ACP 服务', '叠加仅用于自动化的 Agent Client Protocol 服务'],
      'sdk-minimal': ['独立最小树', '刻意的例外：一个 bundle 拥有完整显式 SDK 树，不套用 base'],
    }
    body += `<h2>五个内置 bundle</h2>
    <table>
      <thead><tr><th>bundle</th><th>角色</th><th>说明</th><th style="width:70px">行数</th></tr></thead>
      <tbody>${Object.entries(BUNDLES).map(([b, rows]) => {
        const [role, d] = bmeta[b] || ['', '']
        return `<tr><td><code>dsh-${b}</code></td><td><strong>${esc(role)}</strong></td>
          <td style="font-size:12.5px">${esc(d)}</td>
          <td><span class="badge">${rows.length}</span></td></tr>`
      }).join('')}
      </tbody>
    </table>
    <div class="note warn">
      <span class="t">补丁是替换，不是合并</span>
      一个补丁条目<strong>整体替换</strong>目标行的 config。所以你改写时，必须把想保留的每个字段都重新写全——这是新手最容易踩的坑。
    </div>`
  }

  if (l.seams) {
    const seamList = SVCS.filter(s => (s.providers||[]).length > 0)
    body += `<h2>${SVCS.length} 个核心服务</h2>
    <p>下面是全部注册在 <code>ctx</code> 上的服务。带 <span class="badge ok">接缝</span> 标记的是"可替换能力"（有独立提供者），其余是核心脊柱服务或组合点。</p>
    <div class="svc-grid">${seamList.slice(0, 12).map(s => svcCard(s)).join('')}</div>
    <p style="margin-top:14px"><a href="#/seams">查看全部 ${SVCS.length} 个服务 →</a></p>`
  }

  if (l.pipeline) {
    const layers = [
      ['1', 'tool/call', '先记录：把调用写进会话日志', 'durable'],
      ['2', 'tools/pre-execute', '瀑布：钩子、权限、沙箱策略', 'live'],
      ['3', '单调守卫', '注册的守卫：拒绝或弃权；身份受保护', 'live'],
      ['4', 'ctx.approval', '一次性询问人类；缺失或无法回答 = 拒绝', 'live'],
      ['5', 'tools/execute', '瀑布（around）：超时、重试、指标', 'live'],
      ['6', 'tool body', '工具自己的 execute() 实现', 'live'],
      ['7', 'tools/post-execute', '瀑布：接受、阻止、替换、追加上下文', 'live'],
      ['8', 'finalizeContent', '工具定义自有的最后内容不变式', 'live'],
      ['9', 'tools/result', '同步通知：冻结的权威结果', 'durable'],
    ]
    body += `<h2>工具执行的九段管道</h2>
    <p>一次工具调用不是"直接跑函数"，而是穿过这条管道。这样钩子和策略能<strong>横跨所有工具家族</strong>，而工具本身不需要知道任何策略服务。</p>
    <div class="mech">${layers.map(([n, name, d, k]) =>
      `<div class="mech-row">
        <div class="mech-k" style="color:${k === 'durable' ? 'var(--ac-2)' : 'var(--ac-3)'}">${n}. ${esc(name)}</div>
        <div class="mech-v">${esc(d)}</div></div>`).join('')}</div>
    <div class="plain">
      <div class="t">通俗复述</div>
      <p>模型说"帮我删掉这个文件"。这句话不是直接变成删除操作，而是先<strong>登记</strong>（tool/call），然后过<strong>一层层安检</strong>：策略说这个路径允许吗？守卫说过不过分？要不要问用户？</p>
      <p>全部通过才真正执行。执行完还要过<strong>出站安检</strong>（结果要不要截断、要不要替换成别的形式），最后<strong>登记结果</strong>（tool/result）。任何一层都可以把它拦下来，而且日志里两份记录都在——你能完整追溯"模型想做什么"和"实际做了什么"。</p>
    </div>`
  }

  if (l.codeRefs) {
    body += `<h2>关键源码</h2>
    <p style="font-size:13px">想自己读代码，从这些位置开始。下面是从仓库里提取的<strong>真实源码片段</strong>。
    装了本地服务后，可以直接<strong>在站内读全文</strong>（点每段右上角的「读全文」）。</p>`
    let shown = 0
    for (const f of l.codeRefs) {
      const hit = Object.values(CODE).find(c => c.file === f)
      if (hit) {
        body += `<div class="code">
          <div class="code-head">
            <span class="lbl">${esc(hit.label)}</span>
            <span style="display:flex;gap:10px;align-items:center">
              ${hit.line ? `<a class="code-live" href="#/code/${encodeURI(hit.file)}:${hit.line}">读全文 →</a>` : `<a class="code-live" href="#/code/${encodeURI(hit.file)}">读全文 →</a>`}
              <a class="code-live" data-tree="${esc(hit.file)}" href="#/files" title="在右侧文件树里定位这个文件">TREE</a>
              <span>${esc(hit.file)}</span>
            </span>
          </div>
          <pre>${hl(hit.code)}</pre>
        </div>`
        shown++
      } else {
        body += `<div class="code">
          <div class="code-head"><span class="lbl">源文件</span><span>打开仓库查看</span></div>
          <pre>${esc(f)}</pre>
        </div>`
      }
    }
  }

  body += `<div class="related"><h3>继续 / CONTINUE</h3>
    <div class="deps">
      ${prev ? `<a class="dep" href="#/layer/${prev.id}">← ${esc(prev.title)}</a>` : ''}
      <a class="dep" href="#/map">全站地图</a>
      ${next ? `<a class="dep" href="#/layer/${next.id}">${esc(next.title)} →</a>` : ''}
    </div>
  </div>`

  return body
}

/* ---------- 服务卡 ---------- */
function svcCard(s) {
  const providers = s.providers || []
  const isSeam = providers.length > 0
  return `<div class="svc">
    <div class="k">ctx.${esc(s.key)} ${isSeam ? '<span class="badge ok" style="font-size:9px;padding:1px 6px">接缝</span>' : ''}</div>
    <div class="d">${esc(s.desc)}</div>
    ${s.definer ? `<div class="o"><b>定义于 </b>${pkgLink(depShort(s.definer))}</div>` : ''}
    ${providers.length ? `<div class="o" style="margin-top:4px"><b>提供者 </b>${providers.map(o => pkgLink(depShort(o))).join(' ')}</div>` : ''}
    ${s.consumers?.length ? `<div class="o" style="margin-top:4px"><b>消费者 </b>${s.consumers.slice(0, 6).map(o => pkgLink(depShort(o))).join(' ')}${s.consumers.length > 6 ? ` <span style="color:var(--tx-3)">+${s.consumers.length - 6}</span>` : ''}</div>` : ''}
  </div>`
}

/* ---------- 服务总表 ---------- */
function pageSeams() {
  const seams = SVCS.filter(s => (s.providers||[]).length > 0)
  const spine = SVCS.filter(s => (s.providers||[]).length === 0)
  return `
  <div class="crumb"><a href="#/">首页</a><span>/</span>能力接缝</div>
  <div class="page-head">
    <div class="page-head-inner">
      <div>
        <p class="eyebrow">ARCHIVE / SEAMS</p>
        <h1>能力接缝</h1>
        <p class="lead">一个<strong>接缝（seam）</strong>是可替换的能力，由三个角色构成：<strong>服务定义</strong>（声明接口、占用 ctx key）、<strong>服务提供者</strong>（具体实现）、<strong>消费者</strong>（使用它的东西，通常是模型面向的工具）。<br><br>文件系统和子进程提供者共享同一个"执行世界"，把它们指向远程沙箱，<strong>Bash、PTY、LSP 会一起搬过去</strong>，不需要给任何提供者写分支代码。</p>
      </div>
      <aside class="page-head-side">
        <div class="row"><span>CTX SERVICES</span><b>${SVCS.length}</b></div>
        <div class="row"><span>SEAMS</span><b>${seams.length}</b></div>
        <div class="row"><span>SPINE</span><b>${spine.length}</b></div>
      </aside>
    </div>
  </div>

  <div class="stats">
    <div class="stat"><div class="n">${SVCS.length}</div><div class="l">ctx 服务总数</div></div>
    <div class="stat"><div class="n">${seams.length}</div><div class="l">可替换接缝</div></div>
    <div class="stat"><div class="n">${PKGS.length}</div><div class="l">参与包数</div></div>
  </div>

  <div class="note ok">
    <span class="t">三个角色是怎么看出来的</span>
    以 <code>ctx.shell</code> 为例：<strong>定义</strong>是 <code>shell</code> 包（它声明抽象类 <code>ShellExecutor</code> 并占用 ctx key），<strong>提供者</strong>是 <code>bash-local</code> / <code>bash-sandbox</code> / <code>pwsh-local</code>，<strong>消费者</strong>是 <code>tool-bash</code> / <code>tool-pwsh</code> 和两个钩子桥。把 <code>bash-local</code> 换成 <code>bash-sandbox</code>，模型看到的工具一字未改，但每条命令都进了沙箱。
  </div>

  <h2>可替换接缝 <span class="badge">${seams.length}</span></h2>
  <p style="font-size:13px">有独立提供者的能力——换掉提供者就改变了产品行为。</p>
  <div class="svc-grid">${seams.map(svcCard).join('')}</div>

  <h2>脊柱服务与组合点 <span class="badge">${spine.length}</span></h2>
  <p style="font-size:13px">这些服务把核心能力或注册表放在 ctx 上，由单个包声明。它们是"每个组合都会启动的那一层"，其余插件按键找到它们。</p>
  <div class="svc-grid">${spine.map(svcCard).join('')}</div>`
}

/* ---------- 事件矩阵 ---------- */
/** 把事件矩阵里的 markdown 链接语法 [name](path) 压成可点击的包名。 */
function evPkgs(cell) {
  const raw = String(cell || '').trim()
  if (!raw || raw === '-') return '<span style="color:var(--tx-3)">—</span>'
  const out = []
  const re = /\[`?([^\]`]+)`?\]\(([^)]+)\)/g
  let m
  while ((m = re.exec(raw))) {
    const short = depShort(m[1])
    const p = byShort.get(short)
    out.push(p
      ? `<a class="dep" href="#/pkg/${p.group}/${p.dir}">${esc(short)}</a>`
      : `<span class="dep">${esc(short)}</span>`)
  }
  // 未被 markdown 链接包住的裸名字（例如 remotes、server）
  const leftovers = raw.replace(re, '').replace(/[,\s`()]+/g, ' ').trim()
  if (leftovers) {
    for (const tok of leftovers.split(/\s+/).filter(Boolean)) {
      out.push(`<span class="dep" style="border-style:dashed">${esc(tok)}</span>`)
    }
  }
  return out.join('') || '<span style="color:var(--tx-3)">—</span>'
}

function pageEvents() {
  const modes = {}
  for (const e of EVENTS) (modes[e.mode] ||= []).push(e)
  const modeDesc = {
    emit: '广播通知，无返回值。监听者只观察，不能改变结果。',
    waterfall: '洋葱模型中间件。监听者拿到 next()，可包装结果或直接短路。',
    parallel: '所有监听者并行执行，等待全部完成，无返回值。',
    serial: '按注册顺序串行执行，等待完成，有返回值。',
    bail: '顺序执行直到有人返回非空值，立即停止并采用该值。',
  }
  return `
  <div class="crumb"><a href="#/">首页</a><span>/</span>事件矩阵</div>
  <div class="page-head">
    <div class="page-head-inner">
      <div>
        <p class="eyebrow">ARCHIVE / EVENTS</p>
        <h1>事件矩阵</h1>
        <p class="lead"><strong>事件生产者与消费者矩阵。</strong>事件是 Cordis 的扩展点，也是决定"新行为挂哪里"的第一决策。<strong>派发模式是事件公开契约的一部分</strong>——它决定了监听者能否改变结果、能否并行。<br><br>共 ${EVENTS.length} 个 harness 自有事件，按派发模式分组如下。表格里的包名都可以点击。</p>
      </div>
      <aside class="page-head-side">
        <div class="row"><span>EVENTS</span><b>${EVENTS.length}</b></div>
        <div class="row"><span>MODES</span><b>${Object.keys(modes).length}</b></div>
        <div class="row"><span>SPINE</span><b>5</b></div>
      </aside>
    </div>
  </div>

  <div class="layer-nav">
    ${Object.entries(modes).sort((a, b) => b[1].length - a[1].length)
      .map(([m, list]) => `<a href="#/events" data-anchor="events-${m}">${m} · ${list.length}</a>`).join('')}
  </div>

  ${Object.entries(modes).sort((a, b) => b[1].length - a[1].length).map(([m, list]) => `
    <h2 id="events-${m}"><code>${m}</code> <span class="badge">${list.length}</span></h2>
    <p style="font-size:13px">${esc(modeDesc[m] || '')}</p>
    <table style="table-layout:fixed">
      <thead><tr><th style="width:24%">事件</th><th style="width:34%">生产者</th><th>消费者</th></tr></thead>
      <tbody>${list.map(e => `<tr>
        <td><code style="white-space:normal;word-break:break-all">${esc(e.name)}</code></td>
        <td>${evPkgs(e.producers)}</td>
        <td>${evPkgs(e.consumers)}</td>
      </tr>`).join('')}</tbody>
    </table>`).join('')}

  <div class="note warn">
    <span class="t">选事件的三个判据</span>
    <strong>1)</strong> 这个事实必须活过重启吗？→ <strong>会话事件</strong>（追加到日志，通过 <code>session/event</code> 广播）。<br>
    <strong>2)</strong> 是飞行中要观察或拦截的工作吗？→ <strong>agent/* 事件</strong>（携带活的 Agent）。<br>
    <strong>3)</strong> 是给某个接缝挂策略或适配器吗？→ <strong>能力事件</strong>（<code>fs/*</code>、<code>tools/*</code>、<code>telemetry/*</code>），不 import 循环。
  </div>`
}

/* ---------- 工具目录 ---------- */
function pageTools() {
  const toolPkgs = new Set(TOOLS.map(t => t.pkg)).size
  return `
  <div class="crumb"><a href="#/">首页</a><span>/</span>工具目录</div>
  <div class="page-head">
    <div class="page-head-inner">
      <div>
        <p class="eyebrow">ARCHIVE / TOOLS</p>
        <h1>工具目录</h1>
        <p class="lead"><strong>模型面向的工具目录。</strong>每个出厂插件贡献给 <code>ctx.tools</code> 的工具：模型通过系统提示词组装收到的 <code>name</code>、<code>description</code> 和 JSON-Schema <code>parameters</code>。<br><br>这份目录是<strong>把每个工具插件在真实 context 上启动后读出来的</strong>——因为工具 schema 不是静态可知的（运行期展开的枚举、拼接的描述、配置驱动的名字）。</p>
      </div>
      <aside class="page-head-side">
        <div class="row"><span>TOOLS</span><b>${TOOLS.length}</b></div>
        <div class="row"><span>PACKAGES</span><b>${toolPkgs}</b></div>
        <div class="row"><span>SCHEMA</span><b>RUNTIME</b></div>
      </aside>
    </div>
  </div>

  <h2>全部工具 <span class="badge">${TOOLS.length}</span></h2>
  <table style="table-layout:fixed">
    <thead><tr><th style="width:30%">模型可见工具名</th><th style="width:24%">所属包</th><th>依赖的接缝 / 服务</th></tr></thead>
    <tbody>${TOOLS.map(t => `<tr>
      <td><code style="white-space:normal">${esc(t.names)}</code></td>
      <td>${pkgLink(t.pkg.replace('@deepseek-ai/dsh-', ''))}</td>
      <td style="font-size:11.5px;font-family:var(--mono);word-break:break-word">${esc(t.requires).replace(/ctx\.(\w+)/g, '<span style="color:var(--ac-2)">ctx.$1</span>')}</td>
    </tr>`).join('')}</tbody>
  </table>

  <div class="note ok">
    <span class="t">工具名可以运行期改变</span>
    注册的工具<strong>名字</strong>可以是加载期配置（比如 <code>tool-subagent</code> 的 <code>toolName</code>），所以同一份代码可以在某次部署里以不同名字暴露。表里显示的是默认配置下的名字。
  </div>

  <div class="related"><h3>继续 / CONTINUE</h3>
    <div class="deps">
      <a class="dep" href="#/layer/tools">工具系统分层讲解</a>
      <a class="dep" href="#/svc/tools">ctx.tools 服务详情</a>
      <a class="dep" href="#/seams">能力接缝</a>
    </div>
  </div>`
}

/* ---------- 单个包详情 ---------- */
function pagePkg(group, dir) {
  const p = PKGS.find(x => x.group === group && x.dir === dir)
  if (!p) return `<div class="empty">未找到包 packages/${esc(group)}/${esc(dir)}</div>`
  const meta = GROUP_META[group] || { zh: group }

  // 角色一：这个包声明/占用了哪些 ctx key
  const definesSvcs = SVCS.filter(s => s.owners.some(o => depShort(o) === p.short))
  // 角色二：这个包是否是某个接缝的额外提供者（owner 但不是第一个）
  const providesSvcs = SVCS.filter(s => (s.providers||[]).some(o => depShort(o) === p.short))
  // 角色三：这个包消费了哪些服务
  const consumesSvcs = SVCS.filter(s => s.consumers?.some(o => depShort(o) === p.short))
  // 这个包贡献的工具
  const pkgTools = TOOLS.filter(t => t.pkg === p.name || t.pkg === `@deepseek-ai/dsh-${p.short}`)

  const depsHtml = p.deps.length
    ? p.deps.map(d => pkgLink(depShort(d))).join('')
    : '<span style="color:var(--tx-3);font-size:12px">无</span>'
  const peersHtml = p.peers.length
    ? p.peers.map(d => { const s = depShort(d); return s.startsWith('cordis') ? `<span class="dep peer">${esc(s)}</span>` : pkgLink(s) }).join('')
    : ''

  // 逐包精读解读 —— 结构化重排（分句 / 领句标签 / 行号链接 / 页内小目录）
  const d = deepOf(p)

  /** 一个精读章节：中文标题 + 英文 kicker +（可选）收起钮 */
  const sec = (id, title, en, body, foldable) => `
  <section class="dsec${foldable ? ' foldable' : ''}" id="${id}">
    <h2>${title}<span class="k-en">${en}</span>${foldable ? `<button class="fold-btn" type="button" data-fold>收起 ↑</button>` : ''}</h2>
    <div class="dsec-body">${body}</div>
  </section>`

  /** 正文 → 结构化 HTML（行号引用自动跳右栏源码） */
  const R = t => DeepFmt.renderField(t, p, FMT_CTX)

  /* 页内小目录：只在有精读正文时才存在。必须整体挂在 d 上，
     否则没有精读的包会在渲染期直接 `d.tour` 报错（整页变成"出错了"）。 */
  const toc = d ? [
    ['sec-why', '为什么'],
    ['sec-pos', '位置'],
    ['sec-inside', '内部结构'],
    ['sec-boundary', '职责边界'],
    d.tour?.length ? ['sec-tour', '源码带读'] : null,
    d.gotchas ? ['sec-gotchas', '坑'] : null,
    ['sec-analogy', '通俗复述'],
  ].filter(Boolean) : []

  const deepHtml = d ? `
  <nav class="sec-toc">${toc.map(([id, label]) => `<button class="toc-chip" type="button" data-goto="${id}">${label}</button>`).join('')}</nav>

  <details class="official-summary"><summary>官方 README 摘要（脚本自动抽取，点开对照）</summary>
    <p class="lead">${md(p.summary || p.desc || '')}</p>
  </details>

  ${sec('sec-why', '为什么必须有它', 'WHY IT MUST EXIST', R(d.why))}

  ${sec('sec-pos', '在系统里的位置', 'POSITION IN THE SYSTEM', R(d.position))}

  ${sec('sec-inside', '内部结构', 'INTERNALS', R(d.inside), (d.inside || '').length >= 1200)}

  ${sec('sec-boundary', '职责边界', 'BOUNDARY', R(d.boundary))}

  ${d.tour?.length ? sec('sec-tour', `源码带读 <span class="badge">${d.tour.length}</span>`, 'SOURCE TOUR', `
  <table class="tour">
    <thead><tr><th style="width:34%">位置</th><th>为什么值得看</th></tr></thead>
    <tbody>${d.tour.map(t => `<tr>
      <td><a class="srclink" href="#/code/${encodeURI(t.file)}:${t.line}"><code>${esc(t.file.split('/').pop())}:${t.line}</code></a><div style="font-size:10px;color:var(--ink-3);font-family:var(--mono)">${esc(t.sym || '')}</div></td>
      <td style="font-size:12.5px">${esc(t.note)}</td>
    </tr>`).join('')}</tbody>
  </table>`) : ''}

  ${d.gotchas ? sec('sec-gotchas', '坑与边界条件', 'GOTCHAS & LIMITS', R(d.gotchas)) : ''}

  <section class="dsec" id="sec-analogy"><div class="analogy"><div class="t">通俗复述 / IN PLAIN WORDS</div>${R(d.analogy)}</div></section>` : `
  <h2>它是什么</h2>
  <p class="lead">${md(p.summary || p.desc || '')}</p>
  <p class="note">这个包还没有逐包精读（上游新增/改名后，解读还没跟上）。下面照常有它的依赖关系、上下游与被依赖情况，以及「读源码 →」入口——需要细节时直接进源码，右侧面板会给你符号表和溯源信息。</p>`

  return `
  <div class="crumb"><a href="#/">首页</a><span>/</span>${esc(meta.zh)}<span>/</span>${esc(p.short)}</div>
  <div class="hero hero-split">
    <div class="hero-copy">
      <div class="kicker">packages/${esc(p.group)}/${esc(p.dir)}</div>
      <h1>${esc(p.short)}</h1>
      <p>${d ? esc(d.oneLiner) : esc(p.desc || '')}</p>
      <div class="badges">
        <span class="badge ac">${esc(p.name)}</span>
        <span class="badge">${p.srcFiles} 个源文件</span>
        <span class="badge">${p.srcLoc.toLocaleString()} 行</span>
        ${d ? '<span class="badge ok">已逐包精读</span>' : '<span class="badge">待精读</span>'}
        ${p.dshField?.bundle ? '<span class="badge warn">bundle 补丁层</span>' : ''}
        ${p.dshField?.profile ? '<span class="badge warn">profile 模板</span>' : ''}
      </div>
    </div>
    <aside class="hero-side">
      <div class="side-title">PACKAGE / METADATA</div>
      <div class="row"><span>GROUP</span><b>${esc(meta.zh)}</b></div>
      <div class="row"><span>SOURCE FILES</span><b>${p.srcFiles}</b></div>
      <div class="row"><span>LINES</span><b>${p.srcLoc.toLocaleString()}</b></div>
      <div class="row"><span>DEEP READ</span><b>${d ? 'AVAILABLE' : 'PENDING'}</b></div>
      <div class="row"><span>NPM</span><b>${esc(p.name)}</b></div>
    </aside>
  </div>

  ${deepHtml}

  <div class="src-entry">
    <span style="font-size:11px;color:var(--ink-3);font-family:var(--mono)">SOURCE /</span>
    <a class="srclink" href="#/code/${encodeURI(`packages/${p.group}/${p.dir}/src/index.ts`)}">src/index.ts</a>
    <a class="srclink" data-tree="packages/${esc(p.group)}/${esc(p.dir)}/src/index.ts" href="#/files">在文件树里定位</a>
    ${p.srcFiles > 1 ? `<span style="font-size:11px;color:var(--ink-3)">（该包共 ${p.srcFiles} 个源文件，右侧面板可继续追）</span>` : ''}
  </div>

  ${definesSvcs.length || providesSvcs.length || consumesSvcs.length ? `<h2>服务角色</h2>
    <p style="font-size:13px">这个包在能力接缝中扮演的角色。<strong>定义者</strong>占用 ctx key；<strong>提供者</strong>是同一接缝的另一种实现；<strong>消费者</strong>通过服务名找到它。</p>
    ${definesSvcs.length ? `<h4>声明 / 定义的服务 <span class="badge">${definesSvcs.length}</span></h4>
    <div class="deps">${definesSvcs.map(s => `<a class="dep self" href="#/svc/${s.key}">ctx.${esc(s.key)}</a>`).join('')}</div>` : ''}
    ${providesSvcs.length ? `<h4>作为提供者的接缝 <span class="badge">${providesSvcs.length}</span></h4>
    <div class="deps">${providesSvcs.map(s => `<a class="dep" href="#/svc/${s.key}">ctx.${esc(s.key)}</a>`).join('')}</div>` : ''}
    ${consumesSvcs.length ? `<h4>消费的服务 <span class="badge">${consumesSvcs.length}</span></h4>
    <div class="deps">${consumesSvcs.map(s => `<a class="dep" href="#/svc/${s.key}">ctx.${esc(s.key)}</a>`).join('')}</div>` : ''}
  ` : ''}

  ${pkgTools.length ? `<h2>贡献的模型工具</h2>
    <table>
      <thead><tr><th style="width:40%">工具名</th><th>依赖</th></tr></thead>
      <tbody>${pkgTools.map(t => `<tr><td><code>${esc(t.names)}</code></td>
        <td style="font-size:11.5px;font-family:var(--mono)">${esc(t.requires)}</td></tr>`).join('')}</tbody>
    </table>` : ''}

  <h2>依赖关系（可点击溯源）</h2>
  <h4 style="margin-top:0">运行时依赖 <span class="badge">${p.deps.length}</span></h4>
  <div class="deps">${depsHtml}</div>
  ${p.peers.length ? `<h4>Peer 依赖 <span class="badge">${p.peers.length}</span> <span style="font-weight:400;color:var(--tx-3);font-size:11.5px">— peer 意味着"需要共享实例"</span></h4>
  <div class="deps">${peersHtml}</div>` : ''}

  <div class="note">
    <span class="t">依赖图只显示包之间的 peer 关系</span>
    真正的共享实例依赖图（谁 require 谁的共享实例）由 <code>pnpm run gen-module-graph</code> 生成。普通运行时依赖和仅开发期关系不在那张图里。
  </div>

  <div class="related"><h3>继续 / CONTINUE</h3>
    <div class="deps">
      <a class="dep" href="#/map">← ${esc(meta.zh)}</a>
      <a class="dep" href="#/pkg/${p.group}/${p.dir}">本页固定链接</a>
      <a class="dep" href="#/seams">能力接缝</a>
    </div>
  </div>`
}

/* ---------- 服务详情 ---------- */
function pageSvc(key) {
  const s = SVCS.find(x => x.key === key)
  if (!s) return `<div class="empty">未找到服务 ctx.${esc(key)}</div>`
  const definer = s.definer
  const providers = s.providers || []
  const isSeam = providers.length > 0
  return `
  <div class="crumb"><a href="#/">首页</a><span>/</span><a href="#/seams">能力接缝</a><span>/</span>ctx.${esc(s.key)}</div>
  <div class="hero hero-split">
    <div class="hero-copy">
      <div class="kicker">CORDIS SERVICE / ${isSeam ? 'SEAM' : 'SPINE'}</div>
      <h1>ctx.${esc(s.key)}</h1>
      <p>${esc(s.desc)}</p>
      <div class="badges">
        ${isSeam ? `<span class="badge ok">可替换接缝 · ${providers.length} 个提供者</span>` : '<span class="badge">脊柱服务</span>'}
        ${s.consumers?.length ? `<span class="badge">${s.consumers.length} 个消费者</span>` : ''}
      </div>
    </div>
    <aside class="hero-side">
      <div class="side-title">SERVICE / ROLE</div>
      <div class="row"><span>ROLE</span><b>${isSeam ? 'SEAM' : 'SPINE'}</b></div>
      <div class="row"><span>DEFINER</span><b>${definer ? esc(depShort(definer)) : '—'}</b></div>
      <div class="row"><span>PROVIDERS</span><b>${providers.length}</b></div>
      <div class="row"><span>CONSUMERS</span><b>${s.consumers?.length || 0}</b></div>
    </aside>
  </div>

  <h2>① 服务定义</h2>
  <p>这个 ctx key 由下面的包声明。服务定义必须是 Cordis 的 <code>Service</code>（抽象类或具体注册表），<strong>不是 TypeScript interface</strong>。</p>
  <div class="deps">${definer ? pkgLink(depShort(definer)) : '<span style="color:var(--tx-3);font-size:12px">—</span>'}</div>
  ${definer ? (() => {
    const dp = byShort.get(depShort(definer))
    return dp ? `<div class="src-entry">
      <span style="font-size:12px;color:var(--tx-3)">定义处源码 →</span>
      <a class="srclink" href="#/code/${encodeURI(`packages/${dp.group}/${dp.dir}/src/index.ts`)}">src/index.ts</a>
      <a class="srclink" data-tree="packages/${esc(dp.group)}/${esc(dp.dir)}/src/index.ts" href="#/files">在文件树里定位</a>
    </div>` : ''
  })() : ''}

  ${providers.length ? `<h2>② 服务提供者 <span class="badge">${providers.length}</span></h2>
  <p>这些包是这个接缝的其它实现。<strong>换掉其中一个，整个产品的行为就变了</strong>——而上层消费者代码一行都不用改。</p>
  <div class="deps">${providers.map(o => pkgLink(depShort(o))).join('')}</div>` : ''}

  ${s.consumers?.length ? `<h2>③ 消费者 <span class="badge">${s.consumers.length}</span></h2>
  <p>这些包通过 <code>ctx.${esc(s.key)}</code> 找到这个服务并使用它。它们<strong>不知道也不需要知道</strong>背后是哪个提供者。</p>
  <div class="deps">${s.consumers.map(o => pkgLink(depShort(o))).join('')}</div>` : ''}

  <h2>它为什么这样设计</h2>
  <p class="lead">${isSeam
    ? `这是一个<strong>可替换能力（接缝）</strong>：接口和实现分离，所以你可以把本地实现换成远程沙箱、换成另一个产品的委托——而上层消费者代码一行都不用改。这就是 dsh "换一个提供者就换全产品"的机制来源。<br><br>注意接缝是<strong>完整的能力</strong>，不是其中某一个角色。单独一个角色不算接缝。`
    : `这是一个<strong>脊柱服务</strong>或<strong>组合点</strong>：每个组合都会启动它，它把核心能力或注册表放在共享上下文上，让其他插件按键找到它。它没有多个提供者，因为它是"那一层"本身。`}</p>

  <div class="related"><h3>继续 / CONTINUE</h3>
    <div class="deps">
      <a class="dep" href="#/seams">全部 ${SVCS.length} 个服务</a>
      <a class="dep" href="#/events">事件矩阵</a>
      <a class="dep" href="#/tools">工具目录</a>
    </div>
  </div>`
}

/* ---------- 关于 ---------- */
function pageAbout() {
  return `
  <div class="crumb"><a href="#/">首页</a><span>/</span>关于</div>
  <div class="page-head">
    <div class="page-head-inner">
      <div>
        <p class="eyebrow">ARCHIVE / ABOUT</p>
        <h1>关于本站</h1>
        <p class="lead">这是一个对 <strong>DeepSeek Harness（dsh）</strong> 的全量架构解构站点。所有内容从源码仓库自动提取 + 人工归纳，不依赖网络。</p>
      </div>
      <aside class="page-head-side">
        <div class="row"><span>SNAPSHOT</span><b>${esc(META.version || '—')}</b></div>
        <div class="row"><span>PACKAGES</span><b>${PKGS.length}</b></div>
        <div class="row"><span>DEEP READ</span><b>${DEEP_N} / ${PKGS.length}</b></div>
      </aside>
    </div>
  </div>

  <h2>数据来源</h2>
  <table>
    <thead><tr><th style="width:34%">数据</th><th>来源</th><th style="width:70px">数量</th></tr></thead>
    <tbody>
      <tr><td>npm 包清单与摘要</td><td><code>packages/&lt;group&gt;/&lt;pkg&gt;/package.json</code> + <code>README.md</code></td><td><strong>${PKGS.length}</strong></td></tr>
      <tr><td>ctx 服务与角色</td><td><code>docs/capability-seams.md</code></td><td><strong>${SVCS.length}</strong></td></tr>
      <tr><td>模型工具目录</td><td><code>docs/tool-catalog.md</code></td><td><strong>${TOOLS.length}</strong></td></tr>
      <tr><td>事件生产者/消费者</td><td><code>docs/event-producer-consumer.md</code></td><td><strong>${EVENTS.length}</strong></td></tr>
      <tr><td>bundle 配置行</td><td><code>packages/bundle/*/cordis.patch.yml</code></td><td><strong>${Object.values(BUNDLES).reduce((a, b) => a + b.length, 0)}</strong></td></tr>
      <tr><td>架构与流程说明</td><td><code>docs/architecture.md</code>、<code>docs/agent-lifecycle.md</code>、<code>docs/tool-execution-pipeline.md</code>、<code>docs/glossary.md</code></td><td>—</td></tr>
    </tbody>
  </table>

  <h2>版本</h2>
  <p>本快照对应源码 <code>${esc(META.version || '(未知)')}</code>（<code>${esc(META.name || '@deepseek-ai/dsh-root')}</code>），仓库 HEAD <code>${esc(META.sha || '(未取到)')}</code>，生成于 <code>${esc(META.generatedAt || '(未知)')}</code>。仓库路径 <code>${esc(META.repo || '')}</code>（改 <code>config.json</code> 即可换）。dsh 处于 <strong>developer preview</strong>，API 会破坏性变更——所以这里的数字会随源码走，页面上写的都取自当前快照，不写死。</p>
  <p>逐包精读覆盖：<strong>${DEEP_N}</strong> / ${PKGS.length} 个包。精读是逐包人工归纳的，与包清单不是同一版产物，上游新增包会先以「待精读」出现在地图与包页里，解读随后补齐。</p>

  <h2>怎么用这个站</h2>
  <div class="mech">
    <div class="mech-row"><div class="mech-k">左侧目录</div><div class="mech-v">按能力分组列出全部 ${PKGS.length} 个包，点组名展开。当前所在页会自动高亮并滚到可见。</div></div>
    <div class="mech-row"><div class="mech-k">顶部搜索</div><div class="mech-v">同时搜<strong>包、服务、事件、工具、分层</strong>。输入即出结果，回车跳第一个。</div></div>
    <div class="mech-row"><div class="mech-k">点击溯源</div><div class="mech-v">页面里的 <code>包名</code> 标签都能点。从任意包出发，顺着依赖链一路追下去。</div></div>
    <div class="mech-row"><div class="mech-k">阅读顺序</div><div class="mech-v">小白建议从首页的「推荐阅读路径」按 1→9 走；只想查东西就直接搜索或走全站地图。</div></div>
  </div>

  <h2>一件重要的事</h2>
  <div class="note warn">
    <span class="t">本站是"地图"，不是"替代品"</span>
    我把复杂的东西压成了一句话 + 机制表 + 通俗复述。真正要动手改代码时，请回到仓库里的原始文档：<code>docs/architecture.md</code>（改 packages/ 之前必读）、<code>docs/subsystems/</code>（逐子系统契约）、以及各包的 <code>README.md</code>。
  </div>`
}

/* ---------- 组合与启动（专门页） ---------- */
function pageComposition() {
  const l = LAYERS.find(x => x.id === 'composition')
  let body = pageLayer('composition').replace(/<div class="related">[\s\S]*$/, '')

  // 各 bundle 的实际配置行
  const bmeta = {
    base: ['共享核心', 'web / headless / sdk / acp 的共同第一层'],
    'web-app': ['Web 界面', '浏览器应用、Host、Remote 层'],
    headless: ['一次性任务', '无服务器，跑一个任务打印结果'],
    'sdk-app': ['SDK 服务', 'JSON-RPC over stdio 服务端'],
    'acp-app': ['ACP 服务', '仅用于自动化的 Agent Client Protocol 服务'],
    'sdk-minimal': ['独立最小树', '不套用 base 的完整显式 SDK 树'],
  }

  body += `<h2>各 bundle 实际挂载的插件行</h2>
  <p>这是从每个 bundle 的 <code>cordis.patch.yml</code> 里逐行读出来的。行顺序<strong>不携带加载语义</strong>——激活是由服务可用性驱动的，分组只是为了方便阅读。</p>`

  for (const [b, rows] of Object.entries(BUNDLES)) {
    const [role, d] = bmeta[b] || ['', '']
    body += `<div style="margin:26px 0">
      <h3 style="margin-bottom:4px">dsh-${esc(b)} <span class="badge">${rows.length} 行</span>
        <span style="font-weight:400;font-size:12.5px;color:var(--tx-3)">${esc(role)} — ${esc(d)}</span></h3>
      <div style="max-height:290px;overflow-y:auto;border:1px solid var(--line);border-radius:var(--r);margin-top:10px">
        <table style="margin:0;border:0;font-size:12px">
          <thead><tr><th style="width:26%">行 id</th><th>插件包</th></tr></thead>
          <tbody>${rows.map(r => {
            const plugged = r.name.startsWith('@deepseek-ai/dsh-')
            const short = plugged ? depShort(r.name) : null
            return `<tr>
              <td><code style="font-size:11px">${esc(r.id)}</code></td>
              <td>${short && byShort.has(short) ? pkgLink(short, r.name) : `<span class="dep" style="border-style:dashed">${esc(r.name)}</span>`}</td>
            </tr>`
          }).join('')}</tbody>
        </table>
      </div>
    </div>`
  }

  body += `<h2>叠加顺序（重要）</h2>
  <p>各层依次应用到一个<strong>空的插件行列表</strong>上，<strong>后叠的按行 id 覆盖先叠的</strong>：</p>
  <div class="mech">
    <div class="mech-row"><div class="mech-k">1. bundle 层</div><div class="mech-v">按 profile 声明顺序依次应用每个 bundle 的补丁（例如 <code>dsh-base</code> → <code>dsh-web-app</code>）。</div></div>
    <div class="mech-row"><div class="mech-k">2. profile 补丁</div><div class="mech-v">profile 自己的 <code>cordis.patch.yml</code>（在 <code>$DSH_HOME/profiles/&lt;name&gt;/</code>）。</div></div>
    <div class="mech-row"><div class="mech-k">3. home 级补丁</div><div class="mech-v"><code>$DSH_HOME/cordis.patch.yml</code>——因为层数更高，它会<strong>压过</strong> profile 级。</div></div>
    <div class="mech-row"><div class="mech-k">4. --patch 覆盖</div><div class="mech-v">命令行 <code>--patch</code> 指定的文件，最后应用，优先级最高。</div></div>
  </div>

  <div class="note">
    <span class="t">看你的机器启动了什么树</span>
    <div class="code" style="margin:10px 0 0"><pre>dsh --profile web --dump-config</pre></div>
    <p style="margin:9px 0 0;font-size:13px">它打印出来的<strong>每一行都可以被你自己的补丁替换</strong>。这是理解 dsh 组合最直接的方法。</p>
  </div>

  <div class="note warn">
    <span class="t">平台门控也是配置</span>
    <code>bash-sandbox</code> 和 <code>tool-bash</code> 带 <code>disabled: !!js process.platform === 'win32'</code>，Windows 上换成 <code>pwsh-sandbox</code> / <code>tool-pwsh</code>（表达式取反）。所以每台机器上<strong>恰好只有一套 shell 栈</strong>，但安全行为完全一致。Windows 上想切换成不受限的 PowerShell 执行器，必须<strong>同时</strong>禁用两个 pwsh 行并启用两个 bash 行，否则 profile 加载失败。
  </div>

  <div class="related"><h3>继续 / CONTINUE</h3>
    <div class="deps">
      <a class="dep" href="#/layer/boot">启动层</a>
      <a class="dep" href="#/pkg/bundle/base">dsh-base 包详情</a>
      <a class="dep" href="#/map">全站地图</a>
    </div>
  </div>`
  return body
}

/* ============================================================
   路由
   ------------------------------------------------------------
   源码相关有三条通道：
     · 点左侧页面里的链接 / 侧栏入口 → 在右栏分屏里打开（不离开本页）
     · 直接输入 #/code/... 、#/files   → 走整页版
     · #/code/...?pane=1 或 #/files?pane=1 → 打开分屏并载入（分享用）
   ============================================================ */
const ROUTES = [
  [/^\/?$/, () => pageHome()],
  [/^\/map\/?$/, () => pageMap()],
  [/^\/seams\/?$/, () => pageSeams()],
  [/^\/events\/?$/, () => pageEvents()],
  [/^\/tools\/?$/, () => pageTools()],
  [/^\/about\/?$/, () => pageAbout()],
  [/^\/composition\/?$/, () => pageComposition()],
  [/^\/layer\/([\w-]+)\/?$/, m => pageLayer(m[1])],
  [/^\/pkg\/([\w-]+)\/([\w-]+)\/?$/, m => pagePkg(m[1], m[2])],
  [/^\/svc\/([\w-]+)\/?$/, m => pageSvc(m[1])],
  /* 源码浏览器（需要本地服务） */
  [/^\/files\/?(\?.*)?$/, (m, hash) => pageFilesPage(hash)],
  [/^\/code\/(.+?)(?::(\d+))?\/?(\?.*)?$/, (m, hash) => pageCodePage(decodeURI(m[1]), m[2], hash)],
]

/** #/files，但如果带 ?pane=1 就只在右栏打开，左侧保持不动 */
async function pageFilesPage(hash) {
  if (hash.includes('pane=1')) {
    openTreeAt(null)
    return pageMap()
  }
  return pageFiles()
}

/** #/code/<path>:<line>，同上 */
async function pageCodePage(path, line, hash) {
  if (hash.includes('pane=1')) {
    openSource(path, line)
    return pageHome()
  }
  return pageCode(path, line)
}

async function route() {
  const hash = location.hash.slice(1) || '/'
  const content = document.getElementById('content')
  for (const [re, fn] of ROUTES) {
    const m = hash.match(re)
    if (m) {
      let html
      try {
        html = fn(m, hash)
        // 源码页等是异步的（要请求本地服务）
        if (html && typeof html.then === 'function') {
          content.innerHTML = '<div class="loading">读取中…</div>'
          html = await html
        }
      } catch (err) {
        html = `<div class="empty"><h1>出错了</h1><p>${esc(String(err && err.message || err))}</p>
          <p style="margin-top:14px"><a href="#/">回首页</a></p></div>`
      }
      const isHome = /^\/?$/.test(hash)
      content.classList.toggle('page-home', isHome)
      content.innerHTML = html + (isHome ? '' : docFooter())
      wrapTables(content)
      content.classList.remove('page-enter')
      void content.offsetWidth
      content.classList.add('page-enter')
      const pageTitle = content.querySelector('h1')?.textContent?.trim()
      document.title = isHome || !pageTitle
        ? 'DeepSeek Harness · 全量解构'
        : `${pageTitle} · DeepSeek Harness`
      /* 只在分屏分享链接（?pane=1）时保留滚动；普通导航回到顶部。 */
      if (!hash.includes('pane=1')) window.scrollTo(0, 0)
      closeSidebar()
      markActive(location.hash)
      markTopNav(location.hash)
      if (typeof sinkSourceLinks === 'function') sinkSourceLinks(content)
      if (typeof mountSourcePage === 'function') mountSourcePage()
      if (typeof renderStrip === 'function') renderStrip()
      if (typeof spyToc === 'function') spyToc()
      if (pendingAnchor) {
        const id = pendingAnchor
        pendingAnchor = null
        requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }))
      }
      return
    }
  }
  content.classList.remove('page-home')
  closeSidebar()
  window.scrollTo(0, 0)
  content.innerHTML = `<div class="notfound">
    <p class="eyebrow">ERROR / 404</p>
    <div class="big">404</div>
    <h1>没有这个页面</h1>
    <p>这个地址不在归档里。可能是包名、层名或服务名写错了，也可能页面还没生成。</p>
    <div class="actions">
      <a class="btn btn-ink" href="#/">回首页</a>
      <a class="text-link" href="#/map">打开全站地图 →</a>
    </div>
  </div>` + docFooter()
  document.title = '404 · DeepSeek Harness'
  markTopNav(location.hash)
}

/* ---------- 启动 ---------- */
renderNav()
renderSourceNav()
initSearch()
initHeader()
if (typeof initPane === 'function') initPane()

/* ---------- 精读页交互：页内小目录 / 章节收起 / 当前章节高亮 ---------- */
document.getElementById('content').addEventListener('click', e => {
  const go = e.target.closest('[data-goto]')
  if (go) {
    const el = document.getElementById(go.dataset.goto)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return
  }
  const fold = e.target.closest('[data-fold]')
  if (fold) {
    const box = fold.closest('.dsec')
    if (box) {
      const on = box.classList.toggle('folded')
      fold.textContent = on ? '展开 ↓' : '收起 ↑'
    }
  }
})

/** 小目录高亮当前所在章节（滚动时 rAF 节流；非精读页直接跳过） */
let spyTick = 0
function spyToc() {
  const toc = document.querySelector('.sec-toc')
  if (!toc) return
  const secs = [...document.querySelectorAll('.dsec[id]')]
  if (!secs.length) return
  let cur = secs[0]
  for (const s of secs) if (s.getBoundingClientRect().top <= 140) cur = s
  toc.querySelectorAll('.toc-chip').forEach(b => b.classList.toggle('on', b.dataset.goto === cur.id))
}
window.addEventListener('scroll', () => {
  if (spyTick) return
  spyTick = requestAnimationFrame(() => { spyTick = 0; spyToc() })
}, { passive: true })

/* 左侧内容里的「读源码」类链接 → 一律在右栏打开，不替换当前页。
   这样左边讲解和右边源码才是真并行；用户想整页看再点面板里的「整页 ↗」。

   注意两个边界：
     · 只处理 #content 内部的链接。右栏面板自己的链接（符号、同包文件、
       整页 ↗）有各自的处理，不能被这里再拦一次。
     · 已经以整页方式打开源码时（#/code/...），溯源面板里的符号链接
       保持「跳哈希」的原生行为，否则整页会突然多出一栏、当前视图失去焦点。 */
function sinkSourceLinks(scope) {
  const inFullPageCode = /^#\/code\//.test(location.hash)

  scope.querySelectorAll('a.code-live, a.srclink, a[href^="#/code/"]').forEach(a => {
    if (a.dataset.sunk) return
    a.dataset.sunk = '1'
    const href = a.getAttribute('href') || ''
    const m = href.match(/^#\/code\/(.+?)(?::(\d+))?$/)
    if (!m) return

    // 整页源码视图里的链接 = 站内锚点，保持原生跳转
    if (inFullPageCode && a.closest('.code-layout')) return

    a.addEventListener('click', e => {
      e.preventDefault()
      openSource(decodeURI(m[1]), m[2])
    })
  })

  // 文件树定位：a[href="#/files"]、以及带 data-tree 的链接
  scope.querySelectorAll('a[href="#/files"], a[data-tree]').forEach(a => {
    if (a.dataset.sunkTree) return
    a.dataset.sunkTree = '1'
    const focus = a.dataset.tree || null
    a.addEventListener('click', e => {
      e.preventDefault()
      openTreeAt(focus)
    })
  })
  // 面板里的反向链接（源码 → 架构页）：左侧正常切页，右侧分屏保持不动
  // 靠的是 route() 不关闭面板，所以这里什么都不用做。
}

/* 侧栏的两个源码入口同样走分屏 */
document.getElementById('ns-code')?.addEventListener('click', e => {
  e.preventDefault()
  openSource(activeTabPath() || 'packages/core/agent/src/index.ts', activeTabLine())
})
document.getElementById('ns-files')?.addEventListener('click', e => {
  e.preventDefault()
  openTreeAt(SRC.focusPath)
})

function activeTabPath() {
  const t = SRC.tabs.find(x => x.cid === SRC.active)
  return t?.type === 'code' ? t.path : null
}
function activeTabLine() {
  const t = SRC.tabs.find(x => x.cid === SRC.active)
  return t?.type === 'code' ? t.line : null
}

/* 启动时如果 hash 带 ?pane=1，直接把分屏拉起来 */
window.addEventListener('hashchange', route)
route()

document.getElementById('menu-toggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open')
})
document.getElementById('sidebar').addEventListener('click', e => {
  if (e.target.closest('a') && window.innerWidth <= 1000) {
    document.getElementById('sidebar').classList.remove('open')
  }
})
