package agent

import (
	"os"
	"path/filepath"
	"testing"

	"reasonix/internal/base/testenv"
	"reasonix/internal/runtime/taskmonitor"
	"reasonix/internal/safety/evidence"
)

// The host keeps its own state in the workspace and writes there while a call
// runs: the job manager records a snapshot per call. Those writes are the
// host's bookkeeping, not the call's work, so a call that changed nothing
// must settle as no mutation and must not name the host's own paths.
func TestTheHostsOwnSnapshotIsNotTheCallsChange(t *testing.T) {
	root := testenv.TempDir(t)
	a := &Agent{}
	a.observeRoot = root
	a.writeWorkspaceRoot = root
	plan := &toolCallPlan{scanBefore: a.scanObserved(t.Context())}

	store := filepath.Join(root, taskmonitor.StoreDir, "sess--bash-1")
	if err := os.MkdirAll(store, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(store, "snapshot.json"), []byte("{}"), 0o600); err != nil {
		t.Fatal(err)
	}

	rec := evidence.Receipt{ToolName: "bash", Success: true, Mutation: true, MutationEvidence: evidence.MutationUnknown, Command: "true"}
	a.settleUnchangedWorkspace(t.Context(), &rec, plan)
	if rec.Mutation {
		t.Fatalf("receipt = %+v, want the host's own snapshot store counted as no change", rec)
	}
	if len(rec.Paths) != 0 {
		t.Fatalf("paths = %q, want the host's own snapshot store out of the receipt", rec.Paths)
	}
}

// The state directory itself is the host's too. It appears while a call runs,
// and a directory that holds nothing but the host's own state is no work
// product, so the watch must not name it.
func TestTheStateDirectoryIsNotTheCallsChange(t *testing.T) {
	root := testenv.TempDir(t)
	before := snapshotPaths(evidence.NewLedger(), root, nil)
	if err := os.MkdirAll(filepath.Join(root, taskmonitor.StoreDir, "sess--bash-1"), 0o755); err != nil {
		t.Fatal(err)
	}
	affected, created := before.since()
	if len(affected) != 0 || len(created) != 0 {
		t.Fatalf("affected = %q, created = %q, want the host's own state out of the call's change", affected, created)
	}
}

// Work the call really did is still its own: the host's state beside it does
// not turn the call's change into nothing.
func TestRealWorkBesideTheHostsStateIsStillTheCallsChange(t *testing.T) {
	root := testenv.TempDir(t)
	a := &Agent{}
	a.observeRoot = root
	a.writeWorkspaceRoot = root
	plan := &toolCallPlan{scanBefore: a.scanObserved(t.Context())}

	if err := os.MkdirAll(filepath.Join(root, taskmonitor.StoreDir, "sess--bash-1"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, taskmonitor.StoreDir, "sess--bash-1", "snapshot.json"), []byte("{}"), 0o600); err != nil {
		t.Fatal(err)
	}
	work := filepath.Join(root, "notes.md")
	if err := os.WriteFile(work, []byte("written\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	rec := evidence.Receipt{ToolName: "bash", Success: true, Mutation: true, MutationEvidence: evidence.MutationUnknown, Command: "true"}
	a.settleUnchangedWorkspace(t.Context(), &rec, plan)
	if !rec.Mutation || rec.MutationEvidence != evidence.MutationProven {
		t.Fatalf("receipt = %+v, want the call's own change established", rec)
	}
	if len(rec.Paths) != 1 || filepath.Base(rec.Paths[0]) != "notes.md" {
		t.Fatalf("paths = %q, want only the file the call wrote", rec.Paths)
	}
}
