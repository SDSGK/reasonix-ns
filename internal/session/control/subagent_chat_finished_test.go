package control

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"reasonix/internal/runtime/delegation"
)

// A run that has ended cannot be talked to, and the refusal says so in a way
// the caller can name: "this one is over" is not "this one could not be read".
func TestSubagentContinueReportsARunThatHasFinished(t *testing.T) {
	runner := &fakeSubagentRunner{err: fmt.Errorf("%w: subagent run %q is completed", delegation.ErrSubagentFinished, "sa_1")}
	ctrl := newChatController(t, runner)
	if _, err := ctrl.SubagentContinue(context.Background(), "sa_1", "keep going"); !errors.Is(err, ErrSubagentFinished) {
		t.Fatalf("continue: %v, want ErrSubagentFinished", err)
	}
}

// A run this process is working on right now is a different refusal, and it
// is named differently too.
func TestSubagentContinueReportsARunThatIsBusy(t *testing.T) {
	runner := &fakeSubagentRunner{err: fmt.Errorf("%w: subagent reference %q", delegation.ErrSubagentBusy, "sa_1")}
	ctrl := newChatController(t, runner)
	if _, err := ctrl.SubagentContinue(context.Background(), "sa_1", "keep going"); !errors.Is(err, ErrSubagentBusy) {
		t.Fatalf("continue: %v, want ErrSubagentBusy", err)
	}
}
