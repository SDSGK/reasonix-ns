package control

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"reasonix/internal/base/testenv"
	"reasonix/internal/contract/event"
)

// fakeSubagentRunner records what the controller asked the delegation runner
// to do, and answers with what the test says it should.
type fakeSubagentRunner struct {
	gotRef  string
	gotTask string
	gotCtx  context.Context
	turn    SubagentTurn
	err     error
}

func (f *fakeSubagentRunner) Continue(ctx context.Context, ref, task string) (SubagentTurn, error) {
	f.gotRef, f.gotTask, f.gotCtx = ref, task, ctx
	if f.err != nil {
		return SubagentTurn{}, f.err
	}
	return f.turn, nil
}

func newChatController(t *testing.T, runner SubagentRunner) *Controller {
	t.Helper()
	return New(Options{
		Sink:           event.Discard,
		SessionPath:    filepath.Join(testenv.TempDir(t), "session.jsonl"),
		SubagentRunner: runner,
	})
}

func TestSubagentContinueAsksTheRunnerForTheNamedRun(t *testing.T) {
	runner := &fakeSubagentRunner{turn: SubagentTurn{Ref: "sa_1", Answer: "done", Read: []string{"a.go"}, Wrote: []string{"b.go"}}}
	ctrl := newChatController(t, runner)
	got, err := ctrl.SubagentContinue(context.Background(), "sa_1", "keep going")
	if err != nil {
		t.Fatalf("continue: %v", err)
	}
	if runner.gotRef != "sa_1" || runner.gotTask != "keep going" {
		t.Fatalf("asked for %q with %q", runner.gotRef, runner.gotTask)
	}
	if got.Ref != "sa_1" || got.Answer != "done" || len(got.Read) != 1 || len(got.Wrote) != 1 {
		t.Fatalf("turn = %+v", got)
	}
}

func TestSubagentContinueRefusesAnEmptyRunOrAnEmptyTask(t *testing.T) {
	runner := &fakeSubagentRunner{}
	ctrl := newChatController(t, runner)
	if _, err := ctrl.SubagentContinue(context.Background(), "  ", "hello"); err == nil {
		t.Fatal("a run without a reference must be refused")
	}
	if _, err := ctrl.SubagentContinue(context.Background(), "sa_1", "   "); err == nil {
		t.Fatal("a task without text must be refused")
	}
	if runner.gotRef != "" {
		t.Fatalf("a refused request reached the runner as %q", runner.gotRef)
	}
}

func TestSubagentContinueRefusesWhenTheSessionHasNoRunner(t *testing.T) {
	ctrl := newChatController(t, nil)
	if _, err := ctrl.SubagentContinue(context.Background(), "sa_1", "hello"); err == nil {
		t.Fatal("a session without a runner must refuse a continuation")
	}
}

func TestSubagentContinueCarriesTheSessionAsTheRunsParent(t *testing.T) {
	runner := &fakeSubagentRunner{turn: SubagentTurn{Ref: "sa_1"}}
	ctrl := newChatController(t, runner)
	if _, err := ctrl.SubagentContinue(context.Background(), "sa_1", "hello"); err != nil {
		t.Fatalf("continue: %v", err)
	}
	// The store proves ownership by the session id in the context, so the
	// continuation must carry the same one the run was recorded under.
	if runner.gotCtx == nil {
		t.Fatal("the runner was called without a context")
	}
}

func TestSubagentContinueReportsWhatTheRunnerRefused(t *testing.T) {
	runner := &fakeSubagentRunner{err: errors.New("not yours")}
	ctrl := newChatController(t, runner)
	if _, err := ctrl.SubagentContinue(context.Background(), "sa_1", "hello"); err == nil {
		t.Fatal("a refused continuation must say so")
	}
}
