# Gate 0 本机运行验证记录

- 核验日期：2026-08-17
- Harness 固定 Commit：`47f943859bef60e4160492346772ded9b24f765a`
- Harness 版本：`0.1.0-rc.5`
- 临时源码目录：`<temporary-harness-checkout>`
- 环境：macOS arm64

## 结论

固定版本的 Harness 核心底座已通过本机运行验证：目标 UI Slot、设置页插件、会话 View、Workflow、Session 持久化与崩溃检查点、受管子进程、Host 退出时的普通/PTY 进程树清理、静态 Bundle/Profile 安装与生命周期，以及 Browser 模块加载链路均通过对应官方测试。

这份结果证明首版插件可以继续复用官方插件安装、Host/Browser 双半、UI、Workflow、Session 和 `ctx.subprocess` 原语，但不等于整个 Gate 0 已完成。插件自有任务账本、假 Provider 协议适配和真实 Claude/Codex 调用仍需分别验证。

## 安全边界

本轮仅在临时官方源码目录中操作：

- 使用锁文件安装依赖，未改 Harness 或本项目源码。
- 安装时使用 `--ignore-scripts`，没有执行依赖安装脚本。
- 未创建或修改用户级 DSH Profile。
- 未安装、升级、登录或调用任何真实 Agent Provider。
- 未调用真实模型，未发送项目内容到外部服务。
- 未修改 Antigravity、Pi、Claude Code 或 Codex 配置。

## 准备步骤

执行：

```bash
pnpm install --frozen-lockfile --ignore-scripts
```

结果：

- 依赖安装成功，共解析并安装 925 个包。
- 锁文件和供应链策略校验通过。
- 因为禁用了安装脚本，`node-pty` 的预编译 `spawn-helper` 初始权限保持为 `0644`。

## 官方测试结果

| 能力 | 结果 | 说明 |
|---|---:|---|
| UI Slots | 27/27 通过 | 验证 Slot 注册、Scope 和生命周期基础行为 |
| Settings Plugin | 2/2 通过 | 验证设置页插件接入 |
| Conversation View | 2/2 通过 | 验证会话 View 接入 |
| Workflow | 9/9 通过 | 验证 Workflow 调度、生命周期与取消基础行为 |
| Session Persistence | 107/107 通过 | 验证持久化、恢复和历史行为 |
| Session Checkpoint Policy | 11/11 通过 | 验证崩溃检查点及未知副作用语义 |
| Subprocess 基础行为 | 74/74 通过 | 覆盖 spawn、终止、截断与环境清理 |
| Host Exit Process Tree | 5/5 通过 | 覆盖 ordinary direct/exception/rejection、PTY direct 和 dispose |
| Bundle/Profile 本地安装 | 1/1 通过 | `dsh plugin --profile … add .` 安装本地 Bundle 并写入激活层 |
| 自定义 Profile 生命周期 | 1/1 通过 | 启动、热重载、移除回退、SIGTERM dispose |
| Browser 模块链路 | 30/30 通过 | Host 发现/服务 `dsh.client`、Browser loader、真实 client artifact 与 `conversation.view` 注册 |

## PTY 失败定位与复核

### 初始现象

`process-exit.spec.ts` 在文件系统沙箱内运行时，进程检查器调用 `/bin/ps` 收到 `EPERM`。这属于测试环境权限限制，不能据此判断 Harness 进程清理失败。

在沙箱外重跑后：

- ordinary direct、uncaught exception、unhandled rejection 三个退出场景通过。
- dispose 清理场景通过。
- terminal root 场景在 30 秒内未生成 `tree.json`。

### 根因

`@deepseek-ai/dsh-subprocess-local` 的包级 `postinstall` 为：

```text
node scripts/ensure-spawn-helper.mjs
```

脚本只恢复 `node-pty` 预编译 helper 的可执行位。由于依赖安装使用了 `--ignore-scripts`，本机 arm64 helper 虽然存在且二进制架构正确，但权限为 `0644`，无法启动 PTY。

### 最小修复

仅在临时源码目录执行包级脚本：

```bash
cd packages/subprocess/subprocess-local
node scripts/ensure-spawn-helper.mjs
```

arm64 helper 权限随后为 `0755`。没有执行根仓库 `postinstall`，没有下载或编译依赖。

### 最终复核

先单独重跑 PTY 场景：1/1 通过。随后在允许读取本机进程树的环境中重跑完整文件：

```bash
pnpm exec vitest run packages/subprocess/subprocess-local/tests/process-exit.spec.ts
```

最终结果：1 个测试文件通过，5/5 测试通过，耗时约 1.70 秒。

## 可以采用的工程结论

1. `ctx.subprocess` 可以作为首版 Provider 的统一进程托管与最终终止底座。
2. POSIX ordinary 和 PTY 进程在 Host 直接退出、异常退出或正常 dispose 时均有本机通过证据。
3. macOS 上的进程树测试需要能够调用 `/bin/ps`；受限沙箱中的 `EPERM` 应单独标记为环境限制。
4. 使用 `--ignore-scripts` 安装 Harness 开发依赖后，任何 PTY 验证都必须显式恢复 `spawn-helper` 可执行位；不能把缺少该步骤造成的失败归因于 Harness Runtime。
5. 这些测试没有证明 Provider 协议取消、权限模式、输出信封或真实 CLI Session 行为，Provider 仍需独立验证。

## Bundle/Profile 与 Browser 半侧复核

先构建固定 Commit 的 Host/CLI 和 Client 产物：

```bash
pnpm run build:lib:host
pnpm run build:lib:client
```

两次构建均通过。随后执行官方定向 E2E：

- 本地 Bundle 的相对路径安装与 Profile 激活：通过。
- 自定义静态 Profile 完整启动、配置热重载、移除覆盖后回退到 Bundle 默认值、SIGTERM 卸载：通过。
- Client Module Registry 发现 `dsh.client`、提供 `client.js`/source map、Browser Loader 加载与缓存：通过。
- 真实 `@deepseek-ai/dsh-client-ui-trajectory` 构建产物完成模块 handoff，并在真实 SlotRegistry 中注册/卸载 `conversation.view`：通过。

生命周期用例在文件系统沙箱内三次等待启动标记超时；同一用例在沙箱外 1/1 通过。结合该用例涉及的子进程、文件监听与热重载行为，本轮将其记录为受限沙箱环境差异，而不是 Harness 功能失败。

## 剩余 Gate 0

按风险从低到高继续：

1. 冻结 TDD public seam，创建正式最小 Host + Browser Bundle；首个界面只注册 `settings.section` 和 `conversation.view`，不接真实 Provider。
2. 用无模型 Fixture 验证插件自有任务账本、Projection、Browser 重连和中断状态展示。
3. 用假 CLI 验证 Provider Adapter 的结构化输出、协议错误、超时、取消宽限期和进程终止。
4. 单独展示 Provider、版本、调用次数、权限、隔离和输出目录，获得确认后进行 Claude/Codex 最小真实调用。
5. Antigravity 升级与 Pi 外部沙箱保持独立授权，不纳入当前动作。
