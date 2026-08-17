# DeepSeek Harness 与首批 Provider 兼容性核验

核验日期：2026-08-17
核验对象：DeepSeek Harness、Claude Code、Codex CLI、Antigravity CLI、Pi
核验方式：本地只读命令、官方文档、官方仓库与 Release，以及固定 Commit 临时源码目录中的官方测试。只在临时目录安装锁定依赖；未安装用户级 DSH、未升级或登录 Provider、未修改用户配置、未调用真实模型。

## 结论摘要

**结论：插件方向可行，但不能把 DeepSeek Harness 现有 Workflow 和后台 Job 直接等同于“可持久恢复的团队任务运行时”。**

已确认可复用的官方底座：

- 可安装的静态插件 Bundle、Cordis 插件生命周期和 Web UI Slot。
- 设置页、会话级 View、会话 Header Action、输入 Dock、全局 Overlay 等 UI 扩展点。
- Host 内部的强类型事件订阅，以及 Browser 的 Session 事件流、Projection、后台 Job 快照和会话状态流。
- Session 日志持久化、进程崩溃后的中断 Turn 修复、Agent Session 恢复。
- Workflow 的并行 Subagent 调度、取消和生命周期事件。
- Job 注册、读取、等待、取消，以及跨平台的受管子进程树终止。
- Claude Code 与 Codex 的官方 Harness Subagent Provider。

当前缺口：

1. 官方 Workflow 明确没有 journaling/resume；进程重启后不能续跑原 Workflow。
2. 默认 Job Registry 只存在于当前进程，重启后记录丢失。
3. 目前没有可加法插入的“当前会话右侧运行面板”专用 Slot。可先用会话 View/Overlay 落地；若必须常驻右侧并与 Tool Details 共存，需要给 `ui-layout` 增加一个小型正式 Slot。
4. Harness 原生 Claude/Codex Provider 是一次性、最终文本型 Provider，不提供 Provider Session 恢复、进度流或结构化输出契约。
5. Harness 没有已核验的 Antigravity CLI 或 Pi CLI Subagent Provider；需要基于 `ctx.subagents` 与 `ctx.subprocess` 新增适配器。Harness 中的 `llm-pi-ai` 是模型适配层，不等同于 Pi Coding Agent CLI Provider。
6. 本机 Antigravity `1.1.11` 存在官方已经修复的 headless 权限模式缺陷，当前不能作为安全写入 Provider。
7. Pi 官方明确没有内建 OS sandbox；没有外部沙箱时只能承担低风险/只读角色。

因此首条闭环应采用：**静态 DSH Bundle + 插件自有持久任务账本 + Harness Workflow/Subagent 作为单次执行原语 + Harness Subprocess 统一超时与终止 + Session 事件/Projection 驱动 UI。**

## 1. 核验基线

### 1.1 DeepSeek Harness

| 项目 | 值 |
|---|---|
| 官方仓库 | `deepseek-ai/deepseek-harness` |
| 固定 Commit | `47f943859bef60e4160492346772ded9b24f765a` |
| Commit 时间 | 2026-08-13 19:38:46 +0800 |
| 根包版本 | `0.1.0-rc.5` |
| 核验日远端 HEAD | 同上，2026-08-17 只读 `git ls-remote` 核验 |
| 本机 `dsh` | 未安装/不在 PATH；已完成临时源码核心官方测试，尚未完成真实 Profile/Bundle 启动 |

固定源码入口：

