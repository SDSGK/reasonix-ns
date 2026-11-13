package builtin

import (
	"context"
	"strings"
	"testing"

	"reasonix/internal/contract/event"
	"reasonix/internal/tools/jobs"
)

// A foreground call that settles inside the sync window returns exactly like a
// direct foreground run: the command's own output, no job id, no
// auto-promotion note — the model cannot tell the difference.
func TestForegroundBashSettlesInsideTheWindow(t *testing.T) {
	m := jobs.NewManager(event.Discard)
	defer m.Close()
	ctx := jobs.WithManager(context.Background(), m)
	res, err := (bash{}).Execute(ctx, []byte(`{"command":"echo hi-from-fg"}`))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(res, "auto-promoted") || strings.Contains(res, "background job") {
		t.Fatalf("a call that settled inside the window was reported as background: %q", res)
	}
	if !strings.Contains(res, "hi-from-fg") {
		t.Fatalf("output lost on the foreground path: %q", res)
	}
	if running := m.Running(); len(running) != 0 {
		t.Fatalf("a settled command should not stay in the running table: %+v", running)
	}
}

// A foreground call still running past the sync window is handed back as a
// background job: the model gets the job id and moves on, and the command
// keeps running under the manager until it finishes.
func TestForegroundBashPromotesPastTheWindow(t *testing.T) {
	m := jobs.NewManager(event.Discard)
	defer m.Close() // teardown kills the promoted sleep, no test residue
	ctx := jobs.WithManager(context.Background(), m)
	res, err := (bash{}).Execute(ctx, []byte(`{"command":"sleep 30"}`))
	if err != nil {
		t.Fatalf("a promoted call must not fail: %v", err)
	}
	if !strings.Contains(res, "auto-promoted") || !strings.Contains(res, "background job") {
		t.Fatalf("a past-window call was not handed back as background: %q", res)
	}
	if !strings.Contains(res, "bash_output") {
		t.Error("the promotion note lost the bash_output follow-up hint")
	}
	if running := m.Running(); len(running) != 1 {
		t.Fatalf("the promoted command should still be running under the manager: %+v", running)
	}
}
