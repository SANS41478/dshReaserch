// 为每个包生成「精读底料」：README 全文 + 源文件树 + 导出符号(带行号) + inject + declare module
// 输出到 data/deep/brief/<group>__<dir>.txt ，供后续逐包精读使用。
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = 'D:/下载的软件在这里！/deepseek-harness源码/deepseek-harness'
const OUT = 'D:/临时/dsh研究/data/deep/brief'
mkdirSync(OUT, { recursive: true })

const read = p => { try { return readFileSync(p, 'utf8') } catch { return '' } }

const pkgs = JSON.parse(read('D:/临时/dsh研究/data/packages.json'))

const SYM_RE = [
  [/^\s*export\s+(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/, 'class'],
  [/^\s*export\s+(?:default\s+)?(?:declare\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/, 'fn'],
  [/^\s*export\s+(?:default\s+)?(?:declare\s+)?interface\s+([A-Za-z_$][\w$]*)/, 'iface'],
  [/^\s*export\s+(?:default\s+)?(?:declare\s+)?type\s+([A-Za-z_$][\w$]*)/, 'type'],
  [/^\s*export\s+(?:default\s+)?(?:declare\s+)?const\s+([A-Za-z_$][\w$]*)/, 'const'],
  [/^\s*export\s+(?:default\s+)?(?:declare\s+)?enum\s+([A-Za-z_$][\w$]*)/, 'enum'],
]
const MEMBER_RE = /^(\s{2})(?:(?:private|public|protected|readonly|static|override|abstract|async|get|set)\s+)*(?:async\s+)?(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*[(<]/
const INJECT_RE = /^\s*static\s+(?:readonly\s+)?inject\s*[:=]\s*\[([^\]]*)\]/
const DECLMOD_RE = /^\s*declare\s+module\s+['"]([^'"]+)['"]/
const CTXPROP_RE = /^\s*(?:readonly\s+)?([a-zA-Z_$][\w$]*)\s*:\s*([A-Za-z_$][\w$<>\[\],\s.]*)/

function walkSrc(dir) {
  const out = []
  const walk = d => {
    if (!existsSync(d)) return
    for (const f of readdirSync(d)) {
      const fp = join(d, f)
      if (statSync(fp).isDirectory()) walk(fp)
      else if (/\.(ts|tsx)$/.test(f)) out.push(fp)
    }
  }
  walk(dir)
  return out
}

function scanFile(fp) {
  const lines = read(fp).split('\n')
  const syms = [], injects = [], declMods = []
  let inDecl = false, declBuf = []
  lines.forEach((l, i) => {
    for (const [re, kind] of SYM_RE) {
      const m = l.match(re)
      if (m) { syms.push({ line: i + 1, kind, name: m[1] }); break }
    }
    const mi = l.match(INJECT_RE)
    if (mi) injects.push({ line: i + 1, list: mi[1].replace(/\s+/g, ' ').trim() })
    const dm = l.match(DECLMOD_RE)
    if (dm) { inDecl = true; declBuf = [`L${i + 1}: ${l.trim()}`]; declMods.push({ line: i + 1, text: l.trim() }) }
    else if (inDecl) {
      if (/^\s*}/.test(l)) { inDecl = false }
      else if (l.trim()) declBuf.push(`  ${l.trim()}`)
    }
    // 类成员
    const mm = l.match(MEMBER_RE)
    if (mm && syms.length) {
      const last = syms[syms.length - 1]
      if (last.kind === 'class') (last.members ||= []).push(`L${i + 1} ${mm[2]}`)
    }
  })
  return { lines: lines.length, syms, injects, declMods }
}

let n = 0
for (const p of pkgs) {
  const dir = join(ROOT, 'packages', p.group, p.dir)
  const readme = read(join(dir, 'README.md'))
  const files = walkSrc(join(dir, 'src')).sort()
  let out = `# ${p.name}\n`
  out += `path: packages/${p.group}/${p.dir}\n`
  out += `desc: ${p.desc}\n`
  out += `deps: ${p.deps.join(', ') || '-'}\n`
  out += `peers: ${p.peers.join(', ') || '-'}\n`
  out += `srcFiles: ${p.srcFiles}  srcLoc: ${p.srcLoc}\n\n`
  out += `## README.md (${readme.split('\n').length} 行)\n${readme}\n\n`
  out += `## 源文件与导出符号\n`
  for (const fp of files) {
    const rel = relative(ROOT, fp).replace(/\\/g, '/')
    const s = scanFile(fp)
    out += `\n### ${rel}  (${s.lines} 行)\n`
    if (s.injects.length) out += `  inject: ${s.injects.map(x => `L${x.line} [${x.list}]`).join(' | ')}\n`
    if (s.declMods.length) out += `  declare module: ${s.declMods.map(x => x.text).join(' | ')}\n`
    for (const sym of s.syms) {
      out += `  ${sym.line}\t${sym.kind}\t${sym.name}\n`
      if (sym.members?.length) out += `      members: ${sym.members.slice(0, 40).join(', ')}\n`
    }
  }
  // 非 src 的关键文件
  const extras = []
  for (const f of ['cordis.patch.yml', 'package.json']) {
    const t = read(join(dir, f))
    if (t) extras.push(`\n### ${f}\n${t.slice(0, 2000)}\n`)
  }
  if (extras.length) out += `\n## 其它关键文件\n${extras.join('')}`
  writeFileSync(join(OUT, `${p.group}__${p.dir}.txt`), out)
  n++
}
console.log('briefs written:', n)
