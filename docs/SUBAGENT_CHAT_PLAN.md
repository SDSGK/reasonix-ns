# 子代理独立对话实施蓝图（SUBAGENT_CHAT_PLAN）

> 目标：切到子代理视图后，Composer 也切换到该子代理的上下文，可以继续给它发
> 消息让它接着干（对齐 DeepSeek Harness 的交互）。状态：**步骤 1、2、3、4 全部落地
> 并通过测试**（2026-11-18 完成，验收记录见文末「续接点（2026-11-18 完成）」）。
> 实施顺序建议按本文步骤 1→4，每步独立验证。
>
> 验收要点（dev 环境手测）：派一个后台子代理 → 完成后从浮层面板进入其视图 →
> 继续发消息 → 子代理基于首轮结果接着工作 → 主会话的 `read_subagent_result`
> 读到的是续聊后的最新输出。

## 已确认的机制（探索结论，2026-11-13）

1. **续聊内核原生支持**：`agent.RunSubAgentWithSession(ctx, prov, reg, sess,
   prompt, opts, sink)`（internal/runtime/agent/child_run.go:31）接收外部传入的
   `sess *sessionstore.Session`——用**同一个 sess** 再次调用即为续聊；
   `isFreshSubagentSession(sess)` 已兼容非全新会话（不加启动前缀）。
2. **调度入口**：`internal/runtime/delegation/runner.go:136` 把它包装为
   `runChild`；`Runner.Run(ctx, spec RunSpec)` 是子代理运行的总入口。
3. **缺口**：`RunSpec`（runner.go:44）**没有 Session 字段**——child session
   在 `Runner.Run` 内部新建，外部无法传入，因此无法续聊。
4. **前端路由缺口**：`/rt/<id>/submit` 只路由到主会话；子代理视图的
   Composer 没有独立路由。

## 实施步骤

### 步骤 1（内核）：delegation 支持传入已有 child session

- `runner.go` 的 `RunSpec` 增加 `Session *sessionstore.Session` 字段。
- `Runner.Run`：`spec.Session != nil` 时跳过 child session 的新建，直接复用；
  同时跳过 `isFreshSubagentSession` 的启动前缀（续聊语境）。
- 子代理完成时把 sess 引用登记到现有 child registry（后台子代理已有注册点，
  复核 `child_registry.go` 的登记路径），供前端按 ref 找回。
- 测试：delegation 包单测——同一 sess 两轮运行（第一轮任务 + 第二轮追问），
  断言第二轮看到第一轮的消息。

### 步骤 2（内核 serve）：子代理消息端点

- `/rt/<id>/subagents/<ref>/submit`（POST，JSON `{input}`）：定位 child
  session → 构造 RunSpec（Session=child sess，Task=输入）→ `Runner.Run` 跑
  一轮 → 返回该轮输出。
- 认证/审批沿用主 submit 的门（launch token / mutationGate）。
- 测试：serve 端点测试——续聊一轮断言 child session 的消息增长。

### 步骤 3（前端）：子代理视图的 Composer 路由

- 子代理浮层面板点行进入运行全景后（现有 AgentRunView/WorkbenchPanel 机制），
  Composer 的 submit 目标切到步骤 2 端点；输入框占位显示当前子代理名。
- 主/子切换时消息流数据源切换（child session 的历史读取复用
  `read_subagent_result` 的数据通道或新增只读端点）。
- 测试：交互测试——切到子代理视图 → 发消息 → 断言请求路由到子代理端点。

### 步骤 4（前端）：面包屑层级

- 进入子代理视图时面包屑显示「任务名 / 子代理名 [↩ 返回]」（Chrome 的
  crumb 行扩展）；返回时恢复主会话视图。

## 风险与边界

- **并发**：主 turn 运行中续聊子代理需要排队或拒绝（先只允许主会话空闲时
  续聊，与后台任务的并发模型对齐）。
- **边界继承**：续聊沿用子代理首轮的只读/写入边界与沙箱上下文（sess 内已
  固化），不因续聊放宽。
- **深度上限**：续聊不增加 delegation 深度（SubagentDepth 保持）。
- **plan mode**：子代理续聊轮次不进入 plan mode（绕过 planmode.Marker 的
  二次注入——isFreshSubagentSession 分支已保证）。

