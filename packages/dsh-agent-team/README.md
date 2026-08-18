# dsh-agent-team

DeepSeek Harness 的本地 Agent 专家团插件。DeepSeek 负责理解目标、选择专家、分派任务和汇总结论；确定性 Host 服务负责名单、任务计划校验和 UI 状态投影。

当前是无模型纵向切片，不调用真实 Provider。Host 的 Agent 名册和 MissionRun 投影已经通过 Harness Typert Remote API 接到 Browser 面板，角色定位通过官方 user-settings seam 持久化，MissionRun 快照由插件自有 MissionLedger 保存；通用 JSON CLI Adapter 已通过假进程验证。

## 当前能力

- `AgentRoster.snapshot()`：固定展示 DeepSeek、Claude Code、Codex、Antigravity、Pi，读取 PATH 中的可执行入口，并将安装状态与支持等级分开。
- `MissionPlan`：接受 DeepSeek 或用户提出的任务分派图，允许并行专家会诊，不强制固定流水线。
- 分派门禁：拒绝未发现的 Agent、定位不匹配的角色，以及分配给 blocked Agent 的写任务。
- `RunProjection`：把任务事件归并成 Browser 可消费的不可变快照。
- `MissionLedger`：默认写入 `$DSH_HOME/dsh-agent-team/v1/missions.json`，使用所有者权限目录/文件和原子替换，严格校验每个持久快照。
- `MissionRun`：运行一条无模型只读专家团演示，Claude Code 与 Codex 并行，DeepSeek 在依赖完成后汇总；支持 completed/cancelled/failed/interrupted 终态。
- `JsonCliAdapter`：使用固定 argv、显式 stdin/stdout/stderr 策略和严格 Zod 信封；统一区分协议错误、进程错误、超时、用户取消和终止失败。
- Adapter 取消：先写 JSONL `cancel`，等待有限宽限期，再调用 Harness subprocess handle 终止并等待整棵进程树退出。
- Host：通过 `ctx.provide('agentTeam', service)` 只提供经过恢复门禁的 MissionRun facade，并导出严格校验的 AgentRoster/MissionRun Remote 入口。
- Browser：注册 `settings.section` 和 `conversation.view`；专家名册显示 Host 返回的安装状态，任务指挥台可启动、跟踪和取消无模型演示。
- 角色设置：在 Agent 卡片中编辑规划、执行、复审、研究定位；DeepSeek 固定保留指挥与汇总，修改保存到 `agent-team.roleOverrides`。
- UI：使用 Emoji 专家头像和轻量状态动效，并支持 `prefers-reduced-motion`。

## 当前限制

- 当前只编辑角色定位；尚未提供 Agent 启用/禁用、团队模板、头像或 Provider 选择。
- 尚未探测版本、鉴权、冲突安装或真实 Provider Adapter 状态。
- 尚未启动 Subagent、Workflow 或真实 Agent CLI；当前只运行仓库内假 CLI fixture。
- `MissionRun` 只使用内置假执行器，不代表 Claude Code/Codex Provider 已接入。
- 当前只恢复脱敏 MissionRun 快照；Host 重启时未完成节点统一标记为 `interrupted`，不会续跑原进程。
- 尚未持久化预算、审批、Provider 会话、Artifact 内容或副作用证据，也不会自动重试任何写入。

## 目录

```text
cordis.patch.yml        静态 DSH Bundle 层
src/index.mjs           Host 插件入口
src/agent-role-policy.mjs Agent 角色、指挥边界与默认定位
src/agent-roster.mjs    专家名单与 PATH 发现
src/agent-team-settings.mjs 角色设置 schema 与指挥边界
src/cli-adapter.mjs   受管 JSON CLI 协议、信封和取消升级
src/mission-plan.mjs    专家任务分派校验
src/mission-ledger.mjs  原子快照持久化与安全恢复
src/mission-run.mjs     无模型任务调度、持久提交、取消与中断
src/mission-snapshot.mjs MissionRun 严格共享 schema
src/run-projection.mjs  UI 状态投影
lib/client.js           零构建依赖的 Browser client artifact
tests/                  public seam 行为测试
tests/fixtures/         不调用模型的本地假 CLI
```

## 本地验证

```bash
cd packages/dsh-agent-team
npm install
npm test
npm run check
```

## 安装到 DSH Profile

在项目根目录执行：

```bash
dsh plugin --profile web add ./packages/dsh-agent-team
```

当前项目没有执行用户级安装；Gate 0 只在完全临时的 `DSH_HOME` 中完成过安装、启动和 Browser Module Registry 冒烟。

可通过插件配置覆盖默认账本文件，测试和隔离 Profile 应使用独立路径：

```yaml
- id: dsh-agent-team
  config:
    ledgerPath: /absolute/private/path/missions.json
```

可通过 Profile Patch 设置 composition 默认定位；面板中的用户修改会覆盖并保存到 Harness 设置文档：

```yaml
- id: dsh-agent-team
  config:
    roleOverrides:
      codex: [review]
      pi: [research, execute]
```
