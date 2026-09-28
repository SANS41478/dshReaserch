/* ============================================================
   dsh 源码浏览器 —— 本地服务
   零依赖。职责：
     1. 静态托管本站（index.html / assets / data）
     2. /api/* 实时读源码仓库（文件树、文件内容、全文搜索、符号索引）
   源码始终从磁盘现读，你在编辑器里改完刷新即生效。
   ============================================================ */
import http from 'node:http'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
// server.mjs 就在站点根目录，静态文件也在这里（不是上一级）
const SITE = HERE

/* ---------- 配置：config.json 可覆盖，环境变量优先级最高 ---------- */
let REPO = 'D:/下载的软件在这里！/deepseek-harness源码/deepseek-harness'
let PORT = 5319
try {
  const cfg = JSON.parse(fs.readFileSync(path.join(SITE, 'config.json'), 'utf8'))
  if (cfg.repo) REPO = cfg.repo
  if (cfg.port) PORT = Number(cfg.port)
} catch { /* 没有 config.json 就用默认 */ }
if (process.env.DSH_REPO) REPO = process.env.DSH_REPO
if (process.env.PORT) PORT = Number(process.env.PORT)

/* ---------- 展示范围：默认只开放产品源码 ---------- */
/* 这些目录整棵排除，任何模式下都不可见。
   .agents / .claude / .github / .workbuddy 都是 Agent 自己的工作区
   （笔记、skills、CI 配置），不是产品源码，对读代码的人是纯噪声。 */
const HARD_EXCLUDE = new Set([
  'node_modules', '.git', '.turbo', 'dist', 'lib', 'coverage',
  '.vscode', '.idea', '__pycache__', '.pytest_cache', '.DS_Store',
  '.agents', '.claude', '.github', '.gitlab', '.workbuddy', '.dsh-build',
  'snapshots', 'patches',
])

/* 顶层目录排序：产品源码优先，让人第一眼看到该看的东西 */
const TOP_ORDER = ['packages', 'apps', 'vendor', 'scripts', 'docs', 'python', 'native', 'benchmarks', 'website']

/* 产品源码白名单：命中即视为「源码」 */
const SRC_RE = /\.(ts|tsx|mts|js|mjs|cjs|py|rs|json|yaml|yml|toml|css|html|md|txt|sh|ps1|patch)$/i

const TEST_RE = /(^|\/)(tests?|__tests__|__snapshots__|fixtures?|fixture|specs?)(\/|$)|\.(test|spec)\.(ts|tsx|js|mjs|py)$/i

const isExcluded = rel => rel.split('/').some(s => HARD_EXCLUDE.has(s))

/* i18n 生成物：README.md 的中英对照与语言副本，
   是生成出来的翻译，不是需要读的源码，默认隐藏（避免每个包都多出 2 行噪声）。 */
const isI18nNoise = name => /\.i18n\.yaml$/.test(name) || /\.(zh|en)\.md$/.test(name)

/* ---------- MIME ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8', '.woff2': 'font/woff2',
}

/* ============================================================
   文件树
   ============================================================ */
let treeCache = null
let treeCacheAt = 0
const TREE_TTL = 4000          // 4 秒内的重复请求走缓存；改动后刷新即可见

