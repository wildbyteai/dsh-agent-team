# Agent 专家团假 CLI Adapter 验证

- 实施日期：2026-08-17
- 复核日期：2026-08-18
- 包版本：`dsh-agent-team@0.1.0-dev.5`
- Harness 固定 Commit：`47f943859bef60e4160492346772ded9b24f765a`
- 范围：通用 JSON CLI Adapter、假 CLI fixture 与官方 `subprocess-local` 生命周期验证；不调用真实 Provider。

## 公共协议

- Adapter 使用配置期固定 `argv`，不经过 Shell，也不从任务内容拼接命令。
- stdin 使用 JSONL：首条为 `{ protocolVersion: 1, type: "run", request }`，在 spawn 前只序列化一次；取消为 `{ protocolVersion: 1, type: "cancel" }`。
- stdout 必须完整保留且只能解析为一个严格信封：`schemaVersion: 1`、非空 `summary`、字符串 `artifacts[]`。
- 模型或 CLI 输出不包含任务状态、权限、预算或控制字段；严格 schema 拒绝额外字段。
- stderr 只按有界流收集，不拼入对外错误消息，避免原始 Provider 诊断或敏感文本被意外传播。

## 生命周期与错误分类

- `CLI_ADAPTER_PROTOCOL`：请求无法序列化、非法结果 JSON、信封不匹配或 stdout 被截断。
- `CLI_ADAPTER_PROCESS`：spawn、初始协议写入、输出收集、非零退出或进程 settlement 失败。
- `CLI_ADAPTER_TIMEOUT`：超过 Adapter 持有的 wall-clock deadline。
- `CLI_ADAPTER_CANCELLED`：上游 AbortSignal 取消。
- `CLI_ADAPTER_TERMINATION`：受管进程树无法确认退出。
- 超时和用户取消都先写协议 `cancel`；宽限期内未退出时调用 Harness handle 的 `terminate()`，由官方 subprocess 实现执行进程树级 SIGTERM→SIGKILL，再在有限确认窗口内用 `waitForExit()` 等待整棵树退出；确认窗口包含 Harness 内部升级宽限和退出观察余量。

## 安全边界

- 当前 Adapter 只导出可注入 `spawn` 的底座，没有接入 Host MissionRun，也没有选择或启动 Claude Code、Codex、Antigravity、Pi。
- 不读取 Agent 配置、登录状态、Token、Cookie 或 Provider 凭证；所有验证均离线运行仓库内假 CLI。
- 结果信封只是 Provider 提议；后续接入 MissionRun 时仍由确定性 Runtime 决定节点终态、权限和副作用状态。
- 真实 Provider 必须分别锁定 argv、版本、协议取消、权限和沙箱策略，不能因为通用底座通过就标记为正式支持。

## 验证结果

- `npm test`：63/63 通过，其中 Adapter public seam 21 项。
- `npm run check`：新增 Adapter 模块及现有 Host/Browser 文件全部通过语法检查。
- `npm pack --dry-run --json`：`dsh-agent-team@0.1.0-dev.5` 包含 15 个预期文件，不包含测试 fixture 和实验脚本。
- 官方 `subprocess-local` 假进程验证通过：正常结构化结果、非法 JSON、stdout 截断、非零退出、协议取消、忽略取消后的 `SIGKILL`、进程树最终退出。
- 假进程验证输出：`{"completed":"fake completed","protocolError":true,"truncatedOutput":true,"processError":true,"gracefulCancel":true,"forcedSignal":"SIGKILL","treeExited":true}`。
- 未登录或调用任何 Agent/Provider，未读取用户凭证，未修改真实 `DSH_HOME`。

## 下一步

1. 为 Claude Code 和 Codex 分别实现薄 Provider 映射，优先复用 Harness 原生 Subagent，不重复实现两套 CLI。
2. 在任何真实调用前展示 Provider、锁定版本、请求次数、权限、工作区隔离、输出目录和成本边界，并再次获得用户授权。
3. Antigravity 升级与 Pi 外部沙箱继续作为独立授权动作，不纳入本切片。
