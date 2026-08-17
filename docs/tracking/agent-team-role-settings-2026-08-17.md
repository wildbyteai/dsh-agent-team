# Agent 专家团角色设置连接

- 实施日期：2026-08-17
- 包版本：`dsh-agent-team@0.1.0-dev.2`
- Harness 基线：`deepseek-ai/deepseek-harness@47f943859bef60e4160492346772ded9b24f765a`
- 范围：持久化 Agent 角色定位；不启动 Provider，不连接任务运行，不新增任务账本。

## 用户可见结果

- Agent 卡片展示“规划、执行、复审、研究”四个可编辑角色按钮。
- DeepSeek 固定保留“指挥、汇总”，外部 Agent 不能取得这两个指挥角色。
- 外部 Agent 至少保留一个角色，避免形成无法被选择的空定位。
- 修改通过 Harness 官方 user-settings seam 保存到 `agent-team.roleOverrides`，Host 名册实时采用新定位。
- 设置服务不存在、远程浏览器或设置文档只读时，按钮禁用但名册扫描仍可查看。
- 快速连续点击按顺序提交；每次写入前读取最新设置快照，避免后一次操作覆盖前一次结果。

## 实现边界

- Host 使用官方 `ctx.inject(['settings'])` 注册 `agent-team` 命名空间，插件配置中的 `roleOverrides` 作为 composition base。
- Browser 使用官方 `ctx.settingsScope.bind({ namespace: 'agent-team' })`，不新增自定义写入 Remote。
- `agentTeam/snapshot` 仍是只读 Typert Remote；角色写入与安装状态扫描保持分离。
- 设置提交由 Harness Settings Provider 负责版本冲突、持久化和失效通知，本插件不创建第二套配置文件或持久账本。
- 当前只支持角色映射；启用/禁用 Agent、团队模板、头像编辑和 Provider 选择不在本切片内。

## 角色约束

- 允许角色：`coordinate / plan / execute / review / research / synthesize`。
- UI 可编辑角色：`plan / execute / review / research`。
- DeepSeek 的 override 必须包含 `coordinate` 和 `synthesize`。
- Claude Code、Codex、Antigravity、Pi 不允许包含 `coordinate` 或 `synthesize`。
- 拒绝未知 Agent、未知角色、重复角色和空角色数组。

## 依赖与供应链评估

### `@deepseek-ai/schemastery@3.18.1`

- 维护与来源：DeepSeek Harness 官方仓库 `vendor/schemastery`；稳定版 `3.18.1` 于 2026-08-13 发布，官方仓库同日提交 `7bedce8` 完成 vendored framework release。
- 活跃度与问题响应：核验日为 2026-08-17；官方仓库 2026-08-10 至 2026-08-13 有连续 RC 与稳定发布提交。未检索到标题或正文明确提及 schemastery 的公开 Issue，缺少 package-specific 响应样本，因此不承诺维护响应 SLA。
- 许可证与安装：MIT；从 npm 官方注册表精确锁定 `3.18.1`，lockfile 保存 tarball URL 与 integrity。
- 直接依赖：`@deepseek-ai/cosmokit@1.8.2` 与 `@standard-schema/spec@1.1.0`，均为 MIT；前者来自 DeepSeek Harness 官方仓库，后者来自 Standard Schema 官方仓库。
- 权限与数据边界：仅在 Host 内存中解析角色设置 schema；不读取文件、环境变量或凭证，不主动联网，不上传提示词、源码或业务数据。实际文件写入由 Harness 已有 Settings Provider 执行。
- 必要性：Harness Settings Provider 要求 Schemastery schema，并将其序列化给 Browser 配置面；Zod Typert schema不能替代该接口。
- 失败模式：依赖缺失或 schema 注册失败时，`agent-team` 设置命名空间不可写；AgentRoster 仍使用插件 composition config，Provider 不会启动。
- 回滚：移除 settings 注册、Browser `settingsScope` 绑定和 Schemastery 依赖，恢复 `0.1.0-dev.1` 的只读 Agent 面板。
- 替代方案：自建 JSON/YAML 配置会重复官方并发、冲突、热更新和权限逻辑，已排除。

