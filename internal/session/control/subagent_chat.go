package control

import (
	"context"
	"fmt"
	"strings"

	"reasonix/internal/contract/event"
	"reasonix/internal/runtime/agent"
	"reasonix/internal/runtime/delegation"
)

// ErrSubagentFinished is the refusal a run that has ended gives when it is
// talked to. It is the delegation layer's error, named here so a caller that
// holds only this package can recognise it.
var ErrSubagentFinished = delegation.ErrSubagentFinished

// ErrSubagentBusy is the refusal a run that is being worked on right now
// gives: it holds the run, so a second round cannot open it.
var ErrSubagentBusy = delegation.ErrSubagentBusy

// SubagentTurn is what one continued turn of a sub-agent produced: the answer
// it gave and the files it read or wrote on the way there.
type SubagentTurn struct {
	Ref    string
	Answer string
	Read   []string
	Wrote  []string
}

// SubagentRunner continues one of the session's sub-agent runs: the same
// transcript, one more turn. It is the delegation runner behind a narrow
// shape, so the control layer never reaches for a runner's knobs.
type SubagentRunner interface {
	Continue(ctx context.Context, ref, task string) (SubagentTurn, error)
}

// SubagentContinue runs one more turn of a sub-agent run this session owns.
// The run keeps its reference and transcript, so the later answer is read
// where the first one was. The child's boundary is the one its first round
// ran under: a continuation may narrow it, never widen it. Only a run still
// working may be talked to; a finished one is refused (ErrSubagentFinished).
func (c *Controller) SubagentContinue(ctx context.Context, ref, input string) (SubagentTurn, error) {
	ref = strings.TrimSpace(ref)
	input = strings.TrimSpace(input)
	if ref == "" {
		return SubagentTurn{}, fmt.Errorf("subagent reference is required")
	}
	if input == "" {
		return SubagentTurn{}, fmt.Errorf("input is required")
	}
	if c.subagentRunner == nil {
		return SubagentTurn{}, fmt.Errorf("sub-agent continuation is not available in this session")
	}
	parent := c.parentSessionID()
	if parent == "" {
		return SubagentTurn{}, fmt.Errorf("this session has no identity yet")
	}
	c.mu.Lock()
	busy := c.gate.busy()
	c.mu.Unlock()
	if busy {
		return SubagentTurn{}, ErrTurnRunning
	}
	// The child is this session's own child: it inherits the session id, so
	// the store can prove the run belongs here, and depth zero, so a
	// continuation adds no delegation layer of its own.
	ctx = agent.WithParentSession(ctx, parent)
	ctx = agent.WithToolCallContext(ctx, "subagent-continue:"+ref, c.subagentSink(), c, false)
	ctx = agent.WithSubagentDepth(ctx, 0)
	return c.subagentRunner.Continue(ctx, ref, input)
}

// subagentSink forwards what the session must account for — the tokens a
// continuation spent — and keeps the rest out of the main conversation: the
// child's own transcript is where its work is read from.
func (c *Controller) subagentSink() event.Sink {
	return event.FuncSink(func(e event.Event) {
		if e.Kind == event.Usage && c.sink != nil {
			c.sink.Emit(e)
		}
	})
}
