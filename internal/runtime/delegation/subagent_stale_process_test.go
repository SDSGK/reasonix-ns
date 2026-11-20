package delegation

import (
	"path/filepath"
	"testing"
	"time"

	"reasonix/internal/base/testenv"
	"reasonix/internal/state/sessionstore"
)

// A run that was marked running before this process began belongs to an
// earlier one: its executor is gone. A parent that is still alive must not keep
// it, or a window polls a run that can never answer.
func TestSubagentStoreCleanupStaleRunningFromAnEarlierProcess(t *testing.T) {
	sessionDir := testenv.TempDir(t)
	store := NewSubagentStore(filepath.Join(sessionDir, "subagents"))
	spec := testSubagentSpec(t, "review")
	spec.ParentSession = "probe-parent"
	run, err := store.PrepareFresh(spec)
	if err != nil {
		t.Fatalf("PrepareFresh: %v", err)
	}
	if err := store.MarkRunning(run); err != nil {
		t.Fatalf("MarkRunning: %v", err)
	}
	ref := run.Ref
	run.Release()

	// The run was marked running by an earlier process.
	meta, err := store.LoadMeta(ref)
	if err != nil {
		t.Fatalf("LoadMeta: %v", err)
	}
	meta.UpdatedAt = processStarted.Add(-time.Hour)
	if err := store.saveMeta(meta); err != nil {
		t.Fatalf("saveMeta: %v", err)
	}

	// The parent is alive, which is what used to keep the child.
	store.WithParentSessionProbe(func(string) bool { return true })

	cleaned, err := store.CleanupStaleRunning()
	if err != nil {
		t.Fatalf("CleanupStaleRunning: %v", err)
	}
	if cleaned != 1 {
		t.Fatalf("cleaned = %d, want 1", cleaned)
	}
	meta, err = store.LoadMeta(ref)
	if err != nil {
		t.Fatalf("LoadMeta: %v", err)
	}
	if meta.Status != sessionstore.SubagentInterrupted {
		t.Fatalf("status = %q, want %q", meta.Status, sessionstore.SubagentInterrupted)
	}
}

// A run this process started is not stale, however long it has been marked
// running: the executor behind it is here.
func TestSubagentStoreCleanupKeepsARunThisProcessStarted(t *testing.T) {
	sessionDir := testenv.TempDir(t)
	store := NewSubagentStore(filepath.Join(sessionDir, "subagents"))
	spec := testSubagentSpec(t, "review")
	spec.ParentSession = "probe-parent"
	run, err := store.PrepareFresh(spec)
	if err != nil {
		t.Fatalf("PrepareFresh: %v", err)
	}
	if err := store.MarkRunning(run); err != nil {
		t.Fatalf("MarkRunning: %v", err)
	}
	ref := run.Ref
	run.Release()

	store.WithParentSessionProbe(func(string) bool { return true })

	cleaned, err := store.CleanupStaleRunning()
	if err != nil {
		t.Fatalf("CleanupStaleRunning: %v", err)
	}
	if cleaned != 0 {
		t.Fatalf("cleaned = %d, want 0", cleaned)
	}
	meta, err := store.LoadMeta(ref)
	if err != nil {
		t.Fatalf("LoadMeta: %v", err)
	}
	if meta.Status != sessionstore.SubagentRunning {
		t.Fatalf("status = %q, want %q", meta.Status, sessionstore.SubagentRunning)
	}
}
