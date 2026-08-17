# Agent 专家团 Host→Browser 名册连接

- 实施日期：2026-08-17
- 包版本：`dsh-agent-team@0.1.0-dev.1`
- Harness 基线：`deepseek-ai/deepseek-harness@47f943859bef60e4160492346772ded9b24f765a`
- 范围：只连接 AgentRoster；不连接 RunProjection，不启动真实 Provider。

## 用户可见结果

专家名册不再永久显示“等待主机扫描”。Browser 通过官方 Typert Remote API 调用 Host 的 `agentTeam/snapshot`，展示：

- DeepSeek 的 `ready / 内置可用`。
- 外部 Agent 的 `detected / 已检测` 或 `missing / 未安装`。
- PATH 主入口的可执行路径。
- 当前支持等级和角色定位；角色 token 在 UI 中显示为中文标签。
- `connection/reset` 后重新读取 Host 快照。

安装状态与支持等级仍保持独立；检测到可执行文件不会把 blocked/experimental Provider 误报为正式支持。

## 实现边界

- Host `agentTeam` 服务新增只读 `snapshot()`，复用唯一的 `AgentRoster`。
- 服务暴露一致的 `agentTeam` Typert Gateway binding。
- 包新增 `./typert` Host artifact，使用 Zod v4 严格校验完整名册快照。
- Browser 挂载同一 `agentTeam/snapshot` Remote 描述符，用外部 Store 驱动 React 重绘。
- Remote 返回错误或连接失败时，面板进入明确的扫描失败状态，不伪造安装结果。
- 唯一新增运行依赖为精确锁定的 `zod@4.4.3`。

## 验证结果

- 定向 TDD：Host service、Browser 首次扫描、连接重置刷新和 Typert wire contract 通过。
- 官方 `validateTypertManifest()` 接受 `dsh-agent-team` Host artifact。
- 官方 `TypertGatewayService.invoke()` 成功调用 `agentTeam/snapshot`，返回 5 个 Agent，并保留 Host `roleOverrides`。
- 一次性 DSH Profile 安装本地包成功；包含 `@deepseek-ai/dsh-base` 和本插件的 Profile 可启动，并按 SIGINT 正常卸载。
- 未修改用户级 DSH Profile。

## 尚未完成

- 版本、鉴权、冲突安装和 Adapter 健康探测。
- RunProjection 的 Browser Remote 连接。
- 用户角色定位的 UI 编辑和持久化。
- Provider 启动、取消、结果信封或真实模型调用。
