// Extract the full dsh package inventory + service index into JSON data files.
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'D:/下载的软件在这里！/deepseek-harness源码/deepseek-harness'
const OUT = 'D:/临时/dsh研究/data'
mkdirSync(OUT, { recursive: true })

const readText = p => { try { return readFileSync(p, 'utf8') } catch { return '' } }

// ---------- groups ----------
const GROUPS = {}
const gdir = join(ROOT, 'packages')
for (const g of readdirSync(gdir)) {
  const gp = join(gdir, g)
  if (!statSync(gp).isDirectory()) continue
  const subs = readdirSync(gp).filter(s => statSync(join(gp, s)).isDirectory())
  GROUPS[g] = subs
}

// ---------- packages ----------
const pkgs = []
for (const [g, subs] of Object.entries(GROUPS)) {
  for (const s of subs) {
    const dir = join(gdir, g, s)
    const pjRaw = readText(join(dir, 'package.json'))
    if (!pjRaw) continue
    let pj
    try { pj = JSON.parse(pjRaw) } catch { continue }
    const name = pj.name || `${g}/${s}`
    const short = name.replace('@deepseek-ai/dsh-', '').replace('@deepseek-ai/', '')

    // README summary (## Summary section)
    const rd = readText(join(dir, 'README.md'))
    let summary = ''
    const m = rd.match(/## Summary\n+([\s\S]*?)(?=\n## |\n-----|$)/)
    if (m) summary = m[1].replace(/\s+/g, ' ').trim()

    // description field
    const desc = pj.description || ''

    // src file count + loc
    let srcFiles = 0, srcLoc = 0
    const srcDir = join(dir, 'src')
    const walk = d => {
      if (!existsSync(d)) return
      for (const f of readdirSync(d)) {
        const fp = join(d, f)
        const st = statSync(fp)
        if (st.isDirectory()) walk(fp)
        else if (/\.(ts|tsx)$/.test(f)) {
          srcFiles++
          srcLoc += readText(fp).split('\n').length
        }
      }
    }
    walk(srcDir)

    // deps
    const deps = Object.keys(pj.dependencies || {}).filter(d => d.startsWith('@deepseek-ai/'))
    const peers = Object.keys(pj.peerDependencies || {}).filter(d => d.startsWith('@deepseek-ai/'))
    const dshField = pj.dsh || null

    pkgs.push({ group: g, dir: s, name, short, desc, summary, srcFiles, srcLoc, deps, peers, dshField })
  }
}
writeFileSync(join(OUT, 'packages.json'), JSON.stringify(pkgs, null, 1))

// ---------- services (ctx keys) ----------
const seams = readText(join(ROOT, 'docs/capability-seams.md'))
const services = []
const svcRe = /svc_([a-zA-Z0-9_]+)\["ctx\.([a-zA-Z0-9_]+)<br\/>([^"]+)"\]/g
let mm
while ((mm = svcRe.exec(seams))) {
  services.push({ key: mm[2], desc: mm[3] })
}
// Edge semantics in the generated graph:
//   pkg_X --> svc_Y   means package X OWNS/declares service Y  (the definition)
//   svc_X --> pkg_Y   means package Y CONSUMES service X
const alias = {}
const aliasRe = /pkg_([a-zA-Z0-9_]+)\["([^"]+)"\]/g
let mm2
while ((mm2 = aliasRe.exec(seams))) alias[mm2[1]] = mm2[2]

// owner: service key -> alias of the package that declares it
const owners = {}, consumers = {}
const ownRe = /^\s*pkg_([a-zA-Z0-9_]+)\s*-->\s*svc_([a-zA-Z0-9_]+)\s*$/gm
while ((mm2 = ownRe.exec(seams))) (owners[mm2[2]] ||= []).push(alias[mm2[1]] || mm2[1])
const conRe = /^\s*svc_([a-zA-Z0-9_]+)\s*-->\s*pkg_([a-zA-Z0-9_]+)\s*$/gm
while ((mm2 = conRe.exec(seams))) (consumers[mm2[1]] ||= []).push(alias[mm2[2]] || mm2[2])

// The graph gives no ordering between a definer and its providers, so detect
// the definer structurally: the Service Definition package is the one whose
// short name matches the service key (shell -> ctx.shell, fs -> ctx.fs,
// session -> ctx.sessions, tools -> ctx.tools), or the group-owning package.
// Everything else that "owns" the key is a provider.
function pickDefiner(key, names) {
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const k = norm(key)
  const cand = names.filter(n => {
    const nn = norm(n)
    return nn === k || nn === k + 's' || nn + 's' === k
  })
  return cand.length ? cand[0] : (names.length ? names[0] : undefined)
}

for (const s of services) {
  const own = [...new Set(owners[s.key] || [])]
  const definer = pickDefiner(s.key, own)
  s.owners = own                       // 全部声明包（1 个定义者 + N 个提供者）
  s.definer = definer                  // 服务定义包
  s.providers = own.filter(o => o !== definer)
  s.consumers = [...new Set(consumers[s.key] || [])]
}
writeFileSync(join(OUT, 'services.json'), JSON.stringify(services, null, 1))

// ---------- tools ----------
const toolCat = readText(join(ROOT, 'docs/tool-catalog.md'))
const tools = []
const toolRe = /^\| `(@deepseek-ai\/dsh-[^`]+)` \| ([^|]+) \| ([^|]+) \|/gm
while ((mm = toolRe.exec(toolCat))) {
  tools.push({
    pkg: mm[1].trim(),
    names: mm[2].trim().replace(/`/g, ''),
    requires: mm[3].trim().replace(/`/g, ''),
  })
}
writeFileSync(join(OUT, 'tools.json'), JSON.stringify(tools, null, 1))

// ---------- events ----------
const evDoc = readText(join(ROOT, 'docs/event-producer-consumer.md'))
const events = []
for (const line of evDoc.split('\n')) {
  if (!line.startsWith('| `')) continue
  const c = line.split('|').map(x => x.trim())
  if (c.length < 7) continue
  events.push({ name: c[1].replace(/`/g, ''), mode: c[2].replace(/`/g, ''), declared: c[3], producers: c[4], consumers: c[5] })
}
writeFileSync(join(OUT, 'events.json'), JSON.stringify(events, null, 1))

// ---------- bundle patch rows ----------
const bundles = {}
for (const b of ['base', 'web-app', 'headless', 'sdk-app', 'acp-app', 'sdk-minimal']) {
  const y = readText(join(ROOT, 'packages/bundle', b, 'cordis.patch.yml'))
  const rows = []
  const idRe = /^\s*- id: (\S+)\n\s*name: '([^']+)'/gm
  while ((mm = idRe.exec(y))) rows.push({ id: mm[1], name: mm[2] })
  bundles[b] = rows
}
writeFileSync(join(OUT, 'bundles.json'), JSON.stringify(bundles, null, 1))

console.log('packages', pkgs.length)
console.log('services', services.length)
console.log('tools', tools.length)
console.log('events', events.length)
console.log('bundles', Object.fromEntries(Object.entries(bundles).map(([k, v]) => [k, v.length])))
console.log('groups', Object.keys(GROUPS).length)