## 验收

- dev 环境：派一个后台子代理 → 完成后从浮层面板进入其视图 → 继续发消息 →
  子代理基于首轮结果继续工作 → 主会话的 `read_subagent_result` 能读到续聊
  后的最新输出。

## 续接点（2026-11-17 收拢）

### 已落地并验证（步骤 1）

- `internal/runtime/delegation/runner.go`：`RunSpec` 新增 `Ref`；`Run()` 在
  `Ref != ""` 时走续聊路径——复用已载入的 child session，并继承记录里的
  `ReadOnly` / `Tools` / `Model` / `Effort`，不重建更宽的边界。
- `internal/runtime/delegation/subagent_store.go`：新增 `PrepareContinuation`（校验
  归属 + 从磁盘载入 transcript + 加 ref 锁）与 `Describe`。
- `internal/state/sessionstore/subagent_records.go`：`SubagentMeta` 新增 `ReadOnly`、
  `Tools`，首轮的实际边界随记录落盘。
- 测试：`internal/runtime/delegation/continuation_test.go` 三个用例——两轮落在同一
  transcript、边界不扩大、未知 ref 拒绝。

### 下一轮必须知道的语义

- **同一 ref、同一份 transcript 文件**：续聊从 `sessionPath(ref)` 载入，
  `SaveCompleted` 写回同一路径，第二轮追加在第一轮之后。`read_subagent_result`
  读的就是这份记录，所以验收里「主会话能读到续聊后的最新输出」成立。
- **归属校验在 `PrepareContinuation` 内**（`checkOwner`：父会话相同或为其后代，
  且 workspaceRoot 相同）。控制层只需把父会话 ID 与工作区传进去。
- **写栅栏继承自记录**：首轮的 `ReadOnly` / `Tools` 决定续聊轮次的工具面；
  首轮用过的模型已下线时，回落到父会话当前使用的 provider。
- **深度与 plan mode**：续聊轮次不进入 plan mode，也不增加 delegation 深度——
  调用侧用不携带 planmode 标记、深度为 0 的 ctx。

### 步骤 2 的三个接线点

- `internal/session/control/port.go:449` 的 `SubagentView` 端口加续聊方法（或新开
  `SubagentChat` 子端口）。注意 `port_segregation_test.go` 只给 serve 一次虚报
  额度，acp 同计——新端口必须被 serve 真正调用。
- `internal/session/control/subagent_view.go` 现有的 `SubagentReader` 只读
  （`Runs` / `LiveRuns` / `Transcript`），续聊需要写入能力。
- 把 `internal/assembly/boot/delegation.go` 的 `roleWiring.delegation` 产出的
  runner 注入 controller。
- 注入位在 `internal/assembly/boot/build.go:576`（`Subagents:` 一行旁）；
  control 已 import delegation，端口可用 `delegation.RunInfo` 一类类型。
- serve 端点：`internal/frontend/serve/subagents.go` 已注册 `GET /subagents` 与
  `GET /subagents/{ref}/transcript`（由 `processes.go:12` 挂载），续聊端点加在同一处：
  `POST /subagents/{ref}/submit`。
### 步骤 3、4 的前端接线点

- `desktop/frontend-next/src/port/running.ts:9-10` 已有 `subagents()` /
  `subagentTranscript()`，HTTP 实现同文件族 `port/sse_workspace.ts:83,89`；续聊调用
  加在同处。
- 子代理视图是 `ui/AgentRunView.tsx`，工作台页签切换在 `ui/WorkbenchPanel.tsx`。

## 续接点（2026-11-17 收拢，第二次）

### 已落地并验证

- **步骤 1（内核）**、**步骤 2（控制层与端点）** 已全部落地并通过测试；
  **步骤 3 只落地了 port 层**，步骤 4 未实施。
- `internal/runtime/delegation/runner.go`：新增 `Runner.Continue(ctx, ref, task)`，
  内部复用既有 `Run` 的续聊路径（`RunSpec.Ref != ""`）。
- `internal/session/control/subagent_chat.go`（新）：`SubagentTurn` /
  `SubagentRunner` 窄接口 + `Controller.SubagentContinue`。
