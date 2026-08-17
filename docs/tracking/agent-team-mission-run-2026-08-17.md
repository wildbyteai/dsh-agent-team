# Agent 专家团无模型 MissionRun 闭环

- 实施日期：2026-08-17
- 包版本：`dsh-agent-team@0.1.0-dev.3`
- 范围：可视化任务运行、并行依赖、完成/失败/取消状态；不启动真实 Provider，不建立持久任务账本。

## 用户可见结果

- 任务指挥台增加“运行无模型演示”入口，并明确提示不会启动真实 Provider。
- Claude Code 规划节点与 Codex 复审节点并行运行；两者完成后才启动 DeepSeek 汇总节点。
- 节点卡片展示专家、角色、等待依赖、运行、结果摘要和终态。
- 运行中可取消；完成、取消或失败后停止 Browser 轮询。
- 运行中节点使用轻量脉冲动效，并继续遵守 `prefers-reduced-motion`。

## Host 运行边界

- `MissionRun` 只接受内置的只读演示计划，不接收 Browser 提交的任意任务图。
- 演示使用注入式假执行器；默认实现只是可取消延时与固定摘要。
- 调度器每轮只启动依赖已完成的节点，同一轮节点并行执行。
- 任一节点失败会使 Mission 进入 `failed`，并终止同批未完成执行。
- 取消会通过 `AbortController` 通知正在执行的假执行器，并把所有未完成节点收敛为 `cancelled`。
- `RunProjection` 仍是唯一权威 UI 投影，Browser 不直接接收内部执行事件。

## Remote 契约

Typert Host/Browser 双端增加三个严格无参入口：

- `agentTeam/missionSnapshot`：读取最近一次 MissionRun，尚未启动时返回 `null`。
- `agentTeam/startDemo`：启动一次无模型演示并立即返回运行快照。
- `agentTeam/cancelMission`：取消当前演示并返回取消后快照。

Browser 首次连接和 `connection/reset` 时读取最近快照；运行中以短周期轮询刷新，进入终态后自动停止。

## 安全与限制

- 未启动 Claude Code、Codex、Antigravity、Pi、Subagent、Workflow 或子进程。
- 未读取 Agent 凭证，未调用模型，未发送网络请求。
- 演示结果不得当作真实 Agent 能力或交付质量证据。
- MissionRun 当前仅保存于 Host 进程内存，Host 重启后不恢复。
- 本切片不支持用户任意任务输入、暂停、补充说明、预算或超时策略。

## 验证

- `npm test`：25/25 通过，覆盖并行首批、依赖后汇总、完成、取消、失败、Browser 初始/重连轮询、过期响应隔离、防重复启动和严格 Remote 契约。
- `npm run check`：全部 Host/Browser JavaScript 入口通过语法检查。
- `npm pack --dry-run --json`：确认 `dsh-agent-team@0.1.0-dev.3` 包含 12 个预期文件，不包含测试或临时证据。
- 官方 Harness Typert Gateway：初始空快照、并行首批、取消、再次启动和最终完成均通过。
- 既有 AgentRoster Remote 与角色设置 Gateway 回归继续通过；角色设置在临时 Profile 重启后仍能读取。
- 临时 `expert-smoke` Profile 可启动，并在 SIGINT 下退出；未修改用户实际 `DSH_HOME`。
- 全部验证均未调用模型、真实 Provider 或网络服务。
