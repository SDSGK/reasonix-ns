package delegation

import (
	"context"
	"strings"
	"sync"
	"testing"

	"reasonix/internal/base/testenv"
	"reasonix/internal/contract/provider"
	"reasonix/internal/contract/tool"
	"reasonix/internal/runtime/agent"
)

// scriptedProvider answers each round with one text line and keeps every
// request it was given, so a test can read what the model actually saw.
type scriptedProvider struct {
	mu       sync.Mutex
	answers  []string
	requests []provider.Request
}

func (p *scriptedProvider) Name() string { return "delegation-scripted" }

func (p *scriptedProvider) Stream(ctx context.Context, req provider.Request) (<-chan provider.Chunk, error) {
	p.mu.Lock()
	p.requests = append(p.requests, req)
	answer := "answer"
	if len(p.answers) > 0 {
		answer = p.answers[0]
		p.answers = p.answers[1:]
	}
	p.mu.Unlock()
	ch := make(chan provider.Chunk, 2)
	ch <- provider.Chunk{Type: provider.ChunkText, Text: answer}
	ch <- provider.Chunk{Type: provider.ChunkDone}
	close(ch)
	return ch, nil
}

func (p *scriptedProvider) requestAt(index int) provider.Request {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.requests[index]
}

// A continuation is one more round on the transcript the first round wrote:
// the same reference, the same file, and a model that sees what came before.
func TestRunnerContinuesTheSameTranscript(t *testing.T) {
	store := NewSubagentStore(testenv.TempDir(t))
	prov := &scriptedProvider{answers: []string{"first answer", "second answer"}}
	runner := NewRunner(RunnerOptions{
		Registry:      testToolRegistry(),
		Provider:      prov,
		Store:         store,
		WorkspaceRoot: testenv.TempDir(t),
		MaxDepth:      1,
		RunOptions: func(context.Context, int, *provider.Pricing, int, int) agent.Options {
			return agent.Options{MaxSteps: 4}
		},
	})
	ctx := agent.WithParentSession(context.Background(), "parent-session")

	first, err := runner.Run(ctx, RunSpec{Task: "first task", Tools: []string{"read_file"}})
	if err != nil {
		t.Fatalf("first round: %v", err)
	}
	if first.Ref == "" {
		t.Fatal("the first round must name the run it wrote")
	}

	second, err := runner.Run(ctx, RunSpec{Task: "follow up", Tools: []string{"read_file"}, Ref: first.Ref})
	if err != nil {
		t.Fatalf("second round: %v", err)
	}
	if second.Ref != first.Ref {
		t.Fatalf("the continuation wrote ref %q, want the run it continued (%q)", second.Ref, first.Ref)
	}

	seen := requestText(prov.requestAt(1))
	for _, want := range []string{"first task", "first answer", "follow up"} {
		if !strings.Contains(seen, want) {
			t.Fatalf("the second round did not see %q:\n%s", want, seen)
		}
	}

	page, err := store.Transcript(first.Ref, "parent-session", runner.WorkspaceRoot, 0, 0)
	if err != nil {
		t.Fatalf("read the transcript: %v", err)
	}
	var stored strings.Builder
	for _, m := range page.Messages {
		stored.WriteString(m.Content)
		stored.WriteString("\n")
	}
	transcript := stored.String()
	for _, want := range []string{"first task", "first answer", "follow up", "second answer"} {
		if !strings.Contains(transcript, want) {
			t.Fatalf("the stored transcript lost %q:\n%s", want, transcript)
		}
	}
}

// A continuation inherits the boundary the first round ran under; it never
// widens it.
func TestContinuationKeepsTheFirstRoundsBoundary(t *testing.T) {
	store := NewSubagentStore(testenv.TempDir(t))
	prov := &scriptedProvider{answers: []string{"read only answer", "still read only"}}
	runner := NewRunner(RunnerOptions{
		Registry:      testToolRegistry(),
		Provider:      prov,
		Store:         store,
		WorkspaceRoot: testenv.TempDir(t),
		MaxDepth:      1,
		RunOptions: func(context.Context, int, *provider.Pricing, int, int) agent.Options {
			return agent.Options{MaxSteps: 4}
		},
	})
	ctx := agent.WithParentSession(context.Background(), "parent-session")

	first, err := runner.Run(ctx, RunSpec{Task: "read the repo", Tools: []string{"read_file"}, ReadOnly: true})
	if err != nil {
		t.Fatalf("first round: %v", err)
	}
	if _, err := runner.Run(ctx, RunSpec{Task: "now write it", Tools: []string{"read_file", "write_file"}, Ref: first.Ref}); err != nil {
		t.Fatalf("second round: %v", err)
	}
	seen := requestText(prov.requestAt(1))
	if strings.Contains(seen, "write_file") {
		t.Fatalf("the continuation widened the boundary it inherited:\n%s", seen)
	}
}

// A reference no run answers to is refused, not run against a fresh child.
func TestContinuationOfAnUnknownReferenceIsRefused(t *testing.T) {
	store := NewSubagentStore(testenv.TempDir(t))
	runner := NewRunner(RunnerOptions{
		Registry:      testToolRegistry(),
		Provider:      &scriptedProvider{},
		Store:         store,
		WorkspaceRoot: testenv.TempDir(t),
		MaxDepth:      1,
		RunOptions: func(context.Context, int, *provider.Pricing, int, int) agent.Options {
			return agent.Options{MaxSteps: 4}
		},
	})
	ctx := agent.WithParentSession(context.Background(), "parent-session")

	if _, err := runner.Run(ctx, RunSpec{Task: "hello", Ref: "sa_does_not_exist"}); err == nil {
		t.Fatal("a continuation of an unknown reference must be refused")
	}
}

func testToolRegistry() *tool.Registry {
	reg := tool.NewRegistry()
	reg.Add(fakeTool{name: "read_file", readOnly: true})
	reg.Add(fakeTool{name: "write_file"})
	return reg
}

func requestText(req provider.Request) string {
	var b strings.Builder
	for _, m := range req.Messages {
		b.WriteString(string(m.Role) + ": " + m.Content + "\n")
	}
	return b.String()
}
