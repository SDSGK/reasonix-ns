package builtin

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"reasonix/internal/base/testenv"
	"reasonix/internal/contract/event"
	"reasonix/internal/tools/jobs"
)

// A foreground call that settles inside the sync window must carry the same
// notes as a direct foreground run: the sandbox's refusal, the session-data
// warning, and the NUL note. The job-manager path used to drop them, so a
// model whose calls run under a manager never learned why a call was refused.
func TestForegroundBashThroughTheJobManagerKeepsTheSessionWarning(t *testing.T) {
	root := testenv.TempDir(t)
	session := filepath.Join(root, "sessions", "20260707-abc.jsonl")
	if err := os.MkdirAll(filepath.Dir(session), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(session, []byte("{}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	tool := bash{guard: NewSessionDataGuard(root, nil), workDir: root}
	args := argsJSON(t, map[string]any{"command": `cat "` + session + `"`})

	direct, err := tool.Execute(context.Background(), args)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(direct, "Reasonix's own session/state data") {
		t.Fatalf("the direct path lost the session warning: %q", direct)
	}

	m := jobs.NewManager(event.Discard)
	defer m.Close()
	managed, err := tool.Execute(jobs.WithManager(context.Background(), m), args)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(managed, "Reasonix's own session/state data") {
		t.Fatalf("the job-manager path lost the session warning: %q", managed)
	}
}
