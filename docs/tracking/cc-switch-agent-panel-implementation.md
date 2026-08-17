# CC Switch Agent/CLI 面板实现调研

> 核验日期：2026-08-17
> 调研范围：只读检查 CC Switch 官方开源仓库的源码、README、CHANGELOG、Release Notes 与 LICENSE；未执行任何安装、升级或卸载脚本，未修改系统配置。

## 结论摘要

1. 用户截图高可信对应官方仓库 [`farion1231/cc-switch`](https://github.com/farion1231/cc-switch)。截图中 7 个工具的名称、顺序、“诊断安装冲突 / 刷新 / 全部升级”操作以及手动安装命令，都与 `v3.19.2` 源码直接吻合。由于版本号是运行时远程查询结果，不能仅凭截图断言它就是 `v3.19.2` 二进制；但 `v3.19.2` 是可精确复现该界面的版本锚点。
2. 截图严格说不是 CC Switch 的“Agents 管理页”，而是“设置 → 关于 → 本地环境检查”。当前源码中真正名为 `AgentsPanel` 的组件仍只显示 `Coming Soon`。因此可复用的是其 **Agent CLI 发现与生命周期管理基础**，而不是一套已完成的 Agent 编排产品。
3. CC Switch 的方案不是简单调用 `which` 和 `npm view`，而是已演化为一套比较完整的 CLI 生命周期管理：区分“未安装”与“已安装但无法运行”，同时扫描多处安装，识别 PATH 默认入口，升级前生成锚定到具体安装位置的计划，执行后再探测验证。
4. 最值得复用的是它的状态模型、多安装冲突诊断、“计划与执行分离”、分工具渐进刷新、执行后再验证等设计。
5. 不建议直接搬运它的远程脚本执行和全局 `npm @latest` 方案。这些路径仍有供应链、全局环境写入、无回滚、远程内容未锁定/未验签等风险。
6. CC Switch 解决的是“CLI 已安装、可运行、版本与升级”。DeepSeek Harness 还应在此之上增加“Harness 适配器是否就绪、鉴权是否就绪、能力与权限、团队角色、健康检查”等状态，不能把“有可执行文件”等同于“可被 Harness 安全调用”。

## 版本与证据锚点

| 项目 | 核验结果 |
|---|---|
| 官方仓库 | `https://github.com/farion1231/cc-switch` |
| 2026-08-17 核验的 `main` HEAD | `3d126f458a63c692b8434871a0868f1f7abf814f` |
| HEAD 提交时间 | `2026-08-17T10:14:03+08:00` |
| 核验时最新 Release tag | `v3.19.2` |
| `v3.19.2` 所指 commit | `43eaf07355af145aebfee301801779e824d4c221` |
| `v3.19.2` 日期 | 2026-08-06 |
| License | MIT，Copyright (c) 2025 Jason Young |

一手证据：

- 项目自述与跨平台技术栈：[`README.md`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/README.md#L1-L17)、[`README.md` 技术栈](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/README.md#L522-L564)
- `v3.19.2` 发布记录：[`CHANGELOG.md`](https://github.com/farion1231/cc-switch/blob/43eaf07355af145aebfee301801779e824d4c221/CHANGELOG.md#L8-L45)
- MIT 许可证：[`LICENSE`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/LICENSE)

## 截图是否对应该项目

结论：**是，且与 `v3.19.2` 时期的“本地环境检查”面板高度一致。**

可直接对照的证据：

- 截图的 7 个工具及顺序是 Claude Code、Codex、Gemini CLI、Grok Build、OpenCode、OpenClaw、Hermes；`v3.19.2` 的 `TOOL_NAMES`、显示名与 App ID 映射完全相同：[`AboutSection.tsx`](https://github.com/farion1231/cc-switch/blob/43eaf07355af145aebfee301801779e824d4c221/src/components/settings/AboutSection.tsx#L62-L186)。
- 截图下方手动命令的内容与 `v3.19.2` 常量一致，包括 Claude/OpenCode 下载到 `mktemp` 后执行、Codex/Gemini/Grok/OpenClaw 全局 npm、Hermes 官方 shell installer：[`AboutSection.tsx`](https://github.com/farion1231/cc-switch/blob/43eaf07355af145aebfee301801779e824d4c221/src/components/settings/AboutSection.tsx#L109-L160)。
- 后端同期的工具白名单也是同样 7 个：[`misc.rs`](https://github.com/farion1231/cc-switch/blob/43eaf07355af145aebfee301801779e824d4c221/src-tauri/src/commands/misc.rs#L99-L177)。
- 当前 `main` 的本地环境面板已增加 `Pi`，为 8 个 CLI：[`AboutSection.tsx`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src/components/settings/AboutSection.tsx#L62-L71)。`Pi` 是 2026-08-14 合并的功能，因此截图显然早于这一界面变更。

需要特别区分名称：这些卡片实现在 [`src/components/settings/AboutSection.tsx`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src/components/settings/AboutSection.tsx#L944-L1266)；而真正的 [`src/components/agents/AgentsPanel.tsx`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src/components/agents/AgentsPanel.tsx#L7-L20) 仍是 `Coming Soon`。

## 总体架构

该面板是 React/TypeScript 前端 + Tauri IPC + Rust 后端：

```text
AboutSection.tsx
  ├─ getToolVersions(tools, WSL preferences)
  ├─ probeToolInstallations(tools)
  └─ runToolLifecycleAction(tools, install|update)
             │
             ▼
settingsApi / Tauri invoke
             │
             ▼
src-tauri/src/commands/misc.rs
  ├─ PATH / 常见目录 / WSL 探测
  ├─ --version 执行与解析
  ├─ npm / GitHub / PyPI 最新版本查询
  ├─ 多安装枚举、去重、来源推断与冲突判定
  ├─ 锚定升级计划生成
  └─ bash / cmd.exe / PowerShell / wsl.exe 执行
```

IPC 包装在 [`src/lib/api/settings.ts`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src/lib/api/settings.ts#L236-L322)，Tauri 命令注册在 [`src-tauri/src/lib.rs`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src-tauri/src/lib.rs#L1617-L1625)。

## 1. Agent/CLI 清单和元数据在哪里定义

当前并没有一个统一的“Agent Manifest”，而是分散在多张表中：

| 用途 | 定义位置 |
|---|---|
| 面板顺序/前端白名单 | `TOOL_NAMES` in [`AboutSection.tsx`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src/components/settings/AboutSection.tsx#L62-L82) |
| 显示名 | `TOOL_DISPLAY_NAMES` in [`AboutSection.tsx`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src/components/settings/AboutSection.tsx#L167-L181) |
| 面板工具到 App ID | `TOOL_APP_IDS` in [`AboutSection.tsx`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src/components/settings/AboutSection.tsx#L184-L193) |
| 图标、颜色、全局 App 类型 | [`src/config/appConfig.tsx`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src/config/appConfig.tsx#L12-L40), [`APP_ICON_MAP`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src/config/appConfig.tsx#L102-L196) |
| 后端可接受工具白名单 | `VALID_TOOLS` in [`misc.rs`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src-tauri/src/commands/misc.rs#L99-L125) |
| npm 包名/安装命令 | `npm_install_command_for` and `npm_package_for` in [`misc.rs`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src-tauri/src/commands/misc.rs#L509-L529), [`misc.rs`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src-tauri/src/commands/misc.rs#L2386-L2398) |
| 远程最新版本来源 | `get_single_tool_version_impl` 内的 match：[`misc.rs`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src-tauri/src/commands/misc.rs#L748-L840) |

这套分散定义已出现漂移迹象：当前 `main` 的后端 Grok 新安装优先官方 `x.ai` installer 再回退 npm，但前端“手动安装命令”仍只展示 `npm i -g @xai-official/grok@latest`。对 DeepSeek Harness，建议从一开始就建立后端单一 Agent Registry，前端通过 API 读取，不再重复手写清单与命令。

## 2. 如何检测 CLI 是否已安装及可执行路径

### 状态模型

Rust 后端使用三态 `ShellProbe`：

- `Found(version)`：定位成功且 `--version` exit 0。
- `FoundButFailed(error)`：可执行文件存在，但 `--version` 非 0 退出。
- `NotFound(error)`：未找到入口。

源码：[`ShellProbe`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src-tauri/src/commands/misc.rs#L1024-L1041)。该设计避免把 Node/Python 版本不兼容、平台可选依赖缺失等情况误报成“未安装”。

### macOS/Linux

1. 首先使用用户 shell 执行 `<tool> --version`，并依 shell 选择 `-c/-lc/-lic`：[`try_get_version`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src-tauri/src/commands/misc.rs#L1043-L1088)。
2. 只有在确定是“未找到”时，才扫描常见目录；如果命令存在但运行失败，不会用其他目录的旧版本掩盖它：[`get_single_tool_version_impl`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src-tauri/src/commands/misc.rs#L765-L802)。
3. 通用搜索目录包括 `~/.local/bin`、`~/.npm-global/bin`、n、Volta、mise、fnm、nvm、PATH；macOS 另加 `/opt/homebrew/bin`、`/usr/local/bin`，Linux 另加 `/usr/local/bin`、`/usr/bin`：[`build_tool_search_paths`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src-tauri/src/commands/misc.rs#L1692-L1857)。
4. OpenCode、Grok、Hermes 根据自身安装方式增加特殊目录，例如 `~/.opencode/bin`、`~/.bun/bin`、`$GOPATH/bin`、`~/.grok/bin`、macOS `~/Library/Python/*/bin`。

### Windows

1. 先调用系统 `%SystemRoot%\System32\where.exe` 且使用 `$PATH:<tool>` 语法，限定只在 PATH 中查找，避免执行当前目录下同名恶意脚本；同时过滤 WindowsApps App Execution Alias：[`windows_path_lookup_command` and `resolve_path_default`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src-tauri/src/commands/misc.rs#L2232-L2297)。
2. 因 GUI 进程可能丢失用户 PATH，它把进程 PATH、当前用户注册表 PATH 和系统注册表 PATH 合并，再去重：[`effective_path_string`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src-tauri/src/commands/misc.rs#L1563-L1605)。
3. 候选后缀包括 `.cmd`、`.exe` 以及必要时的无扩展名文件：[`tool_executable_candidates`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src-tauri/src/commands/misc.rs#L1522-L1540)。
4. 还扫描 Codex/Claude 官方独立安装目录、npm、PNPM_HOME、Volta、nvm-windows、Scoop、Yarn、Python Scripts 等位置。

### WSL

当 Windows 上某工具的自定义配置目录是 `\\wsl$\<distro>\...` 或 `\\wsl.localhost\<distro>\...` 时，将它判定为 WSL 工具，通过 `wsl.exe -d <distro>` 运行版本检查。用户可在面板选择 `sh/bash/zsh/fish/dash` 与 `-lic/-lc/-c`，所有值都在后端白名单验证：[`try_get_version_wsl`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src-tauri/src/commands/misc.rs#L1238-L1324)、[`wsl_distro_for_tool`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src-tauri/src/commands/misc.rs#L3567-L3607)。

## 3. 如何获取当前版本、最新版本并比较

### 当前版本

- 所有工具统一执行 `--version`。
- 使用正则 `\d+\.\d+\.\d+(-[\w.]+)?` 提取第一个三段版本；无法匹配时保留原始输出：[`VERSION_RE` / `extract_version`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src-tauri/src/commands/misc.rs#L1012-L1022)。

### 最新版本来源

| 工具 | 远程来源 |
|---|---|
| Claude Code | npm `@anthropic-ai/claude-code` |
| Codex | npm `@openai/codex` |
| Gemini CLI | npm `@google/gemini-cli` |
| Grok Build | npm `@xai-official/grok` |
| OpenCode | npm `opencode-ai`，失败时查 GitHub `anomalyco/opencode` latest release |
| OpenClaw | npm `openclaw` |
| Hermes | PyPI `hermes-agent` |
| Pi | npm `@earendil-works/pi-coding-agent` |

映射在 [`get_single_tool_version_impl`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src-tauri/src/commands/misc.rs#L804-L829)；HTTP 实现在 [`fetch_npm_dist_tags`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src-tauri/src/commands/misc.rs#L948-L969)、[`fetch_github_latest_version`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src-tauri/src/commands/misc.rs#L971-L992)、[`fetch_pypi_latest_version`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src-tauri/src/commands/misc.rs#L994-L1010)。

Claude Code 有一个值得保留的细节：当本地版本已严格高于 npm `latest` 时，才考虑 `next` tag，避免稳定通道用户被推向预发布版：[`npm_prerelease_tags` / `pick_latest_version`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src-tauri/src/commands/misc.rs#L842-L946)。

### 版本比较

前端实现了保守的 semver 比较，只有 `latest > current` 时显示可升级；无法解析则不报升级：[`src/lib/version.ts`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src/lib/version.ts#L1-L85)。

## 4. 刷新和冲突诊断如何实现

### 刷新

- 面板初次加载时，前端为每个工具分别调用 `getToolVersions([tool])`，通过 `Promise.all` 并发；哪张卡先返回，哪张卡先显示。
- 结果使用模块级缓存，TTL 为 10 分钟；重返设置 Tab 时采用 stale-while-revalidate 式体验。
- 用户点“刷新”会带 `force: true` 绕过缓存。
- 升级或安装结束后只刷新对应工具，不重查全部。

源码：[`AboutSection.tsx` 缓存与合并](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src/components/settings/AboutSection.tsx#L195-L220)、[`refreshToolVersions` / `loadAllToolVersions`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src/components/settings/AboutSection.tsx#L291-L371)。

### 冲突诊断

1. `enumerate_tool_installations` 遍历所有候选目录，对每个真实可执行文件运行 `--version`。
2. 通过 `canonicalize` 解析软链并去重，避免 `/opt/homebrew/bin/x -> Cellar/...` 被认为两处安装。
3. 记录入口路径、版本、是否可运行、错误、安装来源、是否 PATH 默认。来源基于路径推断，包括 nvm、Homebrew、Volta、fnm、mise、Bun、pnpm、Scoop、pip、system。
4. “真冲突”定义为：至少两处安装，且版本不一致，或可运行状态混合。同版本两份且都可运行，不打扰用户。
5. 但升级前的确认阈值更宽：只要有两处安装就弹窗，因为升级只会改其中一处。

后端证据：[`ToolInstallation` / `infer_install_source`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src-tauri/src/commands/misc.rs#L2059-L2120)、[`enumerate_tool_installations`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src-tauri/src/commands/misc.rs#L2299-L2384)、[`is_conflicting` / `probe_tool_installations`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src-tauri/src/commands/misc.rs#L3502-L3565)。

前端证据：[`handleDiagnoseAll`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src/components/settings/AboutSection.tsx#L520-L571)、[`ToolInstallRow.tsx`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src/components/settings/ToolInstallRow.tsx#L1-L37)、[`ToolUpgradeConfirmDialog.tsx`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src/components/settings/ToolUpgradeConfirmDialog.tsx#L23-L101)。

## 5. 安装/升级命令如何生成和执行

### 新安装

当前 POSIX 策略大致是：

- Claude Code：官方 `https://claude.ai/install.sh` → 失败则 npm。
- Grok Build：官方 `https://x.ai/cli/install.sh` → 失败则 npm。
- OpenCode：官方 `https://opencode.ai/install` → 失败则 npm。
- Hermes：NousResearch 官方 GitHub `install.sh`，无 npm fallback。
- Codex、Gemini、OpenClaw、Pi：全局 npm `@latest`。

官方 shell installer 不再直接用 `curl | bash`，而是下载到 `mktemp`、用 bash 执行、保留退出码、删除临时文件：[`misc.rs` installer constants](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src-tauri/src/commands/misc.rs#L441-L466)、[`posix_install_command_for`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src-tauri/src/commands/misc.rs#L3425-L3471)。

### 升级

它不再一律使用 PATH 中第一个 `npm`，而是：

1. 枚举所有安装，找到 PATH 默认入口。
2. 根据真实目标和路径来源选择官方 self-update、Homebrew、Bun、Volta、pnpm 或同目录 npm。
3. 尽量使用绝对路径锚定到实际命中的那处安装。
4. 无法确定默认入口时回退到静态命令，并将 `anchored=false` 告知前端。
5. 对多处安装，先展示所有路径、默认目标和将执行的命令，用户确认后才继续。
6. 真正执行时后端会重新枚举并生成命令，不信任前端回传的 command string。

核心证据：[`build_tool_lifecycle_command`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src-tauri/src/commands/misc.rs#L381-L425)、[`build_tool_action_line`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src-tauri/src/commands/misc.rs#L633-L698)、[`installs_anchored_command`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src-tauri/src/commands/misc.rs#L3390-L3412)、[`plan_command_for`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src-tauri/src/commands/misc.rs#L3474-L3500)。

当前代码还对 Codex npm 平台可选二进制缺失做了特别自愈：对可确认的 npm 类安装，先 uninstall 再 install，而不盲信可能“退出 0 但未修好”的 `codex update`：[`prefers_official_update` / Codex repair 说明](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src-tauri/src/commands/misc.rs#L2661-L2705)。

### 执行与后验证

- POSIX：生成含 `set -e`/`pipefail` 的 bash 脚本，使用 `bash -c` 静默执行并等待完成。
- Windows：写入临时 `.bat`，用 `cmd /C` 执行，设置 `CREATE_NO_WINDOW`，完成后删除临时文件。
- 失败时只向前端返回 stderr（空则 stdout）最后 8 行。
- 前端按工具串行执行，一个失败不阻断后续工具；每个工具执行后立即重新查版本，并判断“版本未变”或“安装后仍无法运行”。
- 所有安装/升级按钮有全局忙状态与 preflight 锁，避免双击导致并发写全局 npm 环境。

源码：[`run_tool_lifecycle_action` and executors](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src-tauri/src/commands/misc.rs#L180-L270)、[`executeRun`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src/components/settings/AboutSection.tsx#L573-L744)、[`handleRunToolAction`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src/components/settings/AboutSection.tsx#L746-L820)。

## 6. macOS / Windows / Linux / WSL 差异

| 维度 | macOS/Linux | Windows | Windows + WSL |
|---|---|---|---|
| PATH 默认入口 | 用户 shell `command -v` / `<tool> --version` | 系统 `where.exe $PATH:<tool>` | `wsl.exe -d <distro>` 内的 shell |
| 候选文件 | 无扩展名 | `.cmd` / `.exe` / 必要时无扩展名 | Linux 命令语义 |
| 特殊路径 | Homebrew、nvm、fnm、mise、Volta、Bun | 注册表 PATH、AppData npm、PNPM_HOME、Volta、Scoop、nvm-windows、独立安装目录 | 不用 Windows 主机的绝对路径锚定 |
| 官方脚本 | `curl` 到临时文件后 bash | Grok/Hermes 使用 PowerShell；Claude/OpenCode bash installer 不适用 | 走 POSIX installer/命令 |
| 执行容器 | `bash -c` | 临时 `.bat` + `cmd /C` | `.bat` 中调 `wsl.exe ... sh` |
| 终端窗口 | 静默捕获 | `CREATE_NO_WINDOW` | `CREATE_NO_WINDOW` |
| shell 选项 | 从 `$SHELL` 推断 | 原生不适用 | UI 可选 shell 与 flag，后端白名单 |

Windows PowerShell 命令会用 UTF-16LE Base64 放入 `-EncodedCommand`，主要是避免 `cmd.exe` 对管道符等再次解析：[`powershell_encoded_command`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src-tauri/src/commands/misc.rs#L462-L500)。这不提供安全保护，只是命令传输/转义手段。

## 7. 哪些适合复用，许可证是否允许

### 适合复用思想或移植的模块

1. **三态安装检测**：`Found / FoundButFailed / NotFound`。
2. **PATH 默认优先，常见目录兜底**：显示用户真正运行的版本，而不是随便扫到的第一个文件。
3. **全量枚举 + canonicalize 去重 + PATH 默认标记**。
4. **冲突与“多处安装需知情”分开**：诊断严阈值，升级确认宽阈值。
5. **升级计划与执行分离**：前端只看计划，执行时后端重建，不接受任意 command string。
6. **分工具渐进刷新 + TTL 缓存**。
7. **执行后再探测**：不以 exit 0 当成最终成功，而是再验版本与可运行状态。
8. **串行变更 + preflight 锁**：避免多个包管理器全局写并发冲突。
9. **Windows 查找加固**：系统 `where.exe`、限制 PATH 搜索、过滤 App Execution Alias、合并注册表 PATH。

### 不建议原样搬运

- 巨大的 `misc.rs` 单文件；建议拆成 `registry`、`discovery`、`version`、`diagnostics`、`lifecycle_plan`、`executor`、`platform/*` 深模块。
- 前端、后端、手动命令三套重复元数据。
- 基于大段 shell string 的通用执行。能使用 `Command + args[]` 的地方应优先直接 exec，只将管道/短路链限制在经审查的少数安装器。
- 未锁定的远程 installer 自动执行。
- 安装按钮点击后直接全局写环境，不先展示来源、权限、将写入的位置与回滚方案。

### License

CC Switch 使用 MIT License，明确允许使用、复制、修改、合并、发布、分发、再许可和销售；条件是在软件或“实质性部分”中保留原版权声明和许可声明。因此：

- 复用设计思路没有问题。
- 如果直接移植其代码、函数或大段改写代码，应在项目的 third-party notices 或相关源码头部保留 CC Switch/Jason Young 的 MIT 版权与许可声明。
- 开源许可不等于安装脚本、npm 包、图标、品牌名称和其他上游内容都自动适用同一许可；实际引入时仍需逐项核对。

证据：[`LICENSE`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/LICENSE)。

## 8. 安全与可靠性风险

### 高风险：远程脚本直接执行

POSIX 从网络下载 installer 后立即 bash；Windows 的 Hermes/Grok 使用 PowerShell `irm ... | iex`，并配合 `ExecutionPolicy Bypass`。改成“先下载临时文件”能正确捕获 curl 失败并清理文件，但**不会降低远程内容被篡改或上游账号/发布链被攻破的供应链风险**。代码未将 installer 锁定到 commit SHA，也没有验证哈希或签名。

DeepSeek Harness 建议：

- 第一版只检测、诊断、展示官方命令和复制，不静默执行。
- 如开启一键安装，先展示发布者、URL、解析后域名、将执行的完整操作、目标目录、权限与回滚方法，要求明确确认。
- 尽可能锁定版本与内容摘要，优先平台签名二进制或可验签包管理器。
- 保留完整、可导出、脱敏的执行日志，不只显示最后 8 行。

### 高风险：全局 npm `@latest`

`npm i -g <package>@latest` 会改变用户全局 Node 环境，可执行包的 lifecycle/postinstall 脚本，可能需要更高权限，也不提供项目级 lockfile 与可靠回滚。`latest` 也会让同一操作在不同时间安装不同代码。

建议：默认做“计划”而不是“立即写入”；在能锁版本时锁定用户选择的确定版本；记录原版本和安装来源，为回滚保留足够信息。

### 中高风险：“检测”会执行本地代码

面板为了获取版本，必须执行发现的 CLI `--version`。POSIX 首选路径还会启动用户登录/交互 shell，从而读取 shell rc。因此该操作不是纯文件系统只读：如果 PATH 里的同名命令或 shell rc 有副作用/恶意逻辑，打开面板或刷新就会触发。

Windows 已用系统 `where.exe`、PATH-only 搜索、WindowsApps 过滤降低了风险，但最终仍会执行发现的二进制。

建议将 Agent 面板分成两层：

- **被动发现**：只枚举路径、文件类型、签名/所有者、包管理器元数据，不运行 CLI。
- **主动健康检查**：在用户同意信任该路径后运行 `--version`或 Harness 握手。

### 中风险：无明确超时的版本与诊断探测

`try_get_version`、`scan_cli_version`和 `enumerate_tool_installations` 使用阻塞的 `.output()`，未设置工具级超时。某个 CLI `--version` 或 shell rc 卡住时，卡片刷新/冲突诊断可持续卡住。

远程最新版本查询也没有每请求短超时，复用的全局 HTTP client 总 timeout 为 600 秒，connect timeout 为 30 秒：[`http_client.rs`](https://github.com/farion1231/cc-switch/blob/3d126f458a63c692b8434871a0868f1f7abf814f/src-tauri/src/proxy/http_client.rs#L185-L263)。对面板版本查询，600 秒过长。

建议：本地探测 3–5 秒/工具，远程查询 5–10 秒/源，可取消，超时时保留本地安装结果并将“远程版本不可用”显示为独立状态。

### 中风险：远程版本查询的隐私、代理与正确性

打开面板首次会并发访问 npm registry、GitHub API 和 PyPI，这会向网络侧暴露使用 CC Switch/这些工具的时间元数据。客户端会跟随应用或系统代理，企业环境还要考虑代理 MITM 证书与内网 npm mirror 的信任边界。

查询失败当前主要折叠为 `None`，UI 显示“未知”；不区分 DNS/代理/限流/服务器错误/响应格式改变。建议保留结构化错误类型和最后成功查询时间。

### 中风险：路径推断和已知目录扫描不是系统真相

安装来源是通过路径字符串推断，搜索范围是已知目录 + PATH，不是 macOS pkg receipt、Windows MSI/winget 数据库或 Linux dpkg/rpm 数据库的权威查询。自定义目录可被误分类，未在候选集的安装可漏掉。因此 UI 应表达为“发现到的安装”，不应宣称“系统中的全部安装”。

### 正向安全设计

CC Switch 当前实现中有若干值得保留的安全措施：

- 前后端工具名白名单，不允许任意命令名。
- WSL distro、shell 和 flag 严格验证。
- 升级执行时后端重建命令，不信任前端计划。
- Windows 使用系统 `where.exe` 并避免当前目录命令劫持。
- 绝对路径锚定与 shell 引号处理。
- 多安装升级前展示计划并请用户确认。
- 执行后以重新探测结果验证，而不盲信进程退出码。

## 对 DeepSeek Harness 的建议落地方案

### 建议的单一 Agent Registry

```ts
interface AgentDefinition {
  id: string;
  displayName: string;
  iconKey: string;
  executableNames: Record<Platform, string[]>;
  versionArgs: string[];
  versionParser: VersionParser;
  discovery: DiscoveryRule[];
  latestSource: NpmSource | GithubReleaseSource | PypiSource | None;
  installers: Partial<Record<Platform, InstallPlanFactory>>;
  updaters: Partial<Record<Platform, UpdatePlanFactory>>;
  harnessAdapter: AdapterDefinition;
  capabilities: AgentCapability[];
}
```

该 Registry 应由后端持有，前端只获取已脱敏的展示模型和执行计划。不要在 UI 中再单独维护安装命令字符串。

### 建议的状态层级

```text
not_discovered
discovered_untrusted
installed_not_runnable
installed_runnable
adapter_missing
adapter_incompatible
auth_required
healthy
degraded
```

其中“安装状态”与“Harness 接入状态”分开，避免一个 `codex --version` 成功就被判定为可参加团队。

### 建议的首版范围

1. 内置主流 Agent Registry。
2. 被动路径发现，展示可执行路径、来源和信任状态。
3. 用户许可后运行带 3–5 秒超时的 `--version` 与最小健康检查。
4. 分工具渐进刷新，结果缓存并标注上次成功时间。
5. 枚举多处安装，标注 PATH 默认入口和版本冲突。
6. 展示官方安装/升级计划和命令，支持复制，默认不执行。
7. 展示 Harness adapter、鉴权就绪、权限、健康状态、所属团队和候补关系。

### 建议的第二阶段一键安装/升级

只在完成以下基础设施后开启：

- 明确确认对话框；
- 版本/发布者/来源/哈希或签名；
- 实际写入目录与权限预检；
- 可取消、短超时、不并发写；
- 完整日志和脱敏；
- 原版本/来源记录与回滚指引；
- 执行后重新探测和 Harness 健康检查；
- 任何远程 installer 默认不使用浮动 `main` URL。

## 最终判断

用户的判断是对的：**CC Switch 已经提供了一个成熟度较高、可直接参考的 Agent/CLI 本地环境面板实现。**

但正确的复用方式是：

- 复用其探测状态模型、冲突枚举、刷新 UX、计划/执行隔离和后验证；
- 结合 MIT License 在必要时移植经验证的小型函数，并保留许可声明；
- 不照搬其分散元数据、大段 shell 字符串、未锁定远程脚本和全局 `@latest` 默认写入；
- 将它定位为 DeepSeek Harness Agent 面板的“本地 CLI 生命周期层”，再在上层增加 Harness 适配、鉴权、权限、能力、健康状态与团队关系。
