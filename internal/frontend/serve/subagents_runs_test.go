package serve

import (
	"encoding/json"
	"testing"
	"time"

	"reasonix/internal/runtime/delegation"
)

// The list a reader draws the deck from has to say what each run weighed, or
// the deck can only say that a run happened.
func TestSubagentRunsCarryWhatEachRunWeighed(t *testing.T) {
	started := time.UnixMilli(1_760_000_000_000)
	src := &subagentSource{runs: []delegation.RunInfo{{
		Ref: "sa_1", Name: "audit", Kind: "task", Model: "deepseek/pro", State: delegation.RunCompleted,
		StartedAt: started, UpdatedAt: started.Add(4 * time.Second), ParentToolCallID: "call_9", Tokens: 4321,
	}}}
	rec := get(subagentMux(src), "/subagents")
	var got []subagentRunView
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil || rec.Code != 200 {
		t.Fatalf("status %d body %s err %v", rec.Code, rec.Body.String(), err)
	}
	if len(got) != 1 || got[0].Tokens != 4321 {
		t.Fatalf("runs = %+v, want the run's own weight", got)
	}
}

// A run that predates the estimate reports none, rather than a made-up zero
// the reader would take for a run that cost nothing.
func TestARunWithoutAnEstimateReportsNoTokens(t *testing.T) {
	src := &subagentSource{runs: []delegation.RunInfo{{Ref: "sa_1", Name: "audit", State: delegation.RunCompleted}}}
	rec := get(subagentMux(src), "/subagents")
	var got []subagentRunView
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 1 || got[0].Tokens != 0 {
		t.Fatalf("runs = %+v, want no weight", got)
	}
}
