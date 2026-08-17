# ADR-0003：Gate 0 兼容性决策

- 状态：正式无模型 Host/Browser Bundle 与远程 Agent 名册已实现；任务运行远程状态、任务账本、Adapter 和真实 Provider 待完成
- 日期：2026-08-17
- 输入：`docs/tracking/harness-provider-compatibility-2026-08-17.md`、`docs/tracking/gate-0-local-runtime-validation-2026-08-17.md`

## 决策

### 1. 插件载体

采用可版本锁定的静态 DSH Bundle，包含 Host 和 Browser 两部分。不使用重启后不恢复的动态 Cordis Package 作为产品载体。

### 2. UI 落点

- Agent 管理与团队设置：`settings.section`。
- 完整任务图和节点详情：`conversation.view`。
- 暂停、取消和任务入口：`conversation.session.header.actions`。
- 紧凑状态摘要：按需使用 `conversation.input.dock`。

首版不替换现有右侧 Tool Details，也不修改 Harness Core。若产品验证后仍需要聊天与任务图常驻并排，再单独提议一个 Additive Session Panel Slot。

### 3. 运行时与恢复

Harness Workflow 仅作为一次执行的编排原语，不承担持久恢复。插件实现自己的本地任务账本，记录任务图、节点状态、尝试、权限、预算、审批、Provider 快照、产物引用和副作用完成证据。

重启后从最近一个有完成证据的安全节点创建新的 Workflow/Provider Run。没有确定证据的副作用节点进入人工确认。

### 4. Provider 支持集合

- Claude Code：正式候选，优先复用 Harness 原生 Provider。
- Codex：正式候选，优先复用 Harness 原生 App Server Provider；稳定版和本机 Alpha 分开验证。
- Antigravity：进入面板但标记阻塞/实验性；本机 1.1.11 不允许承担自动写节点。
- Pi：进入面板但标记实验性；在专用 RPC Provider 和外部 OS 沙箱完成前，不允许无人值守写入。

### 5. 取消策略

Runtime 统一持有超时 Deadline：

```text
Provider 协议取消
→ 等待有限宽限期
→ ctx.subprocess 终止进程树
→ 检查产物和副作用证据
→ 标记 cancelled / failed / outcome-unknown
```

### 6. Browser 状态通道

Host 监听 Workflow/Subagent/Session 事件并归并成插件自己的脱敏 Projection 或 Snapshot。Browser 不直接消费所有内部事件，也不依赖当前未开放的 Workflow Remote Event 转发。

## 已经排除的方案

- 把 Workflow Event 当作可恢复执行日志。
- 把进程内 Job Registry 当作跨重启状态库。
- 用 Pi 的 Project Trust 代替 OS 沙箱。
- 在 Antigravity 1.1.11 上把 `--mode` 当成可靠 Headless 权限边界。
- 因为 CLI 支持 Session Resume 就承诺插件能够续接原 Provider Session。
- 强占现有 Tool Details 作为团队面板。

## 已完成的本机运行验证

固定 Commit 的官方测试已经在本机临时源码目录完成：

- UI Slots 27/27、Settings Plugin 2/2、Conversation View 2/2 通过。
- Workflow 9/9 通过。
- Session Persistence 107/107、Session Checkpoint Policy 11/11 通过。
- Subprocess 基础行为 74/74 通过。
- Host 退出进程树清理 5/5 通过，包含 ordinary、PTY 和 dispose。
- 本地 Bundle 安装/激活与自定义 Profile 生命周期各 1/1 通过。
- Browser 模块发现、服务、加载及真实 `conversation.view` client artifact 30/30 通过。

PTY 初始失败由 `--ignore-scripts` 导致 `node-pty` 预编译 `spawn-helper` 缺少可执行位。仅执行包级 `ensure-spawn-helper.mjs` 恢复临时 helper 的 `0755` 权限后，PTY 单项及完整测试均通过。详见本机运行验证记录。

## 剩余 Gate 0 运行验证

以下内容仍未完成：

1. AgentRoster 已通过 Harness Typert Remote 连接 Browser，并在 `connection/reset` 后刷新；RunProjection 连接仍待完成。
2. 实现插件自有持久任务账本，先覆盖无副作用事件和安全恢复。
3. 使用假 CLI 验证 Adapter 的结构化输出、协议错误、超时和协议取消；通用 SIGTERM/SIGKILL 与进程树清理底座已有通过证据。
4. 另行预览并授权后，进行 Claude/Codex 的最小真实 Provider 调用。
5. Antigravity 升级和 Pi 外部沙箱属于后续独立授权动作。
