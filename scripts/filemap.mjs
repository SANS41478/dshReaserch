// 从精读底料里提取每包文件清单 → data/filemap.json
// 用途：精读正文里的行号引用（src/index.ts:57 / agent.ts:98 / agent-loop/src/index.ts:369）
//       要解析成完整路径才能跳转源码；底料的 `### packages/...` 头就是权威文件表。
// 注意：这是派生索引，不含任何解读原文。
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'

const BASE = 'D:/临时/dsh研究'
const BRIEF = `${BASE}/data/deep/brief`
const PKGS = JSON.parse(readFileSync(`${BASE}/data/packages.json`, 'utf8'))

const filemap = {}
let nFiles = 0
for (const p of PKGS) {
  const fp = `${BRIEF}/${p.group}__${p.dir}.txt`
  if (!existsSync(fp)) { console.warn('missing brief:', p.group, p.dir); continue }
  const txt = readFileSync(fp, 'utf8')
  const files = [...txt.matchAll(/^### (packages\/\S+)/gm)].map(m => m[1])
  filemap[`${p.group}/${p.dir}`] = files
  nFiles += files.length
}

writeFileSync(`${BASE}/data/filemap.json`, JSON.stringify(filemap, null, 1))
const nPkg = Object.keys(filemap).length
console.log(`filemap.json written: ${nPkg} packages, ${nFiles} files`)
