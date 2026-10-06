// Bundle all data JSON into one JS file so the site works from file:// with no server.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { DATA, REPO, dataPath } from './_paths.mjs'

const read = f => JSON.parse(readFileSync(dataPath(f), 'utf8'))
/** deep / filemap 是可选派生物：缺了也要能出包，站点会自动降级 */
const readOpt = f => {
  if (!existsSync(dataPath(f))) { console.warn(`  [warn] 缺 ${f}，站点将降级运行`); return {} }
  return read(f)
}

/* 站点上显示的版本号从源码仓库现读，不再写死在 HTML 里
   —— 以前页面写着 v0.1.5-alpha.1，仓库早就走到 0.2.x 了。 */
function repoSha() {
  try { return execFileSync('git', ['-C', REPO, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim() } catch { return '' }
}
let pkg = {}
try { pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')) } catch { /* 无视 */ }
/** 本地时间戳（ISO 的 UTC 会让人误读，快照时间必须和用户手表一致） */
const localStamp = d => {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const meta = {
  name: pkg.name || 'deepseek-harness',
  version: pkg.version || '',
  sha: repoSha(),
  repo: REPO,
  generatedAt: localStamp(new Date()),
}

const bundle = {
  meta,
  packages: read('packages.json'),
  services: read('services.json'),
  tools: read('tools.json'),
  events: read('events.json'),
  bundles: read('bundles.json'),
  layers: read('layers.json'),
  code: read('code.json'),
  deep: readOpt('deep.json'),
  filemap: readOpt('filemap.json'),   // 每包文件清单（行号引用 → 完整路径）
}

const OUT = dataPath('bundle.js')
writeFileSync(OUT, 'window.DSH_DATA=' + JSON.stringify(bundle) + ';\n')

const kb = (readFileSync(OUT, 'utf8').length / 1024).toFixed(0)
const nDeep = Object.keys(bundle.deep).length
console.log(`bundle.js written, ${kb} KB  (包 ${bundle.packages.length} / 精读 ${nDeep} / 文件表 ${Object.keys(bundle.filemap).length})`)
console.log(`  快照来源 ${meta.name}@${meta.version} ${meta.sha}  生成于 ${meta.generatedAt}`)
