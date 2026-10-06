// Inventory the source repo by top-level area: file count, size, extension mix.
import fs from 'node:fs'
import path from 'node:path'
import { REPO as ROOT } from './_paths.mjs'

const SKIP = new Set(['node_modules', '.git', '.turbo', 'dist', 'lib', 'coverage', '.shots', 'tsbuildinfo'])

function walk(dir, acc) {
  let ents
  try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return acc }
  for (const e of ents) {
    if (e.name.startsWith('.') && e.name !== '.agents') continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (SKIP.has(e.name)) continue
      walk(full, acc)
    } else if (e.isFile()) {
      let st; try { st = fs.statSync(full) } catch { continue }
      acc.push({ rel: path.relative(ROOT, full).replace(/\\/g, '/'), size: st.size })
    }
  }
  return acc
}

const all = walk(ROOT, [])
console.log(`总文件数 ${all.length}  总体积 ${(all.reduce((s, f) => s + f.size, 0) / 1048576).toFixed(1)} MB\n`)

const top = {}
for (const f of all) {
  const seg = f.rel.split('/')[0]
  const key = f.rel.includes('/') ? seg : '(顶层文件)'
  top[key] ??= { n: 0, size: 0 }
  top[key].n++; top[key].size += f.size
}

console.log('区域'.padEnd(18) + '文件数'.padStart(8) + '体积'.padStart(11))
console.log('-'.repeat(38))
for (const [k, v] of Object.entries(top).sort((a, b) => b[1].size - a[1].size)) {
  console.log(k.padEnd(18) + String(v.n).padStart(8) + (v.size / 1048576).toFixed(1).padStart(10) + ' MB')
}

// Extension mix overall
const ext = {}
for (const f of all) {
  const e = path.extname(f.rel).toLowerCase() || '(无扩展名)'
  ext[e] ??= { n: 0, size: 0 }
  ext[e].n++; ext[e].size += f.size
}
console.log('\n扩展名'.padEnd(16) + '文件数'.padStart(8) + '体积'.padStart(11))
console.log('-'.repeat(36))
for (const [k, v] of Object.entries(ext).sort((a, b) => b[1].n - a[1].n).slice(0, 18)) {
  console.log(k.padEnd(16) + String(v.n).padStart(8) + (v.size / 1048576).toFixed(1).padStart(10) + ' MB')
}

// Non-source noise inside packages/ (build products, maps, snapshots)
const pkgs = all.filter(f => f.rel.startsWith('packages/'))
const noise = pkgs.filter(f => /\.(map|tsbuildinfo)$/.test(f.rel))
const tests = pkgs.filter(f => /(^|\/)(test|tests|__tests__|fixtures?|__snapshots__)\//.test(f.rel) || /\.test\.ts$|\.spec\.ts$/.test(f.rel))
const src = pkgs.filter(f => /\.tsx?$/.test(f.rel) && !noise.includes(f) && !tests.includes(f))
console.log('\n--- packages/ 内部构成 ---')
console.log('源码 .ts/.tsx       ' + String(src.length).padStart(6) + '  ' + (src.reduce((s, f) => s + f.size, 0) / 1048576).toFixed(1) + ' MB')
console.log('测试/夹具           ' + String(tests.length).padStart(6) + '  ' + (tests.reduce((s, f) => s + f.size, 0) / 1048576).toFixed(1) + ' MB')
console.log('.map/buildinfo 产物 ' + String(noise.length).padStart(6) + '  ' + (noise.reduce((s, f) => s + f.size, 0) / 1048576).toFixed(1) + ' MB')
