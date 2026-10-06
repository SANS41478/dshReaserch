/* ============================================================
   全站脚本共用的路径解析 —— 唯一事实源是 config.json
   ------------------------------------------------------------
   历史坑：这些路径以前在 20 个脚本里各自硬编码
   （`D:/临时/dsh研究`、`D:/下载的软件在这里！/deepseek-harness源码/…`），
   站点一换目录 / 一换盘符就全线失效，而且没法迁移。
   现在一律由「脚本自身位置」+ `config.json` 推导，不再依赖任何绝对路径。

   用法：
     import { SITE, DATA, REPO, dataPath, readData, loadChromium } from './_paths.mjs'
     const ROOT = REPO            // 源码仓库根
     const OUT = DATA             // 站点数据目录
   ============================================================ */
import { existsSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** 站点根（scripts/ 的上一级） */
export const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
/** 站点数据目录 */
export const DATA = path.join(SITE, 'data')
/** 截图输出目录 */
export const SHOTS = path.join(SITE, '.shots')

let cfg = {}
try { cfg = JSON.parse(readFileSync(path.join(SITE, 'config.json'), 'utf8')) } catch { /* 无配置 */ }

/** 源码仓库根：环境变量 DSH_REPO 优先，其次 config.json 的 repo */
export const REPO = process.env.DSH_REPO || cfg.repo || ''
/** 服务端口：环境变量 PORT 优先，其次 config.json 的 port */
export const PORT = Number(process.env.PORT || cfg.port || 5319)

if (!REPO) {
  console.error('[配置缺失] 没有源码仓库路径。请编辑 config.json 的 "repo"，或设置环境变量 DSH_REPO。')
  process.exit(1)
}

export const dataPath = f => path.join(DATA, f)
/** 读站点数据 JSON */
export const readData = f => JSON.parse(readFileSync(path.join(DATA, f), 'utf8'))
/** 写站点数据 JSON */
export const json = v => JSON.stringify(v, null, 1)
/** 站点页面 file:// URL（可带 hash 路由） */
export const siteUrl = (hash = '') => pathToFileURL(path.join(SITE, 'index.html')).href + hash
/** 本地服务地址 */
export const serverUrl = (p = '/') => `http://127.0.0.1:${PORT}${p}`

/* ---------- playwright：从若干候选位置里找，命中即用 ----------
   NODE_PATH 对 ESM 无效；用户目录 / 托管工作区位置也可能变，
   所以按顺序探测，全部落空时给出可执行的安装提示。 */
const req = createRequire(import.meta.url)
export function loadChromium() {
  const cands = [
    process.env.PLAYWRIGHT_PATH,
    path.join(SITE, 'node_modules/playwright/index.js'),
    path.join(os.homedir(), '.workbuddy/binaries/node/workspace/node_modules/playwright/index.js'),
    path.join(os.homedir(), '.workbuddy/binaries/node/workspace/node_modules/playwright-core/index.js'),
  ].filter(Boolean)
  for (const c of cands) {
    if (!existsSync(c)) continue
    try {
      const pw = req(c)
      if (pw && pw.chromium) return pw.chromium
    } catch { /* 换下一个 */ }
  }
  try {
    const pw = req('playwright')
    if (pw && pw.chromium) return pw.chromium
  } catch { /* 没装 */ }
  throw new Error(
    '没找到 playwright。二选一：\n' +
    '  1) 装到托管工作区：' +
    'node -e "process.chdir(require(\'os\').homedir()+\'/.workbuddy/binaries/node/workspace\')" 后 npm i playwright\n' +
    '  2) 用环境变量指路：PLAYWRIGHT_PATH=<playwright/index.js 绝对路径>'
  )
}

/* ---------- 起浏览器：优先本机已装的 Edge/Chrome，免下载 chromium ----------
   托管环境常常下不了 playwright 自带的 chromium（体积大 + 网络限制），
   而 Windows 一定自带 Edge，所以按 bundled → msedge → chrome 的顺序试。
   想固定渠道就设 PW_CHANNEL=msedge。 */
export async function launchBrowser(opts = {}) {
  const chromium = loadChromium()
  const tried = []
  try { return await chromium.launch(opts) } catch (e) { tried.push('bundled: ' + String(e.message).split('\n')[0]) }
  const channels = process.env.PW_CHANNEL ? [process.env.PW_CHANNEL] : ['msedge', 'chrome']
  for (const channel of channels) {
    try { return await chromium.launch({ ...opts, channel }) } catch (e) { tried.push(`${channel}: ${String(e.message).split('\n')[0]}`) }
  }
  throw new Error('起不了浏览器：\n  ' + tried.join('\n  '))
}
