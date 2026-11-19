// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "./testkit";
import { Chrome } from "./Chrome";
import { clearAgentCrumb, setAgentCrumb, useLeaveAgentRequest } from "./agentCrumb";

afterEach(() => {
  cleanup();
  clearAgentCrumb("sa_1");
});

// The request the breadcrumb's way back makes, named so the test can read it.
function LeaveProbe() {
  const leave = useLeaveAgentRequest();
  return <span data-testid="leave">{leave ? leave.ref : "none"}</span>;
}

// The breadcrumb row says where the reader is: the session, and the sub-agent
// inside it when the focused pane is showing one.
function draw(agent?: { ref: string; name: string }) {
  if (agent) setAgentCrumb(agent);
  render(
    <Chrome
      port={null}
      workspace={null}
      status={{ workspaceRoot: "/tmp/proj", sessionPath: "/tmp/proj/s.jsonl" } as never}
      title="给 export 补测试"
      steer={0}
      account={null}
      theme="light"
      onTheme={() => {}}
      onFind={() => {}}
      view="flow" rows={0} surfaces={0} onView={() => {}}
      onError={() => {}}
    />,
  );
}

describe("the chrome's breadcrumb", () => {
  it("names the session alone when no sub-agent is open", () => {
    draw();
    expect(screen.getByText("给 export 补测试")).toBeTruthy();
    expect(screen.queryByText("audit")).toBeNull();
    expect(screen.queryByRole("button", { name: "返回" })).toBeNull();
  });

  it("names the sub-agent under the session when one is open", () => {
    draw({ ref: "sa_1", name: "audit" });
    expect(screen.getByText("给 export 补测试")).toBeTruthy();
    expect(screen.getByText("audit")).toBeTruthy();
  });

  it("asks to leave the sub-agent's view on a press", async () => {
    draw({ ref: "sa_1", name: "audit" });
    render(<LeaveProbe />);
    await userEvent.click(screen.getByRole("button", { name: "返回" }));
    // The request carries the run it names, so the pane showing it closes
    // that tab rather than another one.
    expect(screen.getByTestId("leave").textContent).toBe("sa_1");
  });
});
