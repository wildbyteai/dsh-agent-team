# Agent 专家团 MissionLedger 持久恢复

- 实施日期：2026-08-17
- 包版本：`dsh-agent-team@0.1.0-dev.4`
- 范围：脱敏 MissionRun 快照持久化、Host 重启后的只读安全恢复；不恢复 Provider 进程或副作用节点。

## 用户可见结果

- 无模型任务的最新状态保存到插件自有本地账本。
- Host 重启后，已完成、已取消和失败终态保持不变。
- 重启前仍为 `planned/running` 的任务收敛为 `interrupted`；已完成节点保持完成，其余节点显示“已中断”。
- Browser 读取恢复快照后停止轮询，并允许用户重新运行新的演示。
- 新任务编号从账本中已有的 `mission-demo-N` 继续递增，不覆盖历史记录。

## 持久化边界

- 默认文件：`$DSH_HOME/dsh-agent-team/v1/missions.json`。
- 可以通过 `ledgerPath` 指向隔离 Profile 或测试专用绝对路径。
- 新目录请求所有者 `0700` 权限，新文件请求 `0600` 权限。
- 每次写入先生成同目录临时文件、写入并同步，再原子替换目标文件；POSIX 下随后同步目录项。
- 账本 envelope、Run、Assignment 和 DeepSeek 指挥边界都经过严格 schema 校验；无效快照在落盘前拒绝。
- 写入按单一 Promise 链串行，持久化失败不会更新权威内存状态，也不会被后续快照静默掩盖。
- Host public service 只暴露经过 `recoverLatest()` 门禁的 MissionRun facade，不能从 `service.missions` 绕过恢复直接修改底层投影或账本。

## 恢复规则

- 本切片只保存 UI 安全的 MissionRun Snapshot，不保存提示词、凭证、原始模型输出或工作区文件。
- `completed/cancelled/failed/interrupted` 视为终态，重启后原样读取。
- `planned/running` 视为 Host 中断：Run 标记 `interrupted`，未终结节点同样标记 `interrupted`。
- 正常 Host 停止若遇到活动任务，会先持久化为 `interrupted` 再终止假执行器；不会伪装成用户主动取消。
- 当前任务全部是内置只读假执行器，因此恢复不会涉及副作用判断。
- 后续接入真实 Adapter 后，任何结果不确定的写节点必须进入人工核对，不能沿用本切片的只读恢复规则自动重跑。

## 未包含

- Provider 会话恢复、Subagent 续接或 CLI 进程重连。
- 尝试次数、预算、审批、权限变化和完整 AuditEvent。
- Artifact 正文、文件指纹、Validator 结果和副作用完成证据。
- 暂停、人工补充说明、自动重试或跨机器同步。

## 验证结果

- `npm test`：42/42 通过。
- `npm run check`：Host、Browser 和新增账本模块全部通过语法检查。
- `npm pack --dry-run --json`：`dsh-agent-team@0.1.0-dev.4` 包含 14 个预期文件，不包含测试和临时证据。
- 账本写入后销毁并重开，最新快照保持一致。
- 显式相对 `ledgerPath` 被拒绝；`DSH_HOME=~/...` 按 Harness 规则展开。
- 非法快照被拒绝且不改变已有最新记录。
- 未完成任务在恢复时持久化收敛为 `interrupted`。
- MissionRun 终态在 `wait()` 返回前完成持久化。
- Host 恢复后先装载旧任务，再接受新任务并续接编号。
- Host facade 无法绕过恢复门禁；正常停止会持久化 `interrupted`，用户取消仍保持 `cancelled`。
- 用户取消返回前会收束受管假执行器并清理活动引用，随后立即停止或重新运行都不会覆盖取消终态。
- 完成、失败、取消与停止统一采用串行吸收态；任一终态先落盘后，任何后续任务或控制事件都不会再覆盖它。
- 模拟持久化失败后，内存停留在最后一个已落盘快照，后续快照不会覆盖该失败。
- Browser 正确展示恢复中断态并停止轮询。
- 官方 Harness Typert Gateway 进程级验证通过：第一进程留下 `running mission-demo-1` 后直接退出，第二进程恢复为 `interrupted`，新任务续接为 `mission-demo-2`。
- 所有测试和集成验证均使用临时目录，未修改用户实际 `DSH_HOME`，未调用模型或真实 Provider。
