// API smoke test — uses node's http directly (bypasses sandbox proxy on curl).
import { createRequire } from 'node:module'
import { PORT } from './_paths.mjs'
const require = createRequire(import.meta.url)
const get = p => new Promise((resolve, reject) => {
  const req = require('node:http').get({ host: '127.0.0.1', port: PORT, path: p }, res => {
    let s = ''
    res.on('data', d => s += d)
    res.on('end', () => { try { resolve(JSON.parse(s)) } catch (e) { reject(new Error(p + ' -> ' + s.slice(0, 200))) } })
  })
  req.on('error', reject)
  req.setTimeout(120000, () => req.destroy(new Error('timeout ' + p)))
})

console.log('--- /api/meta ---')
const meta = await get('/api/meta')
console.log('repo:', meta.repo)
console.log('exists:', meta.exists)
const top = meta.tree.children.map(c => c.name)
console.log('顶层:', top.join(', '))
const pkgs = meta.tree.children.find(c => c.name === 'packages')
console.log('packages 分组数:', pkgs.children.length)
const core = pkgs.children.find(c => c.name === 'core')
console.log('core 包:', core.children.map(c => c.name).join(', '))
const al = core.children.find(c => c.name === 'agent-loop')
console.log('agent-loop 子节点:', al.children.map(c => `${c.name}[${c.type}]`).join(', '))
const alSrc = al.children.find(c => c.name === 'src')
console.log('agent-loop/src:', alSrc.children.map(c => `${c.name}[${c.kind}]`).join(', '))

// count total files by kind
let kinds = {}, dirs = 0
const count = n => { for (const c of n.children) { if (c.type === 'dir') { dirs++; count(c) } else kinds[c.kind] = (kinds[c.kind] || 0) + 1 } }
count(meta.tree)
console.log('目录数:', dirs, '文件按类型:', JSON.stringify(kinds))

console.log('\n--- /api/file ---')
const f = await get('/api/file?path=' + encodeURIComponent('packages/core/agent-loop/src/agent.ts'))
console.log('path:', f.path, '| lines:', f.lines, '| size:', f.size)
console.log('首行:', f.text.split('\n')[0])

console.log('\n--- /api/symbols-for ---')
const sf = await get('/api/symbols-for?path=' + encodeURIComponent('packages/core/agent-loop/src/agent.ts'))
console.log('类/函数数:', sf.symbols.length, '| 导出:', sf.exports.slice(0, 10).join(', '))
for (const s of sf.symbols.slice(0, 8)) console.log('   ', s.line + ':', s.kind, s.name)

console.log('\n--- /api/search ---')
const sr = await get('/api/search?q=TOOL_RUNTIME_SCHEDULER')
console.log('命中:', sr.hits.length)
for (const h of sr.hits.slice(0, 5)) console.log(`   ${h.file}:${h.line}  ${h.text.slice(0, 70)}`)

console.log('\n--- /api/symbols (全局索引) ---')
const idx = await get('/api/symbols')
console.log('符号总数:', idx.count, '| 扫描文件数:', idx.files)