- 续聊时 ctx 带 `parentSession` = 本会话 ID（归属校验靠它）、
  `SubagentDepth` = 0（不加委托层）、不带 planmode。
- 事件只把 `Usage` 转回主 sink，其余留在子代理自己的 transcript。
- 拒绝条件：ref 为空、input 为空、本会话无 runner、session 无身份、
  gate 忙（返回 `ErrTurnRunning`）。
- `internal/session/control/port.go`：`SubagentView` 端口加 `SubagentContinue`；
  `Options` / `controllerDeps` 加 `SubagentRunner` 注入位。
- `internal/assembly/boot/build_adapters.go`（新）：`subagentRunner` 适配器，把
  `*delegation.Runner` 收窄成 `control.SubagentRunner`；`build.go` 的
  `controllerOptions` 注入一行（与既有 `Subagents:` 并列）。
- `internal/frontend/serve/subagents.go`：注册 `POST /subagents/{ref}/submit`，
  解析 `{input}`（64KB 上限），返回 `{ref, answer, read, wrote}`；
  `refuseSubagent` 增 `ErrTurnRunning` → 409 `subagent.busy`。
- 前端措辞：`i18n/kernel.ts` 增 `subagent.bad_request` / `subagent.busy` 映射，
  `i18n/msg/kernel.ts` 增对应条目——**不加会被 `refusal_parity_test` 判红**。
- 前端 port（步骤 3 的第一半）：`port/subagent.ts` 增 `SubagentTurn`；
  `port/running.ts` 增 `subagentContinue(ref, input)`；`port/sse_workspace.ts`
  增 HTTP 实现；`port/mock_hook.ts` 增 mock 实现。

### 下一步必须知道的语义

- **续聊轮次不进入主会话历史**：答案只写回该子代理自己的 transcript，主会话
  读它仍走 `read_subagent_result` / `GET /subagents/{ref}/transcript`。
- **并发**：主会话 turn 运行中续聊会被拒（`subagent.busy`）；子代理侧另有
  `SubagentStore` 的 ref 锁，同一 ref 不会被两个续聊同时跑。
- **边界不扩大**：首轮记录的 `ReadOnly` / `Tools` 决定续聊轮次的工具面，续聊
  只能收紧。
- **前端下一步（f2）**：`ui/AgentRunView.tsx` 目前是只读视图（底部写着
  `subagent.tab.read_only`），f2 要在这里放一个输入框 → `port.subagentContinue` →
  成功后重读该 run 的 transcript（`page.next` 续读，别从 0 重读）。

### 本轮验证结果

- 已过：`go build ./...`（全树）；`go vet` 四个改动包 exit 0；`gofmt -l` 无输出；
  `go test ./internal/session/control/`（含 `TestFrontendsDeclareOnlyThePortsTheyDrive`）；
  `go test ./internal/frontend/serve/` 全量（151.8s）；`go test
  ./internal/runtime/delegation/`；前端 `npm run typecheck`。
- **既有问题（与本轮无关，已对照确认）**：
  `internal/assembly/boot` 的 `TestEffectSessionScratchIsReachableByItsSpelling`
  失败——把本轮 boot 注入行摘掉后同样失败，是环境导致的既有失败。
- **环境坑（重要）**：本机 go 是 1.26.5，而 `go.mod` 要求 `toolchain go1.26.11`，
  go 会卡在下载工具链（网络不可达），表现为任何 `go` 命令无输出直到超时。
  跑 go 命令必须加 `GOTOOLCHAIN=local GOFLAGS=-mod=mod GOPROXY=off`。
- **未做**：前端 `npm test`（956 文件 / 7157 用例）未在本轮跑；`make check` 的
  `frontend-parity` 规则需要 `go list -export` 载入整棵树，仍受 dbus 模块缓存
  与代理可达性影响。

## 续接点（2026-11-18 完成）

### 四个步骤的最终形态

- **步骤 1（内核）**：`internal/runtime/delegation/runner.go` 的 `Runner.Continue`
  复用 `Run` 的续聊路径（`RunSpec.Ref != ""`）；`PrepareContinuation` 校验归属、
  载入同一份 transcript 并加 ref 锁；首轮的 `ReadOnly` / `Tools` / `Model` 随记录
  落盘，续聊只能收紧边界。
