package delegation

import (
	"testing"

	"reasonix/internal/base/tokencount"
	"reasonix/internal/contract/provider"
)

// The estimate a run reports is what every model call it made was sent, plus
// what it answered: a chat-shaped agent re-sends its whole conversation on
// each call, so the second call costs the first one's history again.
func TestRunTokensCountsWhatEveryCallWasSent(t *testing.T) {
	msgs := []provider.Message{
		{Role: provider.RoleSystem, Content: "sys"},
		{Role: provider.RoleUser, Content: "go"},
		{Role: provider.RoleAssistant, Content: "ok"},
	}
	want := tokencount.Text("sys") + tokencount.Text("go") + tokencount.Text("ok")
	if got := runTokens(msgs); got != want {
		t.Fatalf("runTokens = %d, want %d (the history before the call plus the answer)", got, want)
	}
}

// A second call re-sends the first exchange, so the estimate grows with the
// rounds rather than counting the transcript once.
func TestRunTokensGrowsWithTheRounds(t *testing.T) {
	one := runTokens([]provider.Message{
		{Role: provider.RoleUser, Content: "go"},
		{Role: provider.RoleAssistant, Content: "ok"},
	})
	two := runTokens([]provider.Message{
		{Role: provider.RoleUser, Content: "go"},
		{Role: provider.RoleAssistant, Content: "ok"},
		{Role: provider.RoleTool, Content: "tool said"},
		{Role: provider.RoleAssistant, Content: "done"},
	})
	if two <= one {
		t.Fatalf("two rounds = %d, one round = %d: the second round must cost the history again", two, one)
	}
}

// A run's own record keeps what it weighed, so a reader that comes later sees
// the same number the run saw when it ended.
func TestAFinishedRunReportsWhatItsConversationWeighed(t *testing.T) {
	store, spec := viewFixture(t)
	run := startedRun(t, store, spec, said(provider.RoleUser, "audit the schema"), said(provider.RoleAssistant, "reading"))

	live, err := store.Runs(spec.ParentSession, spec.WorkspaceRoot)
	if err != nil || len(live) != 1 {
		t.Fatalf("runs = %+v err=%v, want the one live run", live, err)
	}
	if live[0].Tokens <= 0 {
		t.Fatalf("live run tokens = %d, want the conversation counted from memory", live[0].Tokens)
	}

	run.Session.Add(said(provider.RoleAssistant, "found it"))
	if err := store.SaveCompleted(run); err != nil {
		t.Fatalf("SaveCompleted: %v", err)
	}
	run.Release()

	done, err := store.Runs(spec.ParentSession, spec.WorkspaceRoot)
	if err != nil || len(done) != 1 {
		t.Fatalf("runs = %+v err=%v, want the one finished run", done, err)
	}
	if done[0].State != RunCompleted {
		t.Fatalf("state = %q, want completed", done[0].State)
	}
	if done[0].Tokens <= live[0].Tokens {
		t.Fatalf("finished run tokens = %d, live run = %d: the record must keep what the run weighed", done[0].Tokens, live[0].Tokens)
	}
}

// A failed run weighs the same as a finished one: the work it did before it
// stopped is still work.
func TestAFailedRunKeepsWhatItWeighed(t *testing.T) {
	store, spec := viewFixture(t)
	run := startedRun(t, store, spec, said(provider.RoleUser, "audit"), said(provider.RoleAssistant, "reading"))
	if err := store.SaveFailed(run); err != nil {
		t.Fatalf("SaveFailed: %v", err)
	}
	run.Release()
	runs, err := store.Runs(spec.ParentSession, spec.WorkspaceRoot)
	if err != nil || len(runs) != 1 || runs[0].Tokens <= 0 {
		t.Fatalf("runs = %+v err=%v, want a failed run that kept its weight", runs, err)
	}
}
