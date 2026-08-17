# dsh-agent-team

`dsh-agent-team` 是一个面向 DeepSeek Harness 的本地 Agent 专家团插件实验。它让 DeepSeek 根据任务动态选择合适的 Agent，并由确定性 Host 运行时约束名单、角色、权限和 UI 状态。

项目当前处于无模型纵向切片：已经实现 Agent 名册、可持久化角色定位、任务分派校验、运行状态投影，以及 Harness Host/Browser 插件骨架。Browser 面板会通过官方 Typert Remote API 读取 Host 的只读 PATH 扫描结果，并通过官方 user-settings seam 保存角色修改；尚未调用真实 Provider，也尚未提供生产可用的多 Agent 执行。

## 产品方向

- DeepSeek 作为指挥者理解目标、组织任务并汇总结论。
- Claude Code、Codex、Antigravity、Pi 等 Agent 作为可配置专家，而不是固定流水线中的硬编码步骤。
- 默认团队只是模板；用户可以覆盖每个 Agent 的定位。
- 模型输出只提出建议，权限、预算、任务状态和副作用边界由确定性运行时控制。
- 未验证或缺少安全隔离的 Provider 会明确标记为实验性或阻塞状态。

## 当前切片

实现位于 [`packages/dsh-agent-team`](packages/dsh-agent-team)：

- `AgentRoster`：只读扫描本机可执行入口，分离“是否检测到”和“是否正式支持”。
- `MissionPlan`：校验动态专家分派图，支持并行任务，不强制“规划—执行—复审”固定顺序。
- `RunProjection`：把任务事件归并为 Browser 可消费的不可变快照。
- Host 插件：提供 `agentTeam` 服务及严格校验的只读 `agentTeam/snapshot` Remote 入口。
- Browser 插件：注册 Agent 面板和会话任务指挥台，显示真实 `ready / detected / missing` 状态，并在连接重置后刷新。
- 角色设置：用户可在 Agent 卡片中调整规划、执行、复审、研究定位；DeepSeek 的指挥与汇总边界由 Host 强制。

详细能力与限制见 [`packages/dsh-agent-team/README.md`](packages/dsh-agent-team/README.md)。

## 本地验证

```bash
cd packages/dsh-agent-team
npm test
npm run check
npm pack --dry-run --json
```

本项目的测试默认离线运行，不登录或调用 Claude Code、Codex、Antigravity、Pi，也不读取这些 Agent 的凭证。

## 工程记录

- [`docs/decisions`](docs/decisions)：架构与范围决策。
- [`docs/tracking`](docs/tracking)：Harness、Provider 与本地运行验证记录。
- [`docs/compatibility`](docs/compatibility)：Agent/Provider 兼容性矩阵。
- [`experiments/agent-team-value-evaluation`](experiments/agent-team-value-evaluation)：D0/D1/D2/D3 对照评测设计，用于验证专家团的质量收益与成本。

## 安全状态

当前版本不是生产就绪版本，不应被用于无人监督的写操作。真实 Provider 调用、安装或升级、外部网络访问、凭证读取、持久任务恢复和副作用重试均不属于当前实现。

## License

本仓库当前未授予开源许可证，包声明为 `UNLICENSED`。公开可见不代表获得复制、修改或分发授权。