- **步骤 2（控制层与端点）**：`control.SubagentContinue` 走窄接口
  `SubagentRunner`；`boot` 把 `delegation.Runner` 适配注入 controller；serve 注册
  `POST /subagents/{ref}/submit`（64KB 上限，返回 `{ref, answer, read, wrote}`），
  忙会话 → 409 `subagent.busy`，未知 run → 404 `subagent.not_found`。
- **步骤 3（前端）**：`ui/AgentRunView.tsx` 底部是续聊输入区，发送走
  `port.subagentContinue`；成功后**从上次读到的位置续读**该 run 的 transcript
  （`page.next` 续读，不从 0 重读），失败显示原因并保留草稿。
- **步骤 4（面包屑）**：Chrome 的 crumb 行显示「会话名 / 子代理名 [返回]」；
  「返回」经 `leaveAgentRequest` 让工作台关闭该子代理页签，读者回到会话本身。

### 下一步必须知道的语义

- **续聊轮次不进入主会话历史**：答案只写回该子代理自己的 transcript；主会话
  读它仍走 `read_subagent_result` / `GET /subagents/{ref}/transcript`。
- **并发**：主会话 turn 运行中续聊会被拒（`subagent.busy`）；子代理侧另有
  `SubagentStore` 的 ref 锁，同一 ref 不会被两个续聊同时跑。
- **边界不扩大**：首轮记录的 `ReadOnly` / `Tools` 决定续聊轮次的工具面。
- **只读文案已退役**：`subagent.tab.read_only` 随步骤 3 删除（视图现在可发消息），
  换成 `subagent.tab.continue_note` / `subagent.tab.continue_placeholder`。
- **新增动作登记**：前端每个可操作元素都要在 `src/actions.ts` 登记
  （本轮新增 `agent.continue-draft`、`agent.continue-send`、`chrome.leave-agent`），
  否则 `src/actions.test.ts` 的普查会判红。

### 本轮验证结果

- 后端：`go build ./...` 全树通过；`go vet`（control / serve / delegation / boot）
  exit 0；`gofmt -l` 无输出；`go test ./internal/session/control/`（88.0s）、
  `go test ./internal/runtime/delegation/`（cached）、`go test
  ./internal/frontend/serve/`（179.6s）三包全量通过。
- 前端：`npm run typecheck`（tsc --noEmit）exit 0；`npx vitest run` 全量
  （958 文件 / 7165 用例）通过；新增交互测试两个文件
  （`ui/agent-run-continue.interaction.test.tsx` 5 例、
  `ui/chrome-agent-crumb.interaction.test.tsx` 3 例）全绿；
  `src/i18n` 与 `src/actions.test.ts` 全绿（209 用例）。
- **标准门（repolint）**：本功能涉及的文件零违规。`make check` 直跑会卡在
  `frontend-parity` 规则——它要 `go list -export` 载入整棵树，而
  `github.com/godbus/dbus/v5 v5.2.4` 不在本地模块缓存、网络不可达。绕法是
  临时 modfile 把 dbus 换成缓存里已有的 v5.2.2
  （`GOFLAGS=-mod=mod -modfile=alt.mod`），跑完删掉临时文件。
- **repo total 超限的归属**：对照 HEAD 干净树跑 repolint，HEAD 上
  `essay` / `function-size` / `orphan` / `codeowners` 同样超 ceiling。
- **工作树相对 HEAD 多出的 4 处**：来自工作树既有的上游解耦改动——
  `market/client.go`、`crashreport/cli.go`、`telemetry/client.go` 三处
  `os.Getenv`，以及 `update/hub.go` 的 9 行注释块；都不在本功能文件清单内。
- **既有问题（与本轮无关，已对照确认）**：
  `internal/assembly/boot` 的 `TestEffectSessionScratchIsReachableByItsSpelling`
  失败——把本轮 boot 注入行摘掉后同样失败，是环境导致的既有失败。
- **环境坑（重要）**：本机 go 是 1.26.5，而 `go.mod` 要求 `toolchain go1.26.11`，
  go 会卡在下载工具链（网络不可达），表现为任何 `go` 命令无输出直到超时。
  跑 go 命令必须加 `GOTOOLCHAIN=local GOFLAGS=-mod=mod GOPROXY=off`。
