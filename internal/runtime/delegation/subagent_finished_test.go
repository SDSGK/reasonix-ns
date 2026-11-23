package delegation

import (
	"context"
	"errors"
	"testing"

	"reasonix/internal/base/testenv"
	"reasonix/internal/contract/provider"
	"reasonix/internal/runtime/agent"
	"reasonix/internal/state/sessionstore"
)

// markRunning puts a record back to work, so a test can ask what a
// continuation of a run that is still going does. A run that has finished
// cannot be continued at all, and that is the rule these tests hold.
func markRunning(t *testing.T, store *SubagentStore, ref string) {
	t.Helper()
	meta, err := store.LoadMeta(ref)
	if err != nil {
		t.Fatalf("load the record of %q: %v", ref, err)
	}
	meta.Status = sessionstore.SubagentRunning
	if err := store.saveMeta(meta); err != nil {
		t.Fatalf("save the record of %q: %v", ref, err)
	}
}

func continuationRunner(t *testing.T, store *SubagentStore, prov *scriptedProvider) *Runner {
	t.Helper()
	return NewRunner(RunnerOptions{
		Registry:      testToolRegistry(),
		Provider:      prov,
		Store:         store,
		WorkspaceRoot: testenv.TempDir(t),
		MaxDepth:      1,
		RunOptions: func(context.Context, int, *provider.Pricing, int, int) agent.Options {
			return agent.Options{MaxSteps: 4}
		},
	})
}

// A run that has ended cannot be talked to: its transcript is closed, and a
// message sent to it now would have nowhere to land.
func TestAFinishedRunCannotBeContinued(t *testing.T) {
	store := NewSubagentStore(testenv.TempDir(t))
	runner := continuationRunner(t, store, &scriptedProvider{answers: []string{"first answer"}})
	ctx := agent.WithParentSession(context.Background(), "parent-session")

	first, err := runner.Run(ctx, RunSpec{Task: "first task", Tools: []string{"read_file"}})
	if err != nil {
		t.Fatalf("first round: %v", err)
	}
	if _, err := runner.Run(ctx, RunSpec{Task: "one more thing", Ref: first.Ref}); !errors.Is(err, ErrSubagentFinished) {
		t.Fatalf("continuing a finished run: %v, want ErrSubagentFinished", err)
	}
	if _, err := store.PrepareContinuation(first.Ref, "parent-session", runner.WorkspaceRoot); !errors.Is(err, ErrSubagentFinished) {
		t.Fatalf("reopening a finished run: %v, want ErrSubagentFinished", err)
	}
}

// The same refusal for a run that failed or was interrupted: what ended is
// not only the round that answered.
func TestARunThatEndedWithoutAnAnswerCannotBeContinued(t *testing.T) {
	store := NewSubagentStore(testenv.TempDir(t))
	runner := continuationRunner(t, store, &scriptedProvider{})
	ctx := agent.WithParentSession(context.Background(), "parent-session")

	first, err := runner.Run(ctx, RunSpec{Task: "first task", Tools: []string{"read_file"}})
	if err != nil {
		t.Fatalf("first round: %v", err)
	}
	for _, status := range []sessionstore.SubagentStatus{sessionstore.SubagentFailed, sessionstore.SubagentCancelled, sessionstore.SubagentInterrupted} {
		meta, err := store.LoadMeta(first.Ref)
		if err != nil {
			t.Fatalf("load the record: %v", err)
		}
		meta.Status = status
		if err := store.saveMeta(meta); err != nil {
			t.Fatalf("save the record: %v", err)
		}
		if _, err := runner.Run(ctx, RunSpec{Task: "one more thing", Ref: first.Ref}); !errors.Is(err, ErrSubagentFinished) {
			t.Fatalf("continuing a %s run: %v, want ErrSubagentFinished", status, err)
		}
	}
}

// A run that is still working can be talked to: the same transcript, the same
// boundary, one more answer.
func TestARunningRunCanBeContinued(t *testing.T) {
	store := NewSubagentStore(testenv.TempDir(t))
	prov := &scriptedProvider{answers: []string{"first answer", "second answer"}}
	runner := continuationRunner(t, store, prov)
	ctx := agent.WithParentSession(context.Background(), "parent-session")

	first, err := runner.Run(ctx, RunSpec{Task: "first task", Tools: []string{"read_file"}})
	if err != nil {
		t.Fatalf("first round: %v", err)
	}
	markRunning(t, store, first.Ref)
	second, err := runner.Run(ctx, RunSpec{Task: "follow up", Ref: first.Ref})
	if err != nil {
		t.Fatalf("second round: %v", err)
	}
	if second.Ref != first.Ref {
		t.Fatalf("the continuation wrote ref %q, want the run it continued (%q)", second.Ref, first.Ref)
	}
}

// A run this process is working on right now holds its own reference: a
// second round cannot open it.
func TestARunHeldByThisProcessIsBusy(t *testing.T) {
	store := NewSubagentStore(testenv.TempDir(t))
	runner := continuationRunner(t, store, &scriptedProvider{})
	ctx := agent.WithParentSession(context.Background(), "parent-session")

	first, err := runner.Run(ctx, RunSpec{Task: "first task", Tools: []string{"read_file"}})
	if err != nil {
		t.Fatalf("first round: %v", err)
	}
	markRunning(t, store, first.Ref)
	release, err := store.lock(first.Ref)
	if err != nil {
		t.Fatalf("hold the run: %v", err)
	}
	defer release()
	if _, err := store.PrepareContinuation(first.Ref, "parent-session", runner.WorkspaceRoot); !errors.Is(err, ErrSubagentBusy) {
		t.Fatalf("opening a held run: %v, want ErrSubagentBusy", err)
	}
}