#### `@deepseek-ai/cosmokit@1.8.2`

- 维护与响应：随 DeepSeek Harness 官方仓库的 vendored framework 统一发布；可审计样本为 [Discussion #694](https://github.com/deepseek-ai/deepseek-harness/discussions/694)，2026-08-14 提出后同日收到回复并链接修复 #725。该样本只证明 Harness 仓库整体仍有维护响应；未找到 cosmokit 专项 Issue 样本，因此不承诺 package-specific 响应 SLA。
- 安装与依赖链：npm tarball 精确锁定为 `1.8.2`；包元数据无 `scripts`、无 `bin`、无下游 runtime dependencies，不执行 install/postinstall 脚本，不引入额外二进制。
- 权限与失败模式：是 Schemastery 使用的纯 JavaScript 通用工具集，本插件不直接调用；无需网络、文件、凭证或子进程权限。包缺失或兼容性破坏会使 Schemastery 导入/校验失败，进而使 `agent-team` 设置命名空间不可用，但不会启动 Provider 或上传数据。

#### `@standard-schema/spec@1.1.0`

- 维护与响应：来自 Standard Schema 官方仓库的 `v1.1.0` 发布。可审计样本为 [Issue #166](https://github.com/standard-schema/standard-schema/issues/166)（2026-05-17 提出，核验日仍无 assignee 或关联 PR）与 [PR #173](https://github.com/standard-schema/standard-schema/pull/173)（2026-07-17 提出，核验日仍无 reviewer）。因此只能确认仓库有近期用户活动，不能据此认定维护响应及时，且未公开响应 SLA。
- 安装与依赖链：npm tarball 精确锁定为 `1.1.0`；发布包无 runtime dependencies、无 `bin`、无 install/postinstall 脚本，`sideEffects: false`。包内脚本仅为仓库开发期 lint/format/build，npm 安装不会执行。
- 权限与失败模式：仅提供 Standard Schema TypeScript 协议类型，ESM runtime 产物为空导出；无需网络、文件、凭证或子进程权限。缺失或版本不兼容主要表现为 Schemastery 安装/类型检查失败，不会主动产生运行时副作。

上述两个传递依赖的统一回滚路径是移除 Schemastery 设置接入，回到 `0.1.0-dev.1` 只读面板；不单独替换其版本，避免偏离 Harness 官方锁定组合。

### 未直接依赖 `@deepseek-ai/dsh-settings`

固定 Harness 基线中的该包版本为 `0.1.0-rc.5`，2026-08-17 核验到 npm 公共版本仍为 `0.0.1-rc.1`。为了避免包管理器解析到较旧实现，本插件只通过 Cordis `settings` service seam 使用它，不导入该 npm 包；命名空间常量为符合官方约束的固定字符串 `agent-team`。

## 验证证据

- Host public seam：设置提交后 `agentTeam.snapshot()` 实时返回新角色。
- Browser public seam：角色按钮写入官方 settings scope，快速连续操作不丢失前序修改。
- 首屏占位行为：Host 快照到达前，DeepSeek 仍显示“指挥/汇总”，默认角色按钮保持正确选中状态。
- 角色约束：DeepSeek 指挥边界同时在角色设置和 MissionPlan 校验，未知 Agent 和空角色映射均有回归覆盖。
- 官方 Settings File 集成：一次性临时目录成功写入 `settings.yaml`，销毁并重建 Settings Provider 与 Agent 插件后仍恢复 Codex 的 `plan + review`；非法 `coordinate` 写入被拒绝且旧值保持；临时目录随后删除。
- 一次性 DSH Profile：包含 `@deepseek-ai/dsh-base` 与本插件的配置合成、Host 启动和 SIGINT 卸载成功。
- 未修改用户实际 `DSH_HOME`，未调用任何真实 Agent 或模型。
