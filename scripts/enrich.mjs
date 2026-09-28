// Enrich package data with curated deep-dive content for the ~40 spine packages,
// plus auto-extract key code excerpts from the source tree.
import { readFileSync, writeFileSync } from 'node:fs'

const ROOT = 'D:/下载的软件在这里！/deepseek-harness源码/deepseek-harness'
const OUT = 'D:/临时/dsh研究/data'
const read = p => { try { return readFileSync(p, 'utf8') } catch { return '' } }

// ---------- curated layer knowledge ----------
// Each layer: plain-language explanation for a beginner + key mechanics
const LAYERS = [
  {
    id: 'cordis', title: 'Cordis 框架层', en: 'The Plugin Kernel',
    tagline: '一切皆插件——没有需要打补丁的核心',
    icon: '🧩',
    beginner: `dsh 最根本的设计是：整台机器没有"内核"。模型适配器、工具注册表、会话日志、连 agent 循环本身，全都是插件。<br><br>你启动 dsh 时，它做的事情不是"运行一个程序"，而是<strong>把一堆插件按顺序插到一根共享的上下文（Context）上</strong>。插件之间不互相 import，而是通过一个"服务名"（比如 <code>ctx.tools</code>）去找到对方。<br><br>这样做的好处：想换掉任何一个部件，你不需要改核心代码，只要在配置里把那一行插件换掉。`,
    mechanics: [
      { k: '插件(Plugin)', v: '一个实现了 Service 的对象，或一个带 apply(ctx) 的函数。挂到 Context 上就生效。' },
      { k: '服务(Service)', v: '占用一个稳定的 ctx.<key>，例如 ctx.tools、ctx.llm。别人按键找服务，不 import 具体实现。' },
      { k: '依赖声明 inject', v: '插件声明"我需要 ctx.tools"，Cordis 就等 ctx.tools 存在了才启动它。加载顺序由依赖决定，不用手工编排。' },
      { k: '类型化事件', v: '服务通过 TypeScript 声明合并注册事件名，然后按 5 种模式派发（见下）。' },
      { k: '注册即副作用', v: '所有贡献都通过 ctx.effect() / ctx.on() 安装，插件卸载时自动回滚。这就是"热重载"能工作的原因。' },
    ],
    dispatch: [
      { mode: 'emit', awaited: '否', order: '按注册顺序', ret: '无', use: '广播通知：状态变了、事件发生了' },
      { mode: 'waterfall', awaited: '否', order: '按注册顺序（洋葱模型）', ret: '有', use: '拦截器/策略：监听者可包装或短路结果' },
      { mode: 'parallel', awaited: '是', order: '所有监听者并行', ret: '无', use: '无关的并发副作用' },
      { mode: 'serial', awaited: '是', order: '按注册顺序', ret: '有', use: '需要严格顺序的终局检查' },
      { mode: 'bail', awaited: '否', order: '顺序执行直到有人返回非空', ret: '有', use: '第一个能处理的赢' },
    ],
    codeRefs: ['vendor/cordis/src/index.ts'],
  },
  {
    id: 'composition', title: '组合层', en: 'Profiles & Bundles',
    tagline: '同一个启动器，五种形态',
    icon: '🎛️',
    beginner: `dsh 只有一个可执行入口（CLI 的 <code>dsh</code>），但能跑出 Web 界面、一次性命令行任务、SDK 服务、ACP 服务四种形态。靠的是 <strong>profile（档案）</strong> 和 <strong>bundle（包层）</strong>。<br><br>把启动过程想象成<strong>叠纸</strong>：先铺最底层的 <code>dsh-base</code>（模型、工具、持久化、安全策略），再叠上形态专属的层（如 <code>dsh-web-app</code> 加浏览器界面），最后叠你自己的补丁。<strong>后叠的覆盖先叠的</strong>，按行 id 定点覆盖。`,
    mechanics: [
      { k: 'profile', v: '一个命名组合，存在 $DSH_HOME/profiles/<name>。列出它叠哪些 bundle、装了哪些外部插件、以及用户自己的 cordis.patch.yml。' },
      { k: 'bundle', v: '一种分发格式，打包一批 Cordis 配置行和它们要挂的代码。以 YAML 补丁文件形式存在。' },
      { k: '补丁语义', v: '补丁<strong>整体替换</strong>目标行的 config，不是合并。所以要保留的字段必须重新写全。' },
      { k: '叠加顺序', v: '各 bundle 按 profile 声明顺序 → profile 的 cordis.patch.yml → home 级 cordis.patch.yml → --patch 覆盖。' },
      { k: '热重载', v: '自定义 profile 默认 live（改配置即时生效）；headless/sdk/acp 是 startup（一次性应用，因为一次性应用中途换依赖会破坏生命周期）。' },
    ],
    bundles: true,
    codeRefs: ['packages/bundle/base/cordis.patch.yml'],
  },
  {
    id: 'boot', title: '启动层', en: 'Boot & CLI',
    tagline: '从一行命令到一棵运行中的插件树',
    icon: '🚀',
    beginner: `你在终端敲 <code>dsh web</code>，背后发生的事：<br><br>1. CLI 解析参数，识别出你要 <code>web</code> profile；<br>2. 从 <code>$DSH_HOME/profiles/web</code> 读出这个 profile 要叠哪些 bundle；<br>3. 把各 bundle 的 YAML 补丁依次应用到一个空的插件行列表上；<br>4. 把这个列表交给 Cordis Loader，Loader 逐个挂载插件；<br>5. 插件靠 inject 声明互相等待，最终整棵树稳定运行。<br><br>任何一步失败都会<strong>大声失败</strong>：打印一行标明是哪个插件、哪个阶段出错，然后非零退出——不会静默半启动。`,
    mechanics: [
      { k: 'installFailLoud', v: '安装"响亮失败"处理器：失败绝不静默。' },
      { k: 'boot()', v: '核心启动函数：加载环境层、应用补丁和 profile、启动所有插件。' },
      { k: 'cordis.snapshot.yml', v: '回放模式下改用这个文件启动，保证录制过的会话能逐位复现。' },
      { k: '环境层 .env', v: '调用目录的 .env 优先于 Harness home 的；两者都低于继承来的环境变量。启动相关变量（PATH/DSH_*/XDG_*）禁止从文件读。' },
      { k: '恢复机制', v: '应用启动会先装到暂存区、启动完整后端做健康检查，成功后才替换当前 profile。有日志和一个回滚 profile 兜底。' },
    ],
    codeRefs: ['packages/boot/app-boot/src/index.ts'],
  },
  {
    id: 'spine', title: '核心脊柱', en: 'The Agent Spine',
    tagline: '一个 turn 流过六个包',
    icon: '🦴',
    beginner: `这是全系统的心脏。一次对话往返叫一个 <strong>turn</strong>，turn 里可以包含 0 到多个 <strong>step</strong>，一个 step = 一次模型请求 + 它引发的工具调用。<br><br>六个包按固定顺序协作：<br><br><strong>agent-loop</strong> 从队列取一条消息 → 在 <strong>session</strong> 日志上开一个 turn → 让 <strong>system-prompt</strong> 组装提示词、从日志推导出历史 → 通过 <strong>llm</strong> 流式请求模型 → 模型返回的工具调用交给 <strong>tools</strong> 执行 → 每个模型可见的事实都追加回日志，下一个 step 再从中推导。`,
    mechanics: [
      { k: 'turn', v: '一次已接纳输入的抽取过程。在第一条输入被认领前开启，在没有任何待办时关闭。' },
      { k: 'step', v: '一次模型请求 + 它引发的工具执行。turn 包含 0 个或多个 step。' },
      { k: '唯一信源', v: 'session 日志是唯一真相。模型历史是从日志<strong>推导</strong>出来的，从不单独存储。' },
      { k: '模型可见即可追溯', v: '"模型可见就意味着被记录"——任何进入模型请求的东西都必须能从日志重建，有运行时不变式断言这一点。' },
      { k: '循环可换', v: '扩展插件依赖 dsh-agent（接口），永远不依赖 dsh-agent-loop（实现），所以循环本身可替换。' },
    ],
    flow: true,
    codeRefs: ['packages/core/agent-loop/src/agent.ts'],
  },
  {
    id: 'session', title: '会话日志', en: 'The Session Log',
    tagline: '追加写入的事件流，一切历史的总根源',
    icon: '📜',
    beginner: `Session 就是一个<strong>只能往后追加的日志</strong>，每条记录都是一个带类型的 <code>SessionEvent</code>。<br><br>关键洞察：<strong>模型看到的对话历史不是存出来的，是算出来的</strong>。日志里存的是"发生了什么"（用户发了消息、模型回了消息、调用了工具），要发给模型的 message 数组是从这些事件现场推导的。这样重放、分叉、压缩、迁移全都只依赖这一份日志。<br><br>日志里还有"表面（surface）"的概念：某些事件会给 node 打标记，压缩时旧的 node 被标记为替代而不删除——事件永不消失，只是对模型隐藏。`,
    mechanics: [
      { k: 'SessionEventMap', v: '事件词汇表，可通过声明合并扩展。插件加新事件类型 = 往这个 map 里加一条。' },
      { k: 'surface（表面）', v: '模型可见的那一层。surfaceOp: append 追加节点，replacement 表示替代旧节点。折叠函数 foldSurface 从事件算出可见节点表。' },
      { k: 'assistant/attempt', v: '失败/重试/取消的尝试也会记录（带完整流），但不进入模型历史。' },
      { k: '持久化格式', v: 'JSONL，v0 用 session.jsonl[.zstd]，v1+ 用 session.vN.jsonl[.zstd]。已提交的代际文件永不重命名、覆盖或删除。' },
      { k: '迁移链', v: '相邻迁移包各负责一步 vN → vN+1。读旧会话时静态串起迁移链，解码一次后返回当前版本。' },
    ],
    codeRefs: ['packages/core/session/src/index.ts', 'packages/core/session/src/surface.ts'],
  },
  {
    id: 'prompt', title: '系统提示词', en: 'System Prompt',
    tagline: '有序段落 + 工具 schema 的组装',
    icon: '📝',
    beginner: `<code>ctx.systemPrompt</code> 是一个注册表：任何插件都可以贡献<strong>一段提示词</strong>（PromptSection），按 <code>order</code> 数字排序拼接；也可以贡献<strong>工具 schema</strong>和<strong>变量</strong>。<br><br>组装时还有一个 waterfall 事件 <code>system-prompt/assemble</code>，让监听者能拦截并改写整个组装结果。<br><br>重要细节：提示词只以 <code>system/message</code> 历史的形式存在。空渲染会清掉所有活跃 system 节点；能力圈出的路由可以在缓存前缀后追加非空更新。`,
    mechanics: [
      { k: 'PromptSection', v: '{ name, order, text }。text 可以是静态字符串，也可以是每次组装时求值的函数。' },
      { k: 'complete 段', v: '声明为"完整提示词"的段：组装仍跑协作 waterfall，但最后该段被恢复为唯一段落。多过一个完整段会导致组装失败。' },
      { k: '工具 schema', v: '工具注册表通过 ctx.systemPrompt.tools(...) 把自己的 schema 接入提示词组装。' },
      { k: '作用域覆盖', v: 'agent-scoped 的同名贡献会覆盖全局默认值，只影响那一个 agent。' },
      { k: '失败即拒绝', v: '无效的完整提示词组合、未解析的变量会让组装失败——而不是发一个畸形提示词出去。' },
    ],
    codeRefs: ['packages/core/system-prompt/src/index.ts'],
  },
  {
    id: 'tools', title: '工具系统', en: 'The Tool Registry',
    tagline: '六层管道的守卫式执行',
    icon: '🔧',
    beginner: `工具就是模型能调用的能力。<code>ctx.tools</code> 既管"模型看得见哪些工具"，也管"调用时经过哪些关卡"。<br><br>一次工具调用穿过一条<strong>六层管道</strong>：<br><br><code>tool/call</code>（先记录）→ <code>tools/pre-execute</code> 瀑布（钩子、权限、沙箱）→ 单调守卫（拒绝或放行）→ <code>ctx.approval</code> 一次性询问 → <code>tools/execute</code> 瀑布（超时、重试、指标）→ 工具自己的 execute() → <code>tools/post-execute</code> 瀑布（接受/阻止/替换/加上下文）→ <code>finalizeContent</code> → <code>tools/result</code> 通知。<br><br>这样设计让钩子能横跨所有工具家族，而工具本身不需要知道任何策略服务。`,
    mechanics: [
      { k: 'defineTool', v: '工具作者用它声明：带类型的参数（zod 风格）、输出、协作式超时、是否并行安全、可选的 UI 呈现。' },
      { k: '并行调度', v: 'registry 把调用按 executionMode 分类，maxParallelToolCalls 限流（默认 10），独占调用保持顺序。' },
      { k: '拒绝语义', v: '普通工具失败不会结束 turn——返回 isError 结果，模型可以自己纠错。' },
      { k: '作用域限制', v: 'tools.restrict 能按 scope 过滤全局工具集。被过滤掉的工具在提示词里不存在，执行时也拒绝，与"根本没这个工具"无法区分。' },
      { k: 'PTC 模式', v: 'Present-As-Tool-Code 模式：模型只看到一个 run_code，其他工具变成代码里的 SDK 绑定，在程序内调用。可用 mode: native|ptc|both 切换。' },
    ],
    pipeline: true,
    codeRefs: ['packages/core/tools/src/index.ts'],
  },
  {
    id: 'llm', title: '模型接入', en: 'LLM Capability',
    tagline: '适配器接缝 + 统一流协议',
    icon: '🧠',
    beginner: `<code>ctx.llm</code> 是模型适配器的注册表。不同厂商的 API 差异全部封在各自的适配器里，上层只看到统一的 <code>StreamChunk</code> 流。<br><br>请求在派发前会被<strong>深度冻结</strong>——扩展和适配器只能读不能改写，保证日志里记录的和实际发出去的一致。每个流都以一个终态结果结束，所以调用方能用同一种方式处理成功、失败和取消。`,
    mechanics: [
      { k: '内容块', v: '消息是 ContentBlock 数组：text / reasoning / image / file / tool-call / tool-result。可合并扩展。' },
      { k: '适配器契约', v: '每个适配器实现稳定接口，provider 特有的翻译留在适配器内部。' },
      { k: 'llm/stream 瀑布', v: '流式请求本身是一个 waterfall 事件，可被拦截（比如 llm-replay 用它做录制回放）。' },
      { k: '重试', v: 'llm-retry 是独立可选包，监听 agent/request-error 决定是否用同一份已渲染的装配重试。' },
      { k: 'token 计量', v: 'token-meter 从日志重放测量 token 用量，不额外调模型。' },
    ],
    codeRefs: ['packages/llm/llm/src/index.ts'],
  },
  {
    id: 'seam', title: '能力接缝', en: 'Capability Seams',
    tagline: '一个接口，多个实现，换一个就换全产品',
    icon: '🔌',
    beginner: `<strong>接缝（seam）</strong>是全项目最重要的架构模式。<br><br>一个能力拆成三个角色：<br>· <strong>Service Definition</strong>（服务定义）—— 声明接口，占用 ctx key，定义类型词汇<br>· <strong>Service Provider</strong>（服务提供者）—— 具体实现<br>· <strong>Consumer</strong>（消费者）—— 使用这个服务的东西，通常是模型面向的工具<br><br>为什么重要：文件系统和子进程提供者共享同一个"执行世界"。把它们指向远程沙箱，<strong>Bash、PTY、LSP 会一起搬过去</strong>，不需要给任何提供者写分支代码。`,
    mechanics: [
      { k: '不是接口', v: 'Service Definition 必须是 Cordis 的 Service（抽象类或具体注册表），不是 TS interface。' },
      { k: '典型范例', v: 'packages/shell：dsh-shell 是定义，bash-local / bash-sandbox 是提供者，tool-bash 是消费者。' },
      { k: '可合并角色', v: '一个包可以同时担任多个角色（当它们是一个关注点）。但单独一个角色不构成接缝。' },
      { k: '设计三件套', v: '加一个新能力 = 设计全部三个角色，缺一不可。' },
      { k: '实际影响', v: 'subagent 提供者从"同进程子 agent"到"另一个产品里的委托 turn"差异极大，但都藏在同一个接口后面。' },
    ],
    seams: true,
    codeRefs: ['packages/shell/shell/src/index.ts', 'packages/fs/fs/src/index.ts'],
  },
  {
    id: 'scope', title: '作用域', en: 'Scope & Isolation',
    tagline: '每个 agent 一套隔离的贡献集',
    icon: '⭕',
    beginner: `<strong>scope（作用域）</strong>是"每个 agent 注册的单位"。一个贡献（工具、提示词段、变量、限制、监听器）要么是<strong>全局的</strong>（每个 agent 都看得见），要么是<strong>作用域的</strong>（属于恰好一个 scope key）。<br><br>只有两层，是扁平的：作用域注册<strong>不会</strong>向下继承给子 agent。子树行为用 lineage（血缘）数据表达，绝不用 scope 结构表达。`,
    mechanics: [
      { k: 'scope key', v: '一个不透明的身份，按对象身份比较。约定：一个活着的 agent 就是它自己作用域的 key。' },
      { k: 'agent.ctx', v: 'agent 的作用域上下文。通过它注册 = 作用域可见 + 作用域生命周期（一个事实同时驱动两件事）。' },
      { k: '遮蔽 shadowing', v: '最具体的赢：作用域内同名工具/段落/变量替换掉全局的同名版本，只在这一个作用域内。' },
      { k: 'scoped dispatch', v: '关于某个 agent 活动的事件，用那个 agent 的 carrier 派发。关于注册表本身的事件（某工具被加了）不带过滤。' },
      { k: '血缘 lineage', v: 'parentSession / delegationDepth / subagentDepth 作为<strong>数据</strong>携带，绝不影响可见性。' },
    ],
    codeRefs: ['packages/core/scope/src/index.ts'],
  },
  {
    id: 'persistence', title: '持久化', en: 'Persistence',
    tagline: '代际不可变的 JSONL 存储',
    icon: '💾',
    beginner: `会话日志默认只在内存里。加上持久化后端后，它会被写成磁盘文件。<br><br>设计的关键是<strong>代际不可变</strong>：一旦某代文件被提交，就永不被重命名、覆盖或删除。升级格式时，<strong>在旁边写一份新代际的文件</strong>，旧的原封不动。这样任何历史版本的数据都能被追溯和审计。`,
    mechanics: [
      { k: '文件名规则', v: 'v0 用 session.jsonl[.zstd]；v1 及以后用 session.vN.jsonl[.zstd]（小写 vN）。' },
      { k: '读写不对称', v: '只读打开用内存结果，不发布后继代际；写入打开会先编码、校验，然后独占发布新的版本命名后继。' },
      { k: '崩溃修复', v: '未封口的尾部由 handle 消费者负责常规修复；迁移只在特定已发布的重启场景补一个缺失的 turn/end。' },
      { k: '压缩', v: '支持 zstd 与不压缩两种物理编码。' },
      { k: '存储域', v: '非会话数据走 storage 中枢（storage-json / storage-sqlite），用单调的 SCHEMA_VERSION。' },
    ],
    codeRefs: ['packages/session/session-persistence-jsonl/src/format.ts', 'packages/session/session-persistence-jsonl/src/generation.ts'],
  },
  {
    id: 'exec', title: '执行世界', en: 'Shell / FS / Sandbox / Terminal',
    tagline: '同一套边界，Bash、PTY、LSP 一起搬',
    icon: '⚙️',
    beginner: `模型要跑命令、读写文件。<code>ctx.shell</code> 提供命令执行，<code>ctx.fs</code> 提供文件访问，<code>ctx.subprocess</code> 是它们的共同底座，<code>ctx.sandbox</code> 负责进程围栏。<br><br>这四个是<strong>互相咬合</strong>的：shell 通过 subprocess 派生进程，fs 的写入要过 sandbox 策略，PTY 终端和 LSP 也走同一套。所以把它们一起指向远程沙箱，整套执行能力就整体迁移了。`,
    mechanics: [
      { k: 'ctx.shell', v: '抽象类 ShellExecutor。语义约定：run() 只为基础设施故障 reject；非零退出、超时杀掉、中止杀掉都<strong>正常 resolve</strong> 并带结果描述。' },
      { k: 'ctx.subprocess', v: '子进程接缝。本地实现管理进程树，共享 Win32 库。' },
      { k: 'ctx.fs', v: '文件系统服务定义。后端管理目标身份、进程路径与 file URI、包含性、文本读取、解码、二进制拒绝、原子修改。' },
      { k: 'ctx.sandbox', v: '进程围栏接缝，有 bwrap / Landlock / Seatbelt / Windows ACL 多种后端。消费者在派生前包装 argv。' },
      { k: 'ctx.terminals', v: '持久 PTY 会话。跨多轮保留 shell 状态，与一次性命令互补。' },
      { k: '策略模式', v: '默认 workspace-write：写入限制在工作区 + 会话自己的临时子目录；read-only 什么都不给；danger-full-access 全放开。' },
    ],
    codeRefs: ['packages/shell/shell/src/index.ts'],
  },
  {
    id: 'interface', title: '交互平面', en: 'Human Interaction',
    tagline: '权限、审批、提问、命令',
    icon: '🙋',
    beginner: `Agent 在动手前可能需要问人。这里有三个接缝各有分工：<br><br>· <code>ctx.approval</code> —— 工具执行前的<strong>一次性批准</strong>（危险操作弹窗）<br>· <code>ctx.userQuestions</code> —— <strong>问答接缝</strong>，模型主动问用户问题（ask_user_question 工具）<br>· <code>ctx.commands</code> —— <strong>人类命令</strong>，斜杠开头的指令，由人面对适配器解释执行，<strong>不变成模型消息</strong><br><br>权限预设把沙箱模式 + 审批策略打包成命名组合：read-only / workspace-write / danger-full-access。`,
    mechanics: [
      { k: '审批语义', v: '在 pre-execute 之后、单调守卫之前解析。缺失或无法回答 = 默认拒绝。' },
      { k: '命令 vs 工具', v: '人类命令由 ctx.commands 处理，不算模型消息；模型面向的工具走 ctx.tools；shell 命令走 ctx.shell。三者严格区分。' },
      { k: '权限预设', v: 'read-only→(read-only, ask)；workspace-write→(workspace-write, ask)；danger-full-access→(danger-full-access, never)。' },
      { k: '阻塞式提问', v: 'ask_user_question 会暂停这个工具调用，直到活跃的 UI 提供者返回人类答案。' },
    ],
    codeRefs: ['packages/interaction/user-approval/src/types.ts'],
  },
  {
    id: 'context', title: '上下文注入', en: 'Context Injection',
    tagline: '让模型知道它在哪里',
    icon: '📍',
    beginner: `模型需要一些"背景知识"，比如工作目录里有没有 AGENTS.md、现在几点、用户引用了哪个文件。<br><br>这些东西通过 <code>agent.inject()</code> 注入——它们会作为<strong>合成的 user 消息</strong>进入下一个被接纳的请求，并且同样被记进日志（因为"模型可见即可追溯"）。<br><br>注入的上下文会在 inbox 里等，直到有别的消息把它唤醒。`,
    mechanics: [
      { k: 'agent-instructions', v: '读取工作目录的 AGENTS.md 等指令文件，注入为上下文。' },
      { k: 'time-context', v: '注入当前时间。' },
      { k: 'file-reference', v: '文件引用发现与注入。' },
      { k: 'session-reference', v: '跨会话快照准备——把别的会话内容引进来。' },
      { k: 'todo_write', v: '任务清单是会话自有状态，UI 渲染最新的 todo/write 事件为勾选列表。' },
    ],
    codeRefs: ['packages/context/time-context/src/index.ts'],
  },
  {
    id: 'longrun', title: '长任务能力', en: 'Compaction / Goal / Jobs / Workflow',
    tagline: '上下文满了怎么办，任务跑很久怎么办',
    icon: '⏳',
    beginner: `模型上下文有限，任务可能跑很久。四个机制应对：<br><br>· <strong>compaction（压缩）</strong> —— 上下文压力大时，把一段历史替换成一个摘要节点。旧事件不删除，只是对模型隐藏。<br>· <strong>goal（目标）</strong> —— 给会话挂一个持久的目标，有 active/paused/blocked/complete 状态和轮次上限。<br>· <strong>jobs（后台作业）</strong> —— 通用的后台任务运行时，用 job_* 工具收集或停止。<br>· <strong>workflow</strong> —— 脚本化的工作流引擎，跑在 worker thread 里；ralph 是它的一种固定用法（每轮开一个全新 agent）。`,
    mechanics: [
      { k: '压缩触发', v: '两种触发：pressure（压力）和 context-overflow（上下文溢出）。基础提供者用 agent/pre-step 处理压力，用 agent/request-error 处理溢出。' },
      { k: '工具结果裁剪', v: '先做无模型的工具结果裁剪（保留头尾），再跑更宽的对话压缩器。' },
      { k: 'goal 轮次', v: '同会话驱动器把一轮目标实现为一个 goal-sourced turn。不相关的人类 turn 不消耗目标轮次上限。' },
      { k: 'activation', v: 'goal 的激活是进程本地的（armed/disarmed），故意不进持久重放——所以恢复和分叉需要人来重新授权。' },
      { k: 'Ralph', v: '一轮 = 一个全新的子会话，不接收父会话或前序子会话的对话种子。跨轮状态靠共享工作区 + 一份有界结构化交接报告。' },
    ],
    codeRefs: ['packages/compaction/compaction/src/index.ts'],
  },
  {
    id: 'multiagent', title: '多智能体', en: 'Subagents & Delegation',
    tagline: '一个接口，从子进程到别的产品',
    icon: '👥',
    beginner: `<code>ctx.subagents</code> 是子智能体提供者接缝。模型通过 <code>subagent</code> 工具把任务委托出去。<br><br>提供者的差异非常大：可以是同进程里新开一个子 agent（spawn）、可以是父会话的分叉（fork）、可以是另一个 DSH 实例（dsh-sdk）、甚至可以是 <strong>Claude Code 或 Codex</strong>——但模型看到的工具契约是一样的。<br><br>子 agent 的持久身份记录在一个模型不可见的 <code>subagent/descriptor</code> 事件里，标明它是一次性的还是可续的。`,
    mechanics: [
      { k: 'spawn', v: '开一个全新的子 agent，干净上下文。' },
      { k: 'fork', v: '从父会话某个 turn 边界分叉，继承历史。fork 不选模型，保持与父相同以便复用 KV Cache。' },
      { k: 'continuable/one-shot', v: '可续的子 agent 保留完整的恢复组合；一次性子 agent 跑完即弃。' },
      { k: '控制工具', v: 'send_message / interrupt_agent / list_agents —— 全局命名，作用于可续的后台子 agent。' },
      { k: '深度追踪', v: 'delegationDepth（持久）和 subagentDepth（运行时）作为血缘数据携带。' },
      { k: 'Agent Teams', v: '实验性的协调接缝 ctx.agentTeams：在可续子 agent 之上叠了持久花名册、任务板和信箱。' },
    ],
    codeRefs: ['packages/subagent/subagent/src/types.ts'],
  },
  {
    id: 'extensibility', title: '扩展与观测', en: 'Hooks / Skills / MCP / Self-mod',
    tagline: '外部能力如何接进来，内部如何被观察',
    icon: '🔗',
    beginner: `dsh 留了多条接入外部世界的通道：<br><br>· <strong>hooks</strong> —— 兼容 Claude Code / Codex 的钩子协议，把外部钩子桥接进工具管道的 pre/post 阶段<br>· <strong>skills</strong> —— 技能提供者注册表，模型通过 skill 工具加载技能目录<br>· <strong>MCP</strong> —— 把外部 MCP server 的工具注册成本地工具，名字形如 <code>mcp__github__create_issue</code><br>· <strong>self-modification</strong> —— agent 可以检查甚至动态挂载自己的插件（cordis_define / cordis_run 等）<br>· <strong>webhook</strong> —— 经签名验证的外部事件触发会话`,
    mechanics: [
      { k: '钩子桥', v: 'hooks-claude-code / hooks-codex 监听 tools/pre-execute、tools/post-execute、agent/pre-step、agent/turn-stopping 等事件，转成外部钩子调用。' },
      { k: 'hook-protocol', v: '共享的线协议库，往日志里追加 log-only 的 hook/invoked 和 hook/result 记录。' },
      { k: '技能', v: 'skill-filesystem 从文件系统发现技能；tool-skill 把技能内容通过 agent.inject() 作为 user 消息替换目录注入。' },
      { k: 'MCP 桥', v: '每个 MCP server 一个配置项，工具以 mcp__<server>__<tool> 命名注册到 ctx.tools。只桥接 tools，不支持 resources 和 prompts。' },
      { k: '动态插件', v: 'cordis-host-runner 拥有定义注册表和 vm 沙箱；运行中的包可以注册<strong>额外的</strong>模型可见工具，直到被停止或未定义。' },
    ],
    codeRefs: ['packages/hooks/hook-protocol/src/index.ts'],
  },
  {
    id: 'surface-ui', title: '界面层', en: 'Web / Desktop / SDK / ACP',
    tagline: '四种形态，同一套后端',
    icon: '🖥️',
    beginner: `后端是同一棵树，前面有四种壳：<br><br>· <strong>Web</strong> —— 浏览器界面，默认 <code>http://127.0.0.1:3080</code><br>· <strong>Headless</strong> —— 一次性任务，无服务器，跑完打印结果<br>· <strong>SDK</strong> —— 进程外 SDK，JSON-RPC over stdio（TS 和 Python 都有客户端）<br>· <strong>ACP</strong> —— 仅用于自动化的 Agent Client Protocol 服务<br>· <strong>Desktop</strong> —— Electron 壳，<strong>不开监听端口</strong><br><br>Web 界面本身也是 Cordis 应用：浏览器端有一棵独立的插件树，通过 Remote（类型化 RPC）和主机端通信。`,
    mechanics: [
      { k: 'Remote 层', v: 'Client → Host 的类型化方法调用。remotes 决定暴露哪些能力，gateway 负责搬运调用和结果，控制器包（session-controller 等）拥有具体行为。' },
      { k: 'Typert', v: '构建期类型图生成器：把源码类型声明变成运行时反射、schema 和 Remote 描述符，免去手写 wire 代码。' },
      { k: 'Slots', v: 'Web 客户端的类型化 React 组合系统。声明一个子槽位 = 让它可用 + 授权父级渲染它 + 记录分发规格。' },
      { k: 'Conversation', v: '会话事件窗口 → 各目标视图（Chat / Trajectory）的装配层。每个目标有独立的 Definition 和最终快照类型。' },
      { k: 'Desktop 传输', v: '不开 Web 端口。dsh-app:// 承载 Web 资产和 Fetch 流量，带版本号的分帧字节管道承载有界请求和响应块，Node IPC 只负责子进程生命周期。' },
    ],
    codeRefs: ['packages/client/web/src/boot.ts'],
  },
]

