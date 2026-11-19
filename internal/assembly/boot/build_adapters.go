package boot

import (
	"context"
	"time"

	"reasonix/internal/runtime/delegation"
	"reasonix/internal/session/control"
)

func (b *builder) clock() func() time.Time {
	if b.opts.clock != nil {
		return b.opts.clock
	}
	return time.Now
}

func subagentReader(s *delegation.SubagentStore) control.SubagentReader {
	if s == nil {
		return nil
	}
	return s
}

// subagentRunner adapts the delegation runner to the narrow shape the
// controller drives a continuation through: the runner keeps its store, its
// boundary and its model, and the controller only names the run and the task.
func subagentRunner(r *delegation.Runner) control.SubagentRunner {
	if r == nil {
		return nil
	}
	return delegationRunner{r}
}

type delegationRunner struct{ runner *delegation.Runner }

func (d delegationRunner) Continue(ctx context.Context, ref, task string) (control.SubagentTurn, error) {
	out, err := d.runner.Continue(ctx, ref, task)
	if err != nil {
		return control.SubagentTurn{Ref: out.Ref}, err
	}
	return control.SubagentTurn{Ref: out.Ref, Answer: out.Answer, Read: out.Read, Wrote: out.Wrote}, nil
}
