# 子代理独立对话实施蓝图（SUBAGENT_CHAT_PLAN）

> 目标：切到子代理视图后，Composer 也切换到该子代理的上下文，可以继续给它发
> 消息让它接着干（对齐 DeepSeek Harness 的交互）。状态：**蓝图阶段，未实施**。
> 实施顺序建议按本文步骤 1→4，每步独立验证。

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