// ---------- key code excerpts ----------
const EXCERPTS = [
  { file: 'packages/core/agent-loop/src/agent.ts', label: 'turn 循环主结构', sig: 'private async turn()', lines: 62 },
  { file: 'packages/core/session/src/surface.ts', label: 'surface 折叠', sig: 'export function foldSurface', lines: 22 },
  { file: 'packages/core/tools/src/index.ts', label: 'ToolRuntime 服务', sig: 'export class ToolRuntime', lines: 30 },
  { file: 'packages/shell/shell/src/index.ts', label: 'ShellExecutor 抽象类', sig: 'export abstract class ShellExecutor', lines: 30 },
  { file: 'packages/core/agent/src/types.ts', label: 'Agent 公开接口', sig: 'interface Agent {', lines: 20 },
  { file: 'vendor/cordis/src/index.ts', label: 'Cordis 核心', sig: 'export class Context', lines: 24 },
]

function excerpt(file, sig, maxLines) {
  const txt = read(`${ROOT}/${file}`)
  if (!txt) return null
  const lines = txt.split('\n')
  const i = lines.findIndex(l => l.includes(sig))
  if (i < 0) return null
  return { code: lines.slice(i, i + maxLines).join('\n'), line: i + 1 }
}

const code = {}
for (const e of EXCERPTS) {
  const r = excerpt(e.file, e.sig, e.lines)
  // line 用于「读全文」精确跳转到片段起始行
  if (r) code[e.label] = { file: e.file, code: r.code, line: r.line }
}
writeFileSync(`${OUT}/code.json`, JSON.stringify(code, null, 1))

writeFileSync(`${OUT}/layers.json`, JSON.stringify(LAYERS, null, 1))
console.log('layers', LAYERS.length, '| code excerpts', Object.keys(code).length)
