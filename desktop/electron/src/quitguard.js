"use strict";

// A window that closes while work is still running leaves that work without an
// owner: a background job writes its result back into the session that started
// it, and that session goes with the window. The job then reads as "state
// unknown" and nobody sees what it produced. So the close asks first.

// runningCount is how many pieces of work are still going. A pane that cannot
// answer counts as unknown: it is neither known to be idle nor known to be
// finished, and it is exactly the case a person has to hear about.
function runningCount(running) {
  const panes = Number(running?.panes);
  const unknown = Number(running?.unknown);
  return (Number.isFinite(panes) && panes > 0 ? panes : 0) +
    (Number.isFinite(unknown) && unknown > 0 ? unknown : 0);
}

// quitWithRunningText is what the reader is asked. The buttons are ordered so
// that staying is the default and the escape key, and the cost of a wrong
// answer is a question the person has already answered.
function quitWithRunningText(locale, count) {
  const zh = String(locale || "").toLowerCase().startsWith("zh");
  if (zh) {
    return {
      message: `还有 ${count} 个任务在跑`,
      detail:
        "关掉这个窗口后，这些任务就没有会话可以写回结果了：它们会变成「状态不明」，你也看不到它们最后跑出了什么。\n\n确定要关吗？",
      stay: "先不关",
      leave: "仍然关闭",
    };
  }
  return {
    message: `${count} job(s) are still running`,
    detail:
      "Closing this window leaves that work without an owner: a background job writes its result back into the session that started it, and that session goes with the window. The jobs turn into \"state unknown\" and you will not see what they produced.\n\nClose anyway?",
    stay: "Keep it open",
    leave: "Close anyway",
  };
}

module.exports = { runningCount, quitWithRunningText };
