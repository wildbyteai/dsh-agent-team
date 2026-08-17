# Agent Provider 兼容性矩阵

- 核验日期：2026-08-17
- Harness 基线：`deepseek-ai/deepseek-harness@47f943859bef60e4160492346772ded9b24f765a`
- Harness 根版本：`0.1.0-rc.5`
- 详细证据：`docs/tracking/harness-provider-compatibility-2026-08-17.md`
- 本机运行证据：`docs/tracking/gate-0-local-runtime-validation-2026-08-17.md`

## 支持等级定义

| 等级 | 含义 |
|---|---|
| 正式候选 | 有 Harness 原生 Provider 或足够的一手协议证据；仍需本机真实回归后转正式 |
| 实验性 | 可发现并可设计适配器，但权限、沙箱、版本或恢复能力尚未闭合 |
| 阻塞 | 当前版本存在已知安全或协议问题，不允许承担自动写入节点 |
| 未知 | 缺少第一方证据或本地验证，不能推断支持 |

## Provider 矩阵

| Provider | 本机版本 | Harness 接入 | 非交互/流 | 取消 | 结构化结果 | 会话恢复 | OS 沙箱 | 首条闭环等级 |
|---|---|---|---|---|---|---|---|---|
| Claude Code | 2.1.218 | 原生 Provider | CLI 支持；原生 Provider 只返回最终文本 | SDK/信号，需实测 | CLI 支持 Schema；原生 Provider 未暴露 | CLI 支持；原生 Provider 不持久化 | 有，需严格配置 | 正式候选 |
| Codex CLI | 0.148.0-alpha.9 | 原生 Provider/App Server | JSONL；原生 Provider 只取最终文本 | `turn/interrupt` + 进程终止 | CLI 支持 Schema；原生 Provider 未暴露 | CLI 支持；原生 Provider 不持久化 | 有 | 正式候选，当前 Alpha 版本未验证 |
| Antigravity | 1.1.11 | 需要新 Provider | `agy -p`、stream-json | 信号与结构化中断 | 支持 JSON Schema | CLI 支持 | 有，但 Headless 权限依赖版本 | 阻塞/实验性；需升级并锁定 1.1.13 后回归 |
| Pi | 0.84.1 | 需要专用 RPC Provider | JSONL/RPC | RPC `abort` + 进程终止 | 无最终 Schema，需后验验证 | JSONL Session/RPC 支持 | 官方无内建沙箱 | 实验性；外部 OS 沙箱通过后再开放写入 |

## 面板状态字段

Agent 卡片必须分别显示，不能合并成单一“已安装”：

- 是否发现。
- 可执行路径和 PATH 主入口。
- 版本与稳定/预发布通道。
- 是否存在冲突安装。
- 鉴权状态：未知、待登录、就绪、失败。
- Adapter 是否存在。
- 当前版本是否经过兼容性验证。
- 支持等级：正式、实验性、阻塞。
- 可承担角色：只读规划、只读复审、受控执行、禁止写入。

## Harness 宿主能力矩阵

| 能力 | 结论 | 首版使用方式 |
|---|---|---|
| 静态插件 Bundle | 支持 | Host + Browser 双半 Bundle |
| 独立 Agent 设置页 | 支持 | `settings.section` |
| 会话任务图页面 | 支持 | `conversation.view` |
| 会话快捷操作 | 支持 | `conversation.session.header.actions` |
| 紧凑状态条 | 支持 | 可选 `conversation.input.dock` |
| 与 Tool Details 并存的右侧面板 | 不支持现成 Additive Slot | 首版不修改 Core；使用会话 View |
| Host 运行事件 | 支持 | Host 聚合为插件 Projection/Snapshot |
| Session 历史持久化 | 支持 | 保存展示与审计事件 |
| Workflow journaling/resume | 不支持 | 插件自有任务账本，重启后新建 Run |
| Job 跨重启恢复 | 默认不支持 | 重启后标记中断/未知，不伪装运行中 |
| 受管进程树终止 | 支持 | 协议取消后使用 `ctx.subprocess` 兜底 |

上述 UI、Workflow、Session 与 Subprocess 核心能力已有固定 Commit 的本机官方测试通过证据；静态 Bundle/Profile 实装和真实 Provider 行为仍按 Provider 分别验证。

## 统一适配策略

- 首版 Provider Session 不承诺跨 Harness 重启续接；只承诺任务级恢复。
- Runtime 统一持有 Deadline；先发协议取消，宽限期后终止进程树。
- Provider 输出只生成提议，由 Adapter Envelope Validator 和 Runtime 决定权威状态。
- 写节点必须同时满足：版本已验证、Adapter 已验证、权限策略已验证、Workspace/OS 沙箱已验证。
- 无完成证据的副作用节点不得自动重跑。

## 转正式所需证据

### Claude Code

- 锁定本机测试版本。
- 验证沙箱不可用时 Fail Closed。
- 验证取消、超时、权限拒绝和最终文本捕获。

### Codex

- 先以 Harness 已验证稳定基线 0.147.0 做协议测试。
- 单独测试当前本机 Alpha，不按版本号推断兼容。
- 验证审批无人值守时 Fail Closed、取消和进程树退出。

### Antigravity

- 用户明确批准升级到并锁定 1.1.13。
- 验证 Headless Mode、Permission Policy、Sandbox、取消和恢复。
- 禁止使用跳过权限参数。

### Pi

- 实现并验证 RPC Provider。
- 证明外部 Workspace/OS 沙箱能限制文件和子进程。
- 验证 `abort`、宽限期和进程树终止。
- 统一 Envelope 后验校验通过。
