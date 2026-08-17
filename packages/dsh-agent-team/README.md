# dsh-agent-team

DeepSeek Harness 的本地 Agent 专家团插件。DeepSeek 负责理解目标、选择专家、分派任务和汇总结论；确定性 Host 服务负责名单、任务计划校验和 UI 状态投影。

当前是无模型纵向切片，不调用真实 Provider。Host 的只读 Agent 名册已经通过 Harness Typert Remote API 接到 Browser 面板。

## 当前能力

- `AgentRoster.snapshot()`：固定展示 DeepSeek、Claude Code、Codex、Antigravity、Pi，读取 PATH 中的可执行入口，并将安装状态与支持等级分开。
- `MissionPlan`：接受 DeepSeek 或用户提出的任务分派图，允许并行专家会诊，不强制固定流水线。
- 分派门禁：拒绝未发现的 Agent、定位不匹配的角色，以及分配给 blocked Agent 的写任务。
- `RunProjection`：把任务事件归并成 Browser 可消费的不可变快照。
- Host：通过 `ctx.provide('agentTeam', service)` 提供上述三个 public seam，并导出严格校验的 `agentTeam/snapshot` Remote 入口。
- Browser：注册 `settings.section` 和 `conversation.view`；专家名册显示 Host 返回的安装状态与可执行路径，并在 `connection/reset` 后刷新。
- UI：使用 Emoji 专家头像和轻量状态动效，并支持 `prefers-reduced-motion`。

## 当前限制

- 角色覆盖可通过 Host 配置传入，但还没有可保存的 UI 编辑器。
- 尚未探测版本、鉴权、冲突安装或 Provider Adapter 状态。
- 尚未启动 Subagent、Workflow、CLI 或真实模型。
- `RunProjection` 当前为进程内存态；持久任务账本属于下一切片。

## 目录

```text
cordis.patch.yml        静态 DSH Bundle 层
src/index.mjs           Host 插件入口
src/agent-roster.mjs    专家名单与 PATH 发现
src/mission-plan.mjs    专家任务分派校验
src/run-projection.mjs  UI 状态投影
lib/client.js           零构建依赖的 Browser client artifact
tests/                  public seam 行为测试
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

可通过 Profile Patch 覆盖默认定位：

```yaml
- id: dsh-agent-team
  config:
    roleOverrides:
      codex: [review]
      pi: [research, execute]
```