- [仓库固定 Commit](https://github.com/deepseek-ai/deepseek-harness/tree/47f943859bef60e4160492346772ded9b24f765a)
- [根 package.json](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/package.json)

本机运行结果详见 `docs/tracking/gate-0-local-runtime-validation-2026-08-17.md`。

### 1.2 本机 Provider 与官方版本

| Provider | 本机入口与版本 | 截至 2026-08-17 的官方版本 | 当前判断 |
|---|---|---|---|
| Claude Code | PATH 中的 `claude`，`2.1.218` | `2.1.233`，2026-08-14，commit `0fa8c19` | 可检测；需在锁定版本上做真实适配测试 |
| Codex CLI | ChatGPT App 内置 `codex`，`0.148.0-alpha.9` | 稳定 `0.147.0`；最新预发布 `0.148.0-alpha.20` | 本机为预发布，不应默认视为稳定兼容 |
| Antigravity CLI | PATH 中的 `agy`，`1.1.11` | `1.1.13`，2026-08-15，commit `f7519c9` | 仅实验性；存在已知 headless 安全缺陷 |
| Pi | PATH 中的 `pi`，`0.84.1` | `0.84.2`，2026-08-14，commit `914cf14` | 控制协议合适；安全隔离未闭合 |

说明：Provider “官方版本”来自各自第一方 Release；本次没有执行升级。Codex 的稳定版与预发布版必须分通道比较，不能只按版本号大小判断。

本地只读探测中观察到：

- `codex --help` 尝试创建 PATH alias，被当前文件系统沙箱拒绝，未成功写入。
- `pi --help` 尝试创建 `~/.pi/agent/settings.json.lock`，被当前文件系统沙箱拒绝，未成功写入。

## 2. Harness 能力核验

### 2.1 插件安装与生命周期：已具备

**事实**

- Harness 支持将插件打包为 npm Bundle，在 `package.json` 中声明 `dsh.bundle.patch`，通过 `dsh plugin --profile <name> add <package>` 安装到 Profile。
- Bundle 贡献 Cordis Patch；Profile、用户 Patch 和命令行 Patch 按固定层级组合。
- `dsh plugin ... remove` 同时删除依赖和 Bundle 层。
- Git 来源的插件可安装，但 `prepare` 构建脚本需要用户在 pnpm 中显式 allowlist；官方文档明确将其视为安装时执行代码的权限。

**证据**

- [官方插件打包与安装教程](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/user/develop/basic/publish.md#L1-L184)
- [`dsh plugin` 实现](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/apps/cli/src/plugin.ts)
- [CLI Profile 与插件管理参考](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/apps/cli/reference/README.md#L43-L51)

**推断**

团队插件应作为静态 Bundle 安装，而不是使用“模型临时生成的动态 Cordis Package”。动态 Package 的 Registry 和 Browser Half 都是内存态，官方明确不在重启后恢复，不适合作为长期产品插件载体。

**建议**

- 使用普通、可版本锁定的 Bundle。
- 安装/升级继续走 DSH Profile 现有机制；Agent CLI 生命周期管理是插件自己的功能，不与 DSH 插件安装混为一层。

### 2.2 页面和会话 UI 扩展：部分具备

**事实**

Harness 的 Browser UI 使用 Slot Registry。插件可以注册组件，Slot 按 `root`、`session-maybe`、`session` 三种 Scope 提供不同会话上下文，并随 Cordis Fiber 卸载自动清理。

对本插件直接有用的现成 Slot：

| 目标 | 可用 Slot | 性质 |
|---|---|---|
| 独立设置页/Agent 面板 | `settings.section` | Root、List，可增加完整设置页面 |
| Plugins 页内 Tab | `settings.plugins.tab` | Root、List |
| 左侧栏底部入口 | `sidebar.footer.action` | Root、List |
| 当前会话顶部按钮 | `conversation.session.header.actions` | Session、List |
| 当前会话独立任务图页面 | `conversation.view` | Session、List，可新增一个 View Tab |
| Composer 上方状态条 | `conversation.input.dock` | Session、List |
| 全局悬浮面板 | `shell.overlay` | Root、List |

**证据**

- [Slot Registry 设计](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/client/ui-slots/README.md)
- [设置页 Slot 定义](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/client/ui-settings/src/client/contract/slots.ts#L14-L89)
- [会话 Slot 定义](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/client/ui-conversation/src/client/contract/slots.ts#L29-L186)
- [侧栏 Slot 定义](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/client/ui-sidebar/src/client/contract/slots.ts#L12-L36)
- [布局 Slot 定义](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/client/ui-layout/src/client/index.ts#L34-L84)

**缺口**

- 右侧 `details` 是 `single/session` Slot，当前由 Tool Details 占用；替换它会替换整个右栏。
- `conversation.details.tool` 同样是 Single，面向选中 Tool 的详情，不是通用可加法运行面板。
- 因此当前没有“与 Tool Details 并存、可折叠、当前会话绑定”的专用右侧运行面板 Slot。

**建议**

首条纵向闭环使用：

1. `settings.section`：Agent 管理、团队模板和全局设置。
2. `conversation.view`：完整任务图、节点详情、审计记录。
3. `conversation.session.header.actions`：任务图开关、暂停/取消快捷入口。
4. 可选 `conversation.input.dock`：仅显示紧凑状态摘要。

如果用户验收后仍要求“聊天与任务图同时常驻左右并排”，再向 `ui-layout` 增加一个官方化的 Additive Session Panel Slot；不要劫持现有 Tool Details。

### 2.3 任务与运行事件订阅：Host 完整，Browser 有受控通道

**事实**

- Cordis Host 插件可以通过 `ctx.on(...)` 订阅 `workflow/*`、`subagent/*`、`agent/*`、`session/*`、`tools/*` 等正式事件。
- Workflow 提供 `start/phase/log/agent-start/agent-end/end` 生命周期事件。
- Browser Mux Stream 提供：
  - 原始 `session/event`
  - `session/projection`
  - `session/jobs` 全量快照
  - 审批、问题和 Queue 状态
- Browser Host Stream 提供 Session 新增/移除、运行状态、Agent Error 等。
- Mux 的 `since` 参数在 v1 尚未实现；重连方案是重新打开 Stream 并重新读取 History。
- 原始 `workflow/*` 不在当前 `API_REMOTE_FORWARDED_EVENTS` Allowlist 中，不能直接通过 Browser 的 `ctx.remote.$on` 接收。
- `tool-workflow` 会把顶层 Workflow 的 Start、成员 Start/End、Run End 写成四类 Session Event，官方 `ui-workflow-run` 已能据此重建会话中的 Workflow 展示。

**证据**

- [官方事件生产者/消费者矩阵](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/event-producer-consumer.md)
- [Browser Mux/Host Frame 契约](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/host/apiproxy/src/api/events.ts#L44-L170)
- [Browser 允许转发的 Host Event 白名单](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/api/remotes/src/remote-events.ts)
- [`tool-workflow` 持久展示事件](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/workflow/tool-workflow/README.md#L12-L19)

**推断**

插件 Host 侧可以完整监听运行事件；Browser 不需要也不应转发所有内部事件。更合适的做法是：Host 将任务图归并为插件自己的 Projection/Remote Snapshot，Browser 只消费稳定、脱敏、面向 UI 的状态。

### 2.4 Workflow 持久化与恢复：不具备运行级恢复

**事实**

- `WorkflowRun` 支持 `cancel()`、`dispose()`，`result` 对取消和执行错误采用结果化语义。
- Workflow 事件是观察型事件，不向监听者暴露 Run 控制权限。
- 官方限制明确写明：
  - 只支持前台收集，没有后台 start/poll。
  - 没有 journaling 或 resume。
  - Script、子 Agent 进度和中间值不做 Checkpoint，进程重启不能继续原 Run。
- `tool-workflow` 的 Session Event 是展示/审计记录，不等于可恢复执行状态。

**证据**

- [Workflow Service 契约与限制](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/workflow/workflow/README.md#L5-L59)
- [`tool-workflow` 生命周期](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/workflow/tool-workflow/README.md#L10-L21)

**建议**

插件必须持久化自己的：

- Task/Run/Node ID
- 任务图与依赖
- 节点状态和尝试次数
- Provider、版本和会话引用
- 权限、预算、超时与审批
- 结构化结果信封与 Artifact 引用
- 确定性验证和复审结论
- Side-effect 证据、幂等键和是否允许重跑

重启后创建新的 Workflow/Provider Run，从最近一个“有完成证据的安全边界”恢复，而不是尝试恢复原 Worker Thread。

### 2.5 Session 持久化与崩溃修复：已具备，但只解决会话历史

**事实**

- Session Event Log 可由 JSONL/Zstd 或 SQLite Backend 持久化。
- `session/flush` 是可等待的持久化检查点。
- 冷启动加载发现未闭合 Turn 时，会补写/合成 `turn/end: interrupted`，保留已经落盘的工作。
- 对“Tool Call 已持久化、Result 未持久化”的情况，恢复结果标为 `TOOL_OUTCOME_UNKNOWN`，官方提示不得盲目重试可能有副作用的操作。
- 持久 Session 可通过 `ctx.agents.resume({ resumeSessionId })` 恢复为 Live Agent。

**证据**

- [Session Persistence 子系统](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/subsystems/persistence.md#L1-L32)
- [Persisted Session Resume](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/subsystems/persistence.md#L120-L126)
- [JSONL 崩溃语义](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/session/session-persistence-jsonl/README.md)
- [硬崩溃副作用测试](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/session/session-checkpoint-policy/tests/crash-recovery.e2e.ts)

**边界**

Session Resume 不能自动证明团队 Workflow 的哪个业务节点完成，也不能证明外部 CLI 的文件/网络副作用可以重放。插件仍需要单独的任务账本和恢复判定器。

### 2.6 后台任务和进程取消：当前进程内具备

**事实**

- `ctx.jobs` 提供 start/get/list/read/kill/wait；Kill 先调用 Producer Cancel，再将状态改为 `stopping`。
- 默认 `jobs-local` 全部存在内存，进程退出后记录丢失。
- `ctx.subprocess` 返回 Live Handle；AbortSignal 或 `terminate()` 会按进程树终止。
- POSIX 使用 SIGTERM → Grace → SIGKILL；Windows 使用 `taskkill /T /F`；`waitForExit()` 等待可观察进程树退出。
- Service Dispose 会终止并等待所有仍在运行的受管进程。

**证据**

- [Job Registry 契约](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/jobs/jobs/README.md)
- [Local Job Registry 限制](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/jobs/jobs-local/README.md#L1-L35)
- [Subprocess 终止契约](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/subsystems/subprocess.md#L130-L175)
- [Local Subprocess 实现边界](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/subprocess/subprocess-local/README.md)

**建议**

- 所有外部 Agent 都必须通过 `ctx.subprocess` 或等价受管 Handle 启动。
- Plugin Runtime 自己持有 Deadline；到期先调用 Provider 的协议取消，再调用进程树终止兜底。
- 进程重启后，Job 只显示“上次已中断/状态未知”，不能伪装为仍在运行。

## 3. 首批 Provider 能力矩阵

下表区分“CLI 产品本身能力”与“当前 Harness 原生 Provider 暴露的能力”。

| 能力 | Claude Code | Codex CLI | Antigravity CLI | Pi |
|---|---|---|---|---|
| 命令 | `claude` | `codex` | `agy` | `pi` |
| 非交互 | `claude -p` | `codex exec` | `agy -p` | `pi -p` / `--mode json|rpc` |
| 事件流 | `stream-json` | `exec --json` JSONL；App Server | `stream-json` | JSONL / RPC JSONL |
| 最终 JSON Schema | `--json-schema` | `--output-schema` | `--json-schema` | 未提供；需 Harness 后验验证 |
| 协议取消 | CLI 信号；SDK Abort | App Server `turn/interrupt` | 信号 + 结构化中断结果 | RPC `abort`、`abort_bash` |
| 内建墙钟超时 | 未发现 | 未发现 | `--print-timeout` | 未发现 |
| 权限控制 | Permission Mode + Tool Allow/Deny | Approval Policy + Sandbox Mode | Mode + Policy + Sandbox | Tool Allow/Deny；无核心确认弹窗 |
| OS Sandbox | 有，需严格配置 | 有 | 有，但只覆盖终端命令 | 无 |
| 会话恢复 | Resume/Continue/Session ID/Fork | Exec Resume；App Server Resume/Fork | Continue/Conversation/Sessions | Continue/Session/Fork；RPC Switch Session |
| Harness 原生 Provider | 有 | 有 | 未核验到 | 未核验到 |
| 本机支持状态 | 正式候选 | 正式候选但版本为 Alpha | 实验性/阻塞 | 外部沙箱完成前实验性 |

### 3.1 Claude Code

**CLI 事实**

- `claude -p` 非交互运行；支持 `text/json/stream-json`。
- `--json-schema` 可约束最终结果。
- 支持 `--resume`、`--continue`、`--session-id` 和 Fork。
- `--allowedTools`、`--disallowedTools`、`--tools`、`--permission-mode` 可限制能力。
- 官方 Headless 文档确认 SIGTERM 中断返回 143；没有已核验的 CLI Wall-clock Timeout 参数。
- macOS 沙箱使用 Seatbelt；应启用 `sandbox.failIfUnavailable: true` 并禁止 Unsandboxed Retry，否则沙箱不可用或命令逃逸时边界会弱化。
- `-p` 会跳过 Workspace Trust 对话框；只能对 Harness 已经确认的 Workspace 使用。

**Harness 原生 Provider 事实**

- `@deepseek-ai/dsh-subagent-claude-code` 使用官方 Claude Agent SDK，Harness 固定依赖 `@anthropic-ai/claude-agent-sdk@0.3.220`。
- Harness 的真实产品证据基线为 SDK 自带 Claude Code `2.1.220`；不宣称覆盖所有独立安装版本。
- 每次 Run 都是新 Query、新进程，`persistSession: false`。
- 只返回最终答案，不返回进度、Tool Activity、Usage 或 Product Session ID。
- 不暴露 Output Schema、Persona、Tool Filter、Depth 等可选 Subagent 能力。

**证据**

- [Claude Code Headless](https://code.claude.com/docs/en/headless)
- [Claude Code CLI Reference](https://code.claude.com/docs/en/cli-reference)
- [Claude Code Sandboxing](https://code.claude.com/docs/en/sandboxing)
- [Claude Code Permissions](https://code.claude.com/docs/en/permissions)
- [Release 2.1.233](https://github.com/anthropics/claude-code/releases/tag/v2.1.233)
- [Harness Claude Provider](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/subagent/subagent-claude-code/README.md)

**建议**

- 第一版可复用原生 Provider 完成一次性规划/复审。
- 结构化信封由 Harness Adapter 对最终文本进行验证；不要宣称原生 Provider 已支持 Schema。
- 若以后需要 Claude 原生 Session Resume、完整 Stream JSON 或精细 Tool Policy，再增加“高级 Claude CLI Adapter”，不要在第一版同时实现两套。

### 3.2 Codex CLI

**CLI 事实**

- `codex exec` 是非交互入口；`--json` 输出 JSONL，`--output-schema` 约束最终输出，`--output-last-message` 单独保存最终文本。
- `codex exec resume` 和 Fork 可恢复/分叉 Session。
- `--sandbox` 支持 `read-only/workspace-write/danger-full-access`。
- `--ask-for-approval` 支持 `untrusted/on-request/never`。
- App Server 提供 `turn/interrupt`、Turn/Item 生命周期通知、Thread Resume/Fork。
- `exec` 没有已核验的 Wall-clock Timeout 或专用 stdin Cancel 命令；需 Harness 监督进程。

**Harness 原生 Provider 事实**

- `@deepseek-ai/dsh-subagent-codex` 使用 `codex app-server --stdio`，创建 `ephemeral: true` Thread。
- Harness 开发证据固定在 `@openai/codex@0.147.0` / `codex-cli 0.147.0`。
- Provider 支持本地取消：先请求 `turn/interrupt`，再关闭 Wire，并由 Harness 终止进程树。
- 只取最终答案；不持久化 Thread/Turn ID，不支持 Resume、Progress Stream 或 Output Schema。
- 已知审批请求无人值守时 Fail Closed/Decline。

**本机风险**

- 本机 `0.148.0-alpha.9` 高于 Harness 已验证稳定基线，但属于 Alpha 通道，协议兼容不能推断。
- 当前项目目录不是 Git 仓库；若用 `codex exec` 做通用非 Git 任务，需要显式 `--skip-git-repo-check`。

**证据**

- [Codex CLI Reference](https://developers.openai.com/codex/cli/reference)
- [Codex Non-interactive Mode](https://developers.openai.com/codex/non-interactive-mode)
- [Codex App Server](https://developers.openai.com/codex/app-server)
- [Stable Release 0.147.0](https://github.com/openai/codex/releases/tag/rust-v0.147.0)
- [Pre-release 0.148.0-alpha.20](https://github.com/openai/codex/releases/tag/rust-v0.148.0-alpha.20)
- [Harness Codex Provider](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/subagent/subagent-codex/README.md)

**建议**

- 第一版复用 Harness 原生 Provider，版本门禁先以 `0.147.0` 为已验证基线。
- 不要把本机 Alpha 自动标成“健康”；应显示“已安装，协议版本未验证”。
- 原生 Provider 已经使用 App Server，无需另建 `codex exec` Provider；只有需要原生 Session Resume 时再扩展。

### 3.3 Antigravity CLI

**事实**

- 正确命令是 `agy`，不是 `antigravity`。
- `agy -p` 非交互运行；支持 `text/json/stream-json` 和 `--json-schema`。
- `--print-timeout` 提供内建超时，默认 5 分钟。
- 支持 SIGINT/SIGTERM 的结构化中断结果、`--continue`、`--conversation` 和 Session 枚举。
- `--mode plan|accept-edits`、Permission Policy 和 `--sandbox` 可以组合。
- Sandbox 只限制终端命令；Antigravity 自身文件工具仍依赖 Permission Policy。
- 产品仍由官方标记为 Preview。

**本机安全阻塞**

官方 `1.1.12` Release 明确修复：

- Headless 模式忽略 `--mode`。
- Non-interactive 模式发生问题后不能稳定 Settle。
- 缺少 SIGINT/SIGTERM 结构化中断处理。

本机为 `1.1.11`，因此本机 `agy -p --mode plan` 或 `accept-edits` **不能作为可靠权限边界**。

**Harness 接入事实**

- 当前固定 Harness Commit 中没有 Antigravity 专用 Subagent Provider。
- 未在 Antigravity 官方文档中核验到 ACP Server 模式，不能假设 Harness Generic ACP 可直接接入。
- 可实现新的 `ctx.subagents` Provider，通过 `ctx.subprocess` 启动 `agy -p --output-format stream-json`。

**证据**

- [Antigravity CLI 产品页](https://antigravity.google/product/antigravity-cli)
- [Headless Mode](https://antigravity.google/docs/cli/headless)
- [CLI Reference](https://antigravity.google/docs/cli/reference)
- [Permissions](https://antigravity.google/docs/cli/permissions)
- [Sandbox](https://antigravity.google/docs/cli/sandbox)
- [Conversations](https://antigravity.google/docs/cli/conversations)
- [Release 1.1.13](https://github.com/google-antigravity/antigravity-cli/releases/tag/cli-v1.1.13)

**建议**

- 当前面板状态：`已检测 / 版本 1.1.11 / 实验性 / 需要安全升级`。
- 进入正式 Provider 的最低版本设为 `>=1.1.12`，首个验证版本锁 `1.1.13`。
- 在用户明确批准升级并完成本地回归前，不允许 Antigravity 承担自动写节点。
- 禁止适配器使用 `--dangerously-skip-permissions`。

### 3.4 Pi

**事实**

- `pi -p` 支持简单非交互；`--mode json` 输出 Agent JSONL；`--mode rpc` 提供适合 IDE/自定义 UI 嵌入的双向 JSONL RPC。
- RPC 支持 Request ID、Event Stream、`abort`、`abort_bash`、`get_state`、`get_messages`、`get_last_assistant_text`、`switch_session`、Fork、Clone 和增量读取。
- `agent_settled` 比 `agent_end` 更适合作为完成边界，因为它包含自动重试、压缩重试和 Follow-up Queue 已清空的语义。
- Session 以 JSONL 保存，支持 Continue/Resume/Fork。
- `--tools`、`--exclude-tools`、`--no-tools` 可以裁剪工具。
- 核心 CLI 没有最终 JSON Schema 参数。
- 官方明确没有内建 Sandbox，也没有核心 Permission Popup；Pi 与扩展拥有启动用户的 OS 权限。
- Project Trust 只控制项目本地资源是否加载，不限制模型之后执行工具的权限。

**Harness 接入事实**

- 当前固定 Harness Commit 中没有 Pi CLI Subagent Provider。
- `@deepseek-ai/dsh-llm-pi-ai` 是 Pi AI 模型调用库适配，不是 Pi Coding Agent CLI 的 RPC Provider。
- Pi RPC 不是已核验的 ACP，适合新增专用 Provider。

**证据**

- [Pi 官方仓库](https://github.com/earendil-works/pi)
- [JSON Mode](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/json.md)
- [RPC Mode](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md)
- [SDK](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md)
- [Security](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/security.md)
- [Session Format](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/session-format.md)
- [Release 0.84.2](https://github.com/earendil-works/pi/releases/tag/v0.84.2)

**建议**

- 协议首选 `pi --mode rpc`，不要解析 TUI 文本。
- 只读角色使用 Tool Allowlist；写角色必须同时置于 Harness/OS 外部 Workspace Sandbox。
- Plugin Deadline 到期先发 RPC `abort`，宽限期后调用 `ctx.subprocess` 终止进程树。
- 最终文本通过 `get_last_assistant_text` 获取，交给插件统一 Envelope Validator；格式失败最多请求重排一次。
- 外部 Sandbox 未通过实测前，状态保持“实验性”，不允许无人值守写节点。

## 4. 不能对四个 Provider 统一承诺的语义

| 语义 | 现实情况 | 插件统一策略 |
|---|---|---|
| Wall-clock Timeout | 只有 Antigravity 有内建参数 | Runtime 统一持有 Deadline 和 AbortController |
| 结构化 Cancel Ack | Codex App Server、Antigravity、Pi RPC 较强；Claude 主要依赖 SDK/信号 | 先协议取消，再进程树终止；最终以进程退出和 Artifact 检查为准 |
| Final JSON Schema | Claude、Codex、Antigravity CLI 有；Harness 原生 Claude/Codex Provider 没暴露；Pi 没有 | Adapter 层统一验证 Envelope，不能信任模型字段改变控制状态 |
| Provider Session Resume | 四个 CLI 产品多有；Harness 原生 Claude/Codex Provider 没有 | 首版只保证任务级恢复，不保证原 Provider Session 续接 |
| OS Sandbox | 边界各不相同；Pi 没有 | 写节点必须通过 Harness 外部 Workspace Sandbox 和审批 |
| Side-effect Recovery | 无 Provider 能证明安全重放 | 有完成证据的幂等节点才自动重跑；其余进入人工确认 |

## 5. 兼容性决策

### 5.1 支持分级

| Provider | 首条闭环级别 | 条件 |
|---|---|---|
| Claude Code | 正式候选 | 使用 Harness 原生 Provider；完成精确版本、沙箱和取消实测 |
| Codex | 正式候选 | 优先锁定 Harness 已验证的 `0.147.0`；Alpha 版本先进入兼容性测试 |
| Antigravity | 实验性 | 升级并锁定 `1.1.13`，通过 Headless Mode/Permission/Cancel/Resume 回归后转正式 |
| Pi | 实验性 | 专用 RPC Provider + 外部 OS Sandbox 通过后转正式 |

Agent 面板可以同时展示四个 Provider，但必须区分：

- 已安装/未安装
- CLI 可运行
- 鉴权状态未知/就绪
- Adapter 已安装
- 版本已验证/未验证
- 正式/实验性/阻塞

### 5.2 首条闭环最小实现

1. **静态 Bundle**：Host + Browser 双半插件，不使用动态 Cordis Package 作为产品载体。
2. **UI**：`settings.section` Agent 面板；`conversation.view` 任务图；Header Action 快捷控制；暂不修改 Harness 核心布局。
3. **运行时**：插件自有本地任务账本；Workflow 只负责编排一次执行，不承担恢复。
4. **Provider**：先接 Harness 原生 Claude/Codex；Antigravity/Pi 新增 Provider Adapter，但以实验性状态进入面板。
5. **取消**：Provider 协议取消 → 宽限期 → `ctx.subprocess` 进程树终止。
6. **结构化结果**：模型结果只产生“提议”；Runtime 校验并决定状态，不允许模型直接修改预算、权限、任务图或完成状态。
7. **恢复**：Session History 可恢复；Task Runtime 从自己的账本重建。没有确定证据的副作用节点不自动重跑。

## 6. 编码前必须完成的验证关卡

以下不是重新证明产品价值，而是验证实现依赖：

1. 在一个临时 DSH Profile 中安装最小测试 Bundle，证明 Host/Browser Half、`settings.section` 和 `conversation.view` 可由外部 Bundle 装载、卸载和 HMR。
2. 为 Workflow 事件、Session Event、Projection 和 Browser 重连建立无模型 Fixture 测试。
3. 使用假 CLI 进程验证：正常完成、协议错误、超时、SIGTERM 不退出、SIGKILL、输出截断、进程树子进程清理。
4. 在用户以后授权真实调用后，分别验证四个 Provider 的认证、结构化输出、权限拒绝、取消和 Side-effect 状态。
5. Antigravity 必须先通过 `>=1.1.12` 版本门禁；推荐锁 `1.1.13`。
6. Pi 必须先证明外部 Sandbox 对文件和子进程的限制真实有效。
7. Codex 必须分别验证稳定 `0.147.0` 和当前本机 Alpha，不把协议兼容性建立在版本数字推断上。
8. Claude 必须验证本机版本与 Harness SDK `0.3.220` 的真实组合；Harness 当前只声明其自己的固定测试基线。

## 7. 未核验与证据缺口

- 本机没有 `dsh`，未做实际 Bundle 安装、Web UI 启动、Slot 注册或 Session Resume 测试。
- 未调用真实模型，因此四个 Provider 的鉴权、API 可达性、实际输出样本、费用和模型行为未知。
- 未实际发送取消信号，Provider 在本机版本上的中断结果和 Side-effect 状态未知。
- 未实测 Harness Sandbox 是否能直接承载 Pi Coding Agent 及其所有子进程；在证明前按“不具备”处理。
- 未核验 Antigravity 提供 ACP Server；按未知处理，不以 Generic ACP 作为计划前提。
- 未验证外部 Bundle 能否新增 Browser 所需的自定义 API Remote 而完全不修改 `apiproxy` Allowlist；首版应优先使用 Session Event/Projection 或已有 Remote 扩展模式。
- Provider 会话恢复与插件任务恢复的映射尚未定义；首版不承诺进程重启后续接同一个外部 Provider Session。

## 8. 第一方来源索引

### DeepSeek Harness

- https://github.com/deepseek-ai/deepseek-harness/tree/47f943859bef60e4160492346772ded9b24f765a
- https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/user/develop/basic/publish.md
- https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/client/ui-slots/README.md
- https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/event-producer-consumer.md
- https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/workflow/workflow/README.md
- https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/subsystems/persistence.md
- https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/subsystems/subprocess.md
- https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/jobs/jobs-local/README.md
- https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/subagent/subagent-claude-code/README.md
- https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/subagent/subagent-codex/README.md

### Claude Code

- https://code.claude.com/docs/en/headless
- https://code.claude.com/docs/en/cli-reference
- https://code.claude.com/docs/en/sandboxing
- https://code.claude.com/docs/en/permissions
- https://github.com/anthropics/claude-code/releases/tag/v2.1.233

### Codex CLI

- https://developers.openai.com/codex/cli/reference
- https://developers.openai.com/codex/non-interactive-mode
- https://developers.openai.com/codex/app-server
- https://github.com/openai/codex/releases/tag/rust-v0.147.0
- https://github.com/openai/codex/releases/tag/rust-v0.148.0-alpha.20

### Antigravity CLI

- https://antigravity.google/product/antigravity-cli
- https://antigravity.google/docs/cli/headless
- https://antigravity.google/docs/cli/reference
- https://antigravity.google/docs/cli/permissions
- https://antigravity.google/docs/cli/sandbox
- https://antigravity.google/docs/cli/conversations
- https://github.com/google-antigravity/antigravity-cli/releases/tag/cli-v1.1.13

### Pi

- https://github.com/earendil-works/pi
- https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/json.md
- https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md
- https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md
- https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/security.md
- https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/session-format.md
- https://github.com/earendil-works/pi/releases/tag/v0.84.2
