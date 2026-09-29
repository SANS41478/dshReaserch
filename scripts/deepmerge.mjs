// 合并 37 个批次的人工精读解读 → data/deep.json（键为 group/dir）
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'

const OUT_DIR = 'D:/临时/dsh研究/data/deep/out'
const deep = {}
let n = 0
for (const f of readdirSync(OUT_DIR)) {
  if (!/^B\d+\.json$/.test(f)) continue
  const arr = JSON.parse(readFileSync(`${OUT_DIR}/${f}`, 'utf8'))
  for (const d of arr) {
    deep[`${d.group}/${d.dir}`] = d
    n++
  }
}
writeFileSync('D:/临时/dsh研究/data/deep.json', JSON.stringify(deep, null, 1))
console.log('deep.json written,', n, 'packages')
