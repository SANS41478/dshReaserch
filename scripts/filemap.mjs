// 从精读底料里提取每包文件清单 → data/filemap.json
// 用途：精读正文里的行号引用（src/index.ts:57 / agent.ts:98 / agent-loop/src/index.ts:369）
//       要解析成完整路径才能跳转源码；底料的 `### packages/...` 头就是权威文件表。
// 注意：这是派生索引，不含任何解读原文。
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { DATA, dataPath, REPO, json } from './_paths.mjs'

const BRIEF = join(DATA, 'deep', 'brief')
const PKGS = JSON.parse(readFileSync(dataPath('packages.json'), 'utf8'))

const filemap = {}
let nFiles = 0, nMissing = 0, nGonePkg = 0
for (const p of PKGS) {
  const fp = `${BRIEF}/${p.group}__${p.dir}.txt`
  if (!existsSync(fp)) { nGonePkg++; continue }
  const txt = readFileSync(fp, 'utf8')
  const listed = [...txt.matchAll(/^### (packages\/\S+)/gm)].map(m => m[1])
  // 底料可能来自更早的源码版本：指向已消失文件的条目会让正文链接变死链，直接剔除。
  const files = listed.filter(rel => existsSync(join(REPO, rel)))
  nMissing += listed.length - files.length
  filemap[`${p.group}/${p.dir}`] = files
  nFiles += files.length
}

writeFileSync(dataPath('filemap.json'), json(filemap))
const nPkg = Object.keys(filemap).length
console.log(`filemap.json written: ${nPkg} packages, ${nFiles} files` +
  (nMissing ? ` （剔除 ${nMissing} 条已消失文件）` : '') +
  (nGonePkg ? ` （${nGonePkg} 包无底料）` : ''))
