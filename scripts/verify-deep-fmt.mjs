// 精读正文重排的「零删减」机器校验
//
//   node scripts/verify-deep-fmt.mjs
//
// 断言（265 包 x 6 字段，全量）：
//   1. 渲染结果剥掉 HTML 标签、还原实体、去掉 ** 与 ` 两个行内标记字符后
//      === data/deep.json 原文（逐字符、逐顺序相等）—— 一个字都不能少、不能换序
//   2. 渲染结果里没有残留的内部占位符
//   3. 每个行号引用链接（#/code/...）指向的文件都真实存在于 data/filemap.json，
//      且链接的显示文本确实出自原文
//
// 渲染器与浏览器共用 assets/deepfmt.js，不存在「校验的是一套、跑的是另一套」。
import { readFileSync } from 'node:fs'

const BASE = 'D:/临时/dsh研究'
// 仓库是 "type":"module"，而 deepfmt.js 是浏览器用的经典脚本（UMD）。
// 这里以 CJS 语义求值它，拿到的就是浏览器同一份实现（module.exports 分支）。
const FMT = (() => {
  const src = readFileSync(`${BASE}/assets/deepfmt.js`, 'utf8')
  const mod = { exports: {} }
  new Function('module', 'exports', src)(mod, mod.exports)
  return mod.exports
})()

const PKGS = JSON.parse(readFileSync(`${BASE}/data/packages.json`, 'utf8'))
const DEEP = JSON.parse(readFileSync(`${BASE}/data/deep.json`, 'utf8'))
const FILEMAP = JSON.parse(readFileSync(`${BASE}/data/filemap.json`, 'utf8'))

const REF_RE_SRC = '([A-Za-z0-9_\\-.\\/]+\\.(?:ts|tsx|js|mjs|cjs|yml|yaml|md|py)):(\\d+)'
const NUL = String.fromCharCode(0)

const ctx = { filemap: FILEMAP, dirIndex: FMT.buildDirIndex(PKGS) }
const byKey = new Map(PKGS.map(p => [`${p.group}/${p.dir}`, p]))
const FIELDS = ['why', 'position', 'inside', 'boundary', 'gotchas', 'analogy']
// 原文的规范化：与渲染器完全同口径 —— 逐句（splitSentences 同一实现）剥离
// 行内标记，成对的 ** 与 ` 才转成标签、未配对的（如 glob 的 **/SKILL.md）原样保留。
// 于是 got === want 即证明：渲染只做了切分与包标签，一个字符都没丢、没换序。
const canon = s => FMT.splitSentences(s)
  .map(seg => seg.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1'))
  .join('')
// 全仓文件表（跨包引用：core/agent 正文里引用 agent-loop 的文件是合法的）
const ALL_FILES = new Set(Object.values(FILEMAP).flat())

let nPkg = 0, nField = 0, nHtml = 0
let nRef = 0, nPlain = 0
const errors = []

for (const [key, d] of Object.entries(DEEP)) {
  const p = byKey.get(key)
  if (!p) { errors.push(`deep 里有 packages.json 没有的包：${key}`); continue }
  nPkg++

  for (const f of FIELDS) {
    const orig = d[f]
    if (typeof orig !== 'string') { errors.push(`${key}.${f} 不是字符串`); continue }
    nField++

    const html = FMT.renderField(orig, p, ctx)
    nHtml += html.length

    // 1) 零删减
    const got = FMT.strip(html)
    const want = canon(orig)
    if (got !== want) {
      let i = 0
      while (i < got.length && i < want.length && got[i] === want[i]) i++
      errors.push(
        `${key}.${f} 文本不一致（第 ${i} 字符）\n` +
        `  原文: ${JSON.stringify(want.slice(i, i + 60))}\n` +
        `  渲染: ${JSON.stringify(got.slice(i, i + 60))}` +
        (got.length !== want.length ? `\n  长度: 原文 ${want.length} vs 渲染 ${got.length}` : '')
      )
    }

    // 2) 无占位符残留
    if (html.includes(NUL)) errors.push(`${key}.${f} 残留内部占位符`)

    // 3) 链接有效性 + 显示文本出自原文
    const links = [...html.matchAll(/<a class="ref" href="#\/code\/([^"]+)">([^<]*)<\/a>/g)]
    for (const m of links) {
      nRef++
      const href = decodeURI(m[1])
      const cut = href.lastIndexOf(':')
      const file = href.slice(0, cut)
      const line = Number(href.slice(cut + 1))
      if (!file.startsWith('packages/')) errors.push(`${key}.${f} 链接路径异常：${href}`)
      if (!Number.isInteger(line) || line < 1) errors.push(`${key}.${f} 链接行号异常：${href}`)
      if (!(ALL_FILES.has(file))) errors.push(`${key}.${f} 链接指向的文件不存在于任何包：${file}`)
      if (!m[2] || !orig.includes(m[2])) errors.push(`${key}.${f} 链接显示文本不在原文里：${m[2]}`)
    }
    // 原文引用总数 - 已链接 = 保持纯文本（歧义/未命中，宁可不链也不给坏链）
    const all = [...orig.matchAll(new RegExp(REF_RE_SRC, 'g'))].length
    nPlain += all - links.length
  }
}

const total = nPkg * FIELDS.length
console.log(`校验字段 ${nField}/${total}（${nPkg} 包），渲染 ${Math.round(nHtml / 1024)} KB`)
console.log(`行号引用：共 ${nRef + nPlain} 处 → 可点击 ${nRef}，保持纯文本 ${nPlain}`)
if (errors.length) {
  console.log(`\n错误 ${errors.length} 个（最多列 20 条）：`)
  for (const e of errors.slice(0, 20)) console.log(' - ' + e)
  process.exit(1)
}
console.log('零删减校验全部通过：渲染结果与 deep.json 原文逐字符一致，所有链接均指向真实文件')
