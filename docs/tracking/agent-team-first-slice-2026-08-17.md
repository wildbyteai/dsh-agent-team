# Agent 专家团插件首个无模型切片

> 后续状态：同日已完成 Host→Browser AgentRoster Remote 连接；本文件保留首个未连接切片的原始验收记录，后续结果见 `agent-team-remote-roster-2026-08-17.md`。

- 实施日期：2026-08-17
- 包路径：`packages/dsh-agent-team`
- Harness 基线：`deepseek-ai/deepseek-harness@47f943859bef60e4160492346772ded9b24f765a`
- 目标：把“固定质量流水线”收敛为“DeepSeek 指挥的动态 Agent 专家团”，但保留确定性权限与状态控制。

## 本轮交付

### 1. AgentRoster

固定五位首批专家：

| Agent | 默认定位 | 当前支持等级 |
|---|---|---|
| DeepSeek | 指挥、规划、执行、汇总 | core |
| Claude Code | 规划、复审 | candidate |
| Codex | 执行、复审 | candidate |
| Antigravity | 执行 | blocked |
| Pi | 研究、执行 | experimental |

`snapshot()` 只读扫描 PATH，不启动 CLI，也不读取 Agent 凭证。用户可以通过 `roleOverrides` 覆盖默认定位。

安装状态与支持等级保持独立：一个 Agent 可以已检测，但因为版本、沙箱或 Adapter 尚未验证而仍是 blocked/experimental。

### 2. MissionPlan

计划采用 `strategy: expert-team`，由 `commanderId` 和任意任务分派图组成，不要求所有任务经过固定的规划—执行—复审顺序。

当前权威校验：

- Agent 必须存在于本次 Roster Snapshot。
- Agent 必须为 `ready` 或 `detected`。
- 分配角色必须存在于该 Agent 的当前定位中。
- `blocked` Agent 不得接收写任务。

任务依赖允许表达并行专家会诊与后续综合。例如 Claude 提出架构选项、Codex 审计实现边界，两者完成后由 DeepSeek 综合。

### 3. RunProjection

当前支持：

- 创建任务投影。
- `mission.started`。
- `assignment.started`。
- `assignment.completed`、摘要和 Artifact 引用。
- 已完成数/总数进度。
- 拒绝事件不修改已有快照。

这仍是进程内存态 Projection，不是持久任务账本。

### 4. Host + Browser Bundle

包同时声明：

- `dsh.bundle.patch: ./cordis.patch.yml`
- `dsh.client.platform: web`
- Browser 对 Runtime、Settings 和 Conversation 的依赖顺序

Host 插入唯一的 `dsh-agent-team` 行并提供 `ctx.agentTeam` 服务。Browser 注册：

- `settings.section / agent-team`：专家名册。
- `conversation.view / agent-team`：任务指挥台。

本切片完成时 Browser 尚未接 Host Remote Snapshot，因此展示五位专家及“等待主机扫描”，不伪造本机安装结果。该限制已在后续 Remote Roster 切片解除。

## UI 方向

采用“本地任务指挥桌”视觉：暖灰纸张底、青绿色信号、琥珀色等待态、Emoji 专家头像。只使用本地字体与 CSS，不加载外部字体或资源。

动效仅用于等待信号和头像轻微浮动；系统启用减少动态效果时关闭。

## 验证结果

项目包测试：

- 9/9 通过。
- Host 和 Browser JavaScript 语法检查通过。

真实临时 DSH 冒烟：

- `dsh plugin --profile expert-smoke add <local-package>` 成功。
- Profile Manifest 自动加入 `dsh-agent-team` Bundle 层。
- `--dump-default-config` 包含 `id/name: dsh-agent-team`。
- 只加载本 Bundle 的 Profile 能启动，并通过 SIGINT 按 Harness 语义退出。
- Harness `ClientModuleRegistry` 从已安装包发现 Browser Half，生成 `/plugins/dsh-agent-team/client.js` 图条目，并保留三个声明的 Browser 依赖。

验证使用一次性临时目录，完成后未保留；未安装到用户级 DSH Profile。

## 安全边界

- 未调用真实模型。
- 未启动 Claude Code、Codex、Antigravity 或 Pi。
- 未读取或修改 Agent 凭证。
- 未升级任何 CLI。
- 未修改用户级 DSH 配置。
- 未执行网络请求。

## 下一切片

1. 使用 Harness Remote 机制把 Host 的 `AgentRosterSnapshot` 和 `RunProjection` 连接到 Browser。
2. 增加本地持久任务账本，先覆盖无副作用事件和安全恢复。
3. 用假 CLI Adapter 验证启动、结构化结果、超时、协议取消和进程树终止。
4. 完成面板中的用户角色定位编辑与保存。
5. 真实 Provider 调用继续要求独立预览和授权。
