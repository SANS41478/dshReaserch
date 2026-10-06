// 合并精读批次产出 → data/deep.json（键为 group/dir）
//
// 两条硬规则：
//   1. 只保留「当前源码里真实存在」的包 —— 上游删掉的包（如 code-runtime / e2b /
//      settings-file）解读不能留在 deep.json，否则包页表里会出现幽灵条目，
//      verify-deep-fmt 也会报「deep 里有 packages.json 没有的包」。
//   2. 反向统计「有源码但没有精读」的包，直接打出来 —— 这就是下一轮要补的缺口清单。
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { DATA, dataPath, json } from './_paths.mjs'

const OUT_DIR = join(DATA, 'deep', 'out')
const PKGS = JSON.parse(readFileSync(dataPath('packages.json'), 'utf8'))
const live = new Set(PKGS.map(p => `${p.group}/${p.dir}`))

const deep = {}
let n = 0, dropped = 0
const dupes = []
for (const f of readdirSync(OUT_DIR).sort()) {
  if (!/^B\d+\.json$/.test(f)) continue
  const arr = JSON.parse(readFileSync(`${OUT_DIR}/${f}`, 'utf8'))
  for (const d of arr) {
    const key = `${d.group}/${d.dir}`
    if (deep[key]) dupes.push(`${key}（${f}）`)
    deep[key] = d
    n++
  }
}

for (const key of Object.keys(deep)) {
  if (!live.has(key)) { delete deep[key]; dropped++ }
}
writeFileSync(dataPath('deep.json'), json(deep))

const missing = PKGS.map(p => `${p.group}/${p.dir}`).filter(k => !deep[k])
console.log(`deep.json written: ${Object.keys(deep).length} 包有精读` +
  (dropped ? ` （丢弃 ${dropped} 条已消失包的解读）` : '') +
  (dupes.length ? ` （重复 ${dupes.length} 条：${dupes.slice(0, 3).join(', ')}）` : ''))
console.log(`精读缺口：${missing.length} 个包还没有解读`)
if (missing.length) {
  const byGroup = {}
  for (const k of missing) { const g = k.split('/')[0]; (byGroup[g] ||= []).push(k.split('/')[1]) }
  console.log('  ' + Object.entries(byGroup).map(([g, dirs]) => `${g}(${dirs.length}): ${dirs.join(', ')}`).join('\n  '))
}
writeFileSync(dataPath('deep-missing.json'), json(missing))
