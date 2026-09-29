/* ============================================================
   精读正文结构化渲染器 —— 浏览器（app.js）与 Node 校验
   （scripts/verify-deep-fmt.mjs）共用同一份实现。

   契约（零删减）：
     剥离 HTML 标签、还原实体、去掉 ** 与 ` 两个行内标记字符后，
     渲染结果必须与 deep.json 原文逐字符相等（顺序也相等）。
     分句、领句提取、行号链接都只做「切分 + 包标签」，绝不丢字。

   用法：
     浏览器 → window.DeepFmt.renderField(text, pkg, ctx)
     Node   → require('../assets/deepfmt.js')
     ctx = { filemap: { 'group/dir': ['packages/.../a.ts'] }, dirIndex: Map<dir, ['group/dir']>
   ============================================================ */
;(function (root, factory) {
  const api = factory()
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else root.DeepFmt = api
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict'

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

  /* ---------- 分句：按 中文句末标点 切，字符全部保留 ----------
     关键：不切断未闭合的行内标记（`code` / **bold**）。
     否则 `` `...。` `` 这种跨句代码片段会被劈成两半，反引号在两边都配不上对，
     显示成裸字符。状态是奇偶切换（naive parity），带长度兜底：
     超过 400 字符仍未闭合就当作误配，恢复正常切分（字符照样一个不丢）。 */
  const SENT_END = '。；！？'
  const SPAN_GUARD = 400
  function splitSentences(text) {
    const s = String(text ?? '')
    const out = []
    let buf = '', inCode = false, inBold = false, spanStart = -1
    const open = () => (inCode ? 1 : 0) + (inBold ? 1 : 0)
    const closed = () => { inCode = false; inBold = false; spanStart = -1 }
    for (let i = 0; i < s.length; i++) {
      const c = s[i]
      if (c === '`') {
        inCode = !inCode
        if (open() > 0 && spanStart < 0) spanStart = buf.length
        if (open() === 0) spanStart = -1
        buf += c
        continue
      }
      if (c === '*' && s[i + 1] === '*') {
        inBold = !inBold
        if (open() > 0 && spanStart < 0) spanStart = buf.length
        if (open() === 0) spanStart = -1
        buf += '**'
        i++
        continue
      }
      buf += c
      if (open() > 0 && spanStart >= 0 && buf.length - spanStart > SPAN_GUARD) closed()
      if (open() === 0 && SENT_END.includes(c)) { out.push(buf); buf = '' }
    }
    if (buf) out.push(buf)
    return out
  }

  /* ---------- 领句标记：句首的「上游：」「划线依据：」这类小标题 ----------
     规则：首字中文，其后 1–12 个 中文/字母/数字/空格/·/-/_，再接全角冒号。
     未命中 = 普通句子，归属上一段（或作为开头的引导段）。 */
  const MARKER_RE = /^([一-龥][一-龥A-Za-z0-9_ ·/-]{0,12}：)/

  function groupSentences(segs) {
    const groups = []
    for (const s of segs) {
      const m = s.match(MARKER_RE)
      if (m) groups.push({ marker: m[1], items: [s.slice(m[1].length)] })
      else if (groups.length) groups[groups.length - 1].items.push(s)
      else groups.push({ marker: '', items: [s] })
    }
    return groups
  }

  /* ---------- 行号引用 → 源码链接 ---------- */
  const REF_RE = /([A-Za-z0-9_\-.\/]+\.(?:ts|tsx|js|mjs|cjs|yml|yaml|md|py)):(\d+)/g

  function buildDirIndex(pkgs) {
    const idx = new Map()
    for (const p of pkgs) {
      const key = `${p.group}/${p.dir}`
      if (!idx.has(p.dir)) idx.set(p.dir, [])
      idx.get(p.dir).push(key)
    }
    return idx
  }

  /** 把正文里的相对引用解析成完整仓库路径；无法唯一命中返回 null（保持纯文本） */
  function resolveRef(refPath, pkg, filemap, dirIndex) {
    if (!filemap || !pkg) return null
    const own = filemap[`${pkg.group}/${pkg.dir}`] || []
    let cands = []
    if (refPath.startsWith('src/')) {
      cands = own.filter(f => f.endsWith('/' + refPath))
    } else if (refPath.includes('/')) {
      // 跨包引用：agent-loop/src/index.ts → 按目录名找包
      const first = refPath.split('/')[0]
      for (const key of (dirIndex && dirIndex.get(first)) || []) {
        for (const f of (filemap[key] || [])) if (f.endsWith('/' + refPath)) cands.push(f)
      }
      if (!cands.length) cands = own.filter(f => f.includes('/' + refPath))
    } else {
      // 裸文件名：agent.ts:98 → 本包内唯一后缀命中
      cands = own.filter(f => f.endsWith('/' + refPath))
    }
    cands = [...new Set(cands)]
    return cands.length === 1 ? cands[0] : null
  }

  /* ---------- 行内处理：转义 → 引用占位 → **粗体** → `code` → 还原 ---------- */
  function inline(text, pkg, ctx) {
    const store = []
    const keep = h => { store.push(h); return '\u0000' + (store.length - 1) + '\u0000' }

    let out = esc(String(text ?? ''))

    if (ctx && ctx.filemap) {
      out = out.replace(REF_RE, (m, refPath, line) => {
        const full = resolveRef(refPath, pkg, ctx.filemap, ctx.dirIndex)
        if (!full) return m
        return keep(`<a class="ref" href="#/code/${encodeURI(full)}:${line}">${esc(refPath)}:${line}</a>`)
      })
    }

    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>')
    return out.replace(/\u0000(\d+)\u0000/g, (_, i) => store[Number(i)])
  }

  /* ---------- 整段渲染 ---------- */
  function renderField(text, pkg, ctx) {
    const raw = String(text ?? '')
    if (!raw) return ''

    const segs = splitSentences(raw)
    const groups = groupSentences(segs)
    const hasMarker = groups.some(g => g.marker)

    // 短字段（≤2 句且无领句标记）：整段即可，不必列表化
    // （仍然逐句渲染，保证行内标记的配对范围与分句口径一致）
    if (!hasMarker && segs.length <= 2) return `<p class="d-p">${segs.map(s => inline(s, pkg, ctx)).join('')}</p>`

    const out = []
    for (const g of groups) {
      if (!g.marker) {
        if (groups.length === 1) {
          // 通篇无标记 → 纯句子列表
          out.push(`<ul class="ds">${g.items.map(s => `<li>${inline(s, pkg, ctx)}</li>`).join('')}</ul>`)
        } else {
          // 开头的引导段（其后才有标记分组）
          out.push(`<p class="d-lead">${g.items.map(s => inline(s, pkg, ctx)).join('')}</p>`)
        }
      } else {
        const body = g.items.filter(s => s !== '').map(s => `<li>${inline(s, pkg, ctx)}</li>`).join('')
        out.push(`<div class="seg"><div class="seg-k">${esc(g.marker)}</div><ul class="ds">${body}</ul></div>`)
      }
    }
    return `<div class="d-body">${out.join('')}</div>`
  }

  /** 纯文本抽取（校验用）：剥标签 + 还原实体 */
  function strip(html) {
    return String(html ?? '')
      .replace(/<[^>]*>/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
  }

  return { esc, splitSentences, groupSentences, resolveRef, buildDirIndex, inline, renderField, strip, MARKER_RE, REF_RE }
})
