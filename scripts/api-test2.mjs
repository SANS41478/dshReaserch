// Test the improved symbol extraction + traceability endpoint.
import http from 'node:http'

const get = p => new Promise((resolve, reject) => {
  const req = http.get({ host: '127.0.0.1', port: 5319, path: p }, res => {
    let s = ''
    res.on('data', d => s += d)
    res.on('end', () => { try { resolve(JSON.parse(s)) } catch (e) { reject(new Error(p + ' -> ' + s.slice(0, 300))) } })
  })
  req.on('error', reject)
  req.setTimeout(180000, () => req.destroy(new Error('timeout ' + p)))
})

console.log('=== 改进后的符号提取 ===')
for (const f of [
  'packages/core/agent-loop/src/agent.ts',
  'packages/core/tools/src/index.ts',
  'packages/shell/shell/src/index.ts',
]) {
  const r = await get('/api/symbols-for?path=' + encodeURIComponent(f))
  console.log(`\n${f}`)
  console.log(`  符号 ${r.symbols.length} 个 | 导出 [${r.exports.slice(0, 6).join(', ')}] | inject [${r.injects.join(', ')}]`)
  for (const s of r.symbols.slice(0, 12)) {
    const own = s.owner ? `${s.owner}.` : ''
    const det = s.detail ? `  (${s.detail.slice(0, 60)})` : ''
    console.log(`    ${String(s.line).padStart(4)}  ${s.kind.padEnd(9)} ${own}${s.name}${det}`)
  }
}

console.log('\n\n=== 溯源端点 /api/trace ===')
const t = await get('/api/trace?path=' + encodeURIComponent('packages/shell/shell/src/index.ts'))
console.log('包:', t.pkg.name)
console.log('位置:', t.pkg.pkgDir)
console.log('描述:', (t.pkg.description || '').slice(0, 80))
console.log('声明依赖的服务(inject):', t.injects.join(', ') || '(无)')
console.log('导出:', t.exports.join(', '))
console.log('同包源文件:', t.siblings.map(s => s.split('/').pop()).join(', '))

const t2 = await get('/api/trace?path=' + encodeURIComponent('packages/shell/bash-local/src/index.ts'))
console.log('\n--- bash-local ---')
console.log('包:', t2.pkg.name)
console.log('inject:', t2.injects.join(', ') || '(无)')
console.log('导出:', t2.exports.join(', '))
console.log('dsh 依赖:', (t2.pkg.deps || []).join(', '))

console.log('\n=== 全局索引 ===')
const idx = await get('/api/symbols')
console.log('符号总数:', idx.count, '| 文件数:', idx.files)
const withInject = Object.keys(idx.fileInjects || {}).length
console.log('声明了 inject 的文件数:', withInject)