async function buildTree() {
  const now = Date.now()
  if (treeCache && now - treeCacheAt < TREE_TTL) return treeCache

  const root = { name: 'deepseek-harness', type: 'dir', path: '', children: [] }

  async function walk(dirAbs, node, depth) {
    if (depth > 12) return
    let ents
    try { ents = await fsp.readdir(dirAbs, { withFileTypes: true }) } catch { return }
    ents.sort((a, b) => {
      // 顶层目录按产品重要度排序，其余目录优先、再按名字
      if (node.path === '') {
        const ia = TOP_ORDER.indexOf(a.name), ib = TOP_ORDER.indexOf(b.name)
        if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
      }
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    for (const e of ents) {
      const rel = node.path ? `${node.path}/${e.name}` : e.name
      if (isExcluded(rel)) continue
      if (e.isDirectory()) {
        const child = { name: e.name, type: 'dir', path: rel, children: [] }
        node.children.push(child)
        await walk(path.join(dirAbs, e.name), child, depth + 1)
      } else if (e.isFile()) {
        if (!SRC_RE.test(e.name)) continue
        if (isI18nNoise(e.name)) continue
        let st
        try { st = await fsp.stat(path.join(dirAbs, e.name)) } catch { continue }
        const kind = TEST_RE.test(rel) ? 'test'
          : /(^|\/)src\//.test(rel) ? 'src'
            : /\.(md|txt)$/i.test(rel) ? 'doc' : 'other'
        node.children.push({ name: e.name, type: 'file', path: rel, size: st.size, kind })
      }
    }
  }

  await walk(REPO, root, 0)
  treeCache = root
  treeCacheAt = now
  return root
}

/* ============================================================
   符号索引（自动扫描，用于文件+行号级溯源）
   ============================================================ */
let symCache = null
let symCacheAt = 0
const SYM_TTL = 8000

const SYM_PATTERNS = [
  // export class Foo extends Service   /   export abstract class Bar
  { re: /^\s*export\s+(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/, kind: 'class' },
  { re: /^\s*(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/, kind: 'class' },
  // export function foo(...)
  { re: /^\s*export\s+(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/, kind: 'function' },
  // export interface Foo
  { re: /^\s*export\s+(?:default\s+)?interface\s+([A-Za-z_$][\w$]*)/, kind: 'interface' },
  // export type Foo =
  { re: /^\s*export\s+(?:default\s+)?type\s+([A-Za-z_$][\w$]*)/, kind: 'type' },
  // export const foo = / export const foo:
  { re: /^\s*export\s+const\s+([A-Za-z_$][\w$]*)/, kind: 'const' },
  // declare module '...'  —— 声明合并（事件/服务事件映射）
  { re: /^\s*declare\s+module\s+['"]([^'"]+)['"]/, kind: 'module' },
  // python
  { re: /^\s*def\s+([A-Za-z_]\w*)/, kind: 'function' },
]

/* 方法/依赖声明：只在类体内有效，靠缩进深度判断 */
const METHOD_RE = /^(\s{2,})(?:(?:private|public|protected|readonly|static|override|abstract)\s+)*(?:async\s+)?(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*[(<]/
const ARROW_MEMBER_RE = /^(\s{2,})(?:(?:private|public|protected|readonly|static)\s+)*(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/
const INJECT_RE = /^\s*static\s+(?:readonly\s+)?inject\s*[:=]\s*(\[|'|")/
const INJECT_ARR_RE = /^\s*static\s+(?:readonly\s+)?inject\s*[:=]\s*\[([^\]]*)\]/
const KEYWORD = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'constructor',
  'new', 'typeof', 'await', 'yield', 'do', 'else', 'case', 'throw', 'super', 'this',
])

async function collectSourceFiles() {
  const out = []
  async function walk(dirAbs, rel, depth) {
    if (depth > 12 || out.length > 20000) return
    let ents
    try { ents = await fsp.readdir(dirAbs, { withFileTypes: true }) } catch { return }
    for (const e of ents) {
      const r = rel ? `${rel}/${e.name}` : e.name
      if (isExcluded(r)) continue
      if (e.isDirectory()) await walk(path.join(dirAbs, e.name), r, depth + 1)
      else if (e.isFile() && /\.(ts|tsx|mts|py)$/i.test(e.name) && !TEST_RE.test(r)) {
        out.push(r)
      }
    }
  }
  await walk(REPO, '', 0)
  return out
}

async function buildSymbols() {
  const now = Date.now()
  if (symCache && now - symCacheAt < SYM_TTL) return symCache

  const files = await collectSourceFiles()
  const syms = []          // { name, kind, file, line, owner? }
  const fileExports = {}   // rel -> [names]
  const fileInjects = {}   // rel -> [service keys]（static inject 声明）

  await Promise.all(files.map(async rel => {
    let txt
    try { txt = await fsp.readFile(path.join(REPO, rel), 'utf8') } catch { return }
    const lines = txt.split(/\r?\n/)
    const seen = new Set()
    const push = s => {
      const k = `${s.name}@${s.line}`
      if (seen.has(k)) return
      seen.add(k)
      syms.push(s)
    }

    let inClass = false
    let classIndent = 0
    let owner = null

    for (let i = 0; i < lines.length; i++) {
      const L = lines[i]
      if (L.length > 500) continue
      const lineNo = i + 1

      /* --- static inject：依赖声明，溯源价值最高 --- */
      if (INJECT_RE.test(L)) {
        const m2 = L.match(INJECT_ARR_RE)
        const keys = []
        if (m2) {
          for (const part of m2[1].split(',')) {
            const t = part.trim().replace(/['"]/g, '')
            if (t) keys.push(t)
          }
        }
        ;(fileInjects[rel] ??= []).push(...keys)
        push({ name: 'static inject', kind: 'inject', file: rel, line: lineNo, detail: keys.join(', ') })
        continue
      }

      /* --- 顶层声明 --- */
      let matched = false
      for (const p of SYM_PATTERNS) {
        const m = L.match(p.re)
        if (!m || !m[1]) continue
        if (p.kind === 'module') { push({ name: m[1], kind: 'module', file: rel, line: lineNo }); matched = true; break }
        const indent = L.match(/^\s*/)[0].length
        // 类/接口/类型：记录并进入类体
        if (p.kind === 'class' || p.kind === 'interface') {
          inClass = p.kind === 'class'
          classIndent = indent
          owner = p.kind === 'class' ? m[1] : null
        }
        push({ name: m[1], kind: p.kind, file: rel, line: lineNo })
        if (/^\s*export/.test(L)) (fileExports[rel] ??= []).push(m[1])
        matched = true
        break
      }
      if (matched) continue

      /* --- 类成员方法 / 字段 --- */
      if (inClass) {
        const indent = L.match(/^\s*/)[0].length
        if (L.trim() && indent <= classIndent && /^\}/.test(L.trim())) { inClass = false; owner = null; continue }
        const mm = L.match(METHOD_RE) || L.match(ARROW_MEMBER_RE)
        if (mm && mm[2] && !KEYWORD.has(mm[2]) && mm[1].length > classIndent) {
          push({ name: mm[2], kind: 'method', file: rel, line: lineNo, owner })
        }
      }
    }
  }))

  syms.sort((a, b) => a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file))
  symCache = { symbols: syms, fileExports, fileInjects, fileCount: files.length }
  symCacheAt = now
  return symCache
}

/* ============================================================
   全文搜索（grep 源码）
   ============================================================ */
async function searchSource(q, limit = 60) {
  const files = await collectSourceFiles()
  const needle = q.toLowerCase()
  const hits = []
  for (const rel of files) {
    if (hits.length >= limit) break
    let txt
    try { txt = await fsp.readFile(path.join(REPO, rel), 'utf8') } catch { continue }
    if (!txt.toLowerCase().includes(needle)) continue
    const lines = txt.split(/\r?\n/)
    for (let i = 0; i < lines.length && hits.length < limit; i++) {
      if (lines[i].toLowerCase().includes(needle)) {
        hits.push({ file: rel, line: i + 1, text: lines[i].trim().slice(0, 200) })
      }
    }
  }
  return hits
}

/* ============================================================
   路径安全：禁止逃出 REPO
   ============================================================ */
function safeJoin(rel) {
  const abs = path.resolve(REPO, rel)
  const norm = path.relative(REPO, abs)
  if (norm.startsWith('..') || path.isAbsolute(norm)) return null
  return abs
}

/* ============================================================
   HTTP
   ============================================================ */
const json = (res, obj, code = 200) => {
  const body = JSON.stringify(obj)
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(body)
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`)
  const p = decodeURIComponent(u.pathname)

  try {
    /* ---------- API ---------- */
    if (p === '/api/meta') {
      let ok = false
      try { ok = (await fsp.stat(REPO)).isDirectory() } catch { }
      return json(res, {
        repo: REPO, exists: ok, port: PORT,
        tree: ok ? await buildTree() : null,
      })
    }

    if (p === '/api/symbols') {
      const s = await buildSymbols()
      return json(res, {
        count: s.symbols.length, files: s.fileCount,
        fileExports: s.fileExports, fileInjects: s.fileInjects,
      })
    }

    if (p === '/api/search') {
      const q = (u.searchParams.get('q') || '').trim()
      if (q.length < 2) return json(res, { hits: [] })
      return json(res, { q, hits: await searchSource(q) })
    }

    if (p === '/api/file') {
      const rel = u.searchParams.get('path') || ''
      const abs = safeJoin(rel)
      if (!abs) return json(res, { error: '路径非法' }, 400)
      let txt
      try { txt = await fsp.readFile(abs, 'utf8') } catch (e) {
        return json(res, { error: '读不到这个文件: ' + e.code }, 404)
      }
      const st = await fsp.stat(abs)
      return json(res, { path: rel, size: st.size, text: txt, lines: txt.split(/\r?\n/).length })
    }

    if (p === '/api/symbols-for') {
      const rel = u.searchParams.get('path') || ''
      const s = await buildSymbols()
      return json(res, {
        path: rel,
        symbols: s.symbols.filter(x => x.file === rel),
        exports: s.fileExports[rel] || [],
        injects: s.fileInjects[rel] || [],
      })
    }

    if (p === '/api/tree') return json(res, await buildTree())

    /* ---------- 溯源：文件 -> 包 / 服务 / 依赖 ---------- */
    if (p === '/api/trace') {
      const rel = u.searchParams.get('path') || ''
      const parts = rel.split('/')
      const out = { path: rel, pkg: null, group: null, injects: [], exports: [], siblings: [] }

      if (parts[0] === 'packages' && parts.length >= 3) {
        const group = parts[1], dir = parts[2]
        out.group = group
        out.pkg = { group, dir, short: dir, name: null, pkgDir: `packages/${group}/${dir}` }
        // 读 package.json 拿到真名与描述
        try {
          const pj = JSON.parse(await fsp.readFile(path.join(REPO, 'packages', group, dir, 'package.json'), 'utf8'))
          out.pkg.name = pj.name
          out.pkg.description = pj.description
          out.pkg.deps = Object.keys(pj.dependencies || {}).filter(d => d.startsWith('@deepseek-ai/'))
          out.pkg.peerDeps = Object.keys(pj.peerDependencies || {}).filter(d => d.startsWith('@deepseek-ai/'))
          out.pkg.bundle = pj.dsh?.bundle ? true : false
        } catch { }
        // 同包其它源文件（便于横向移动）
        try {
          const srcDir = path.join(REPO, 'packages', group, dir, 'src')
          const ents = await fsp.readdir(srcDir, { withFileTypes: true })
          out.siblings = ents.filter(e => e.isFile() && /\.(ts|tsx)$/.test(e.name))
            .map(e => `packages/${group}/${dir}/src/${e.name}`)
        } catch { }
      }

      const s = await buildSymbols()
      out.injects = s.fileInjects[rel] || []
      out.exports = s.fileExports[rel] || []
      out.symbols = s.symbols.filter(x => x.file === rel)
      out.symbolCount = out.symbols.length
      return json(res, out)
    }

    /* ---------- 静态站点 ---------- */
    let fileRel = p === '/' ? 'index.html' : p.slice(1)
    const abs = path.resolve(SITE, fileRel)
    const within = path.relative(SITE, abs)
    if (within.startsWith('..') || path.isAbsolute(within)) {
      res.writeHead(403); return res.end('forbidden')
    }
    try {
      const st = await fsp.stat(abs)
      if (st.isDirectory()) { res.writeHead(404); return res.end('not found') }
      const ext = path.extname(abs).toLowerCase()
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Content-Length': st.size,
        'Cache-Control': 'no-cache',
      })
      fs.createReadStream(abs).pipe(res)
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('404')
    }
  } catch (err) {
    json(res, { error: String(err && err.message || err) }, 500)
  }
})

server.listen(PORT, '127.0.0.1', () => {
  const ok = fs.existsSync(REPO)
  console.log('')
  console.log('  dsh 源码浏览器')
  console.log('  ─────────────────────────────────────────────')
  console.log(`  地址    http://127.0.0.1:${PORT}/`)
  console.log(`  仓库    ${REPO}`)
  console.log(`  状态    ${ok ? '已找到仓库，源码实时读取' : '⚠ 仓库路径不存在，请检查 config.json'}`)
  console.log('')
  console.log('  关闭此窗口即停止服务。')
  console.log('')
})

/* 端口被占用时给出可操作的提示，而不是抛一坨堆栈。
   常见原因：上一次没关干净，或端口与别的服务撞了。 */
server.on('error', err => {
  console.log('')
  if (err.code === 'EADDRINUSE') {
    console.log(`  [启动失败] 端口 ${PORT} 已被占用。`)
    console.log('')
    console.log('  可能是上一次的服务没关干净，或者这个端口被别的程序用了。')
    console.log('  两种解法（任选一种）：')
    console.log('')
    console.log(`    1. 关掉占用 ${PORT} 的那个程序：`)
    console.log(`       Windows:  netstat -ano | findstr :${PORT}   然后 taskkill /PID <进程号> /F`)
    console.log(`       Mac/Linux: lsof -i :${PORT}                然后 kill <进程号>`)
    console.log('')
    console.log('    2. 换个端口：改 config.json 里的 "port"，重新双击 start')
    console.log('')
  } else if (err.code === 'EACCES') {
    console.log(`  [启动失败] 没有权限监听端口 ${PORT}。换一个 1024 以上的端口。`)
    console.log('')
  } else {
    console.log('  [启动失败]', err.message)
    console.log('')
  }
  process.exit(1)
})
