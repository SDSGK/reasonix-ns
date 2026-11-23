package delegation

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"reasonix/internal/base/tokencount"
	"reasonix/internal/contract/provider"
	"reasonix/internal/state/sessionstore"
)

// errLineageUnproven marks a lineage the on-disk records cannot establish, as
// opposed to one that could not be read.
var errLineageUnproven = errors.New("session lineage not established")

var (
	ErrSubagentNotFound = errors.New("no sub-agent run answers to that reference")
	ErrSubagentNotOwned = errors.New("that sub-agent run does not belong to this conversation")
)

// RunState is what a reader is told about a run. Running means this process is
// executing it now; a stored run that says running while nothing holds it was
// left by an owner that is gone, and is reported as interrupted.
type RunState string

const (
	RunRunning     RunState = "running"
	RunCompleted   RunState = "completed"
	RunFailed      RunState = "failed"
	RunCancelled   RunState = "cancelled"
	RunInterrupted RunState = "interrupted"
)

// defaultTranscriptPage bounds one read, so a long run is fetched in pages.
const defaultTranscriptPage = 500

// RunInfo describes one sub-agent run of a conversation.
type RunInfo struct {
	Ref           string
	Name          string
	Kind          string
	Model         string
	Effort        string
	State         RunState
	ParentSession string
	// ParentToolCallID is the call in the parent's transcript that spawned the
	// run; it is how a reader pairs a task card with its run.
	ParentToolCallID string
	ParentTurn       string
	StartedAt        time.Time
	UpdatedAt        time.Time
	// Tokens is what the run's conversation weighed, estimated from the
	// transcript it kept. Zero means the record predates the estimate, or
	// the run never reached the model.
	Tokens int
}

// RunTranscript is one page of a run's conversation: Messages are those from
// index After, Next is where the following page starts, Total how many exist now.
type RunTranscript struct {
	Info     RunInfo
	Messages []provider.Message
	After    int
	Next     int
	Total    int
	Live     bool
}

func (s *SubagentStore) setLive(ref string, sess *sessionstore.Session) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if sess == nil {
		delete(s.live, ref)
		return
	}
	s.live[ref] = &liveRun{sess: sess}
}

func (s *SubagentStore) liveSession(ref string) *sessionstore.Session {
	s.mu.Lock()
	defer s.mu.Unlock()
	if r := s.live[ref]; r != nil {
		return r.sess
	}
	return nil
}

// checkOwner is the one rule for who may read a run: the conversation that
// spawned it or one it descends from, in the workspace it ran in.
func (s *SubagentStore) checkOwner(ref string, meta sessionstore.SubagentMeta, parentSession, workspaceRoot string) error {
	parentSession = strings.TrimSpace(parentSession)
	owner := strings.TrimSpace(meta.ParentSession)
	if owner != parentSession {
		ok, err := s.isAncestorSession(owner, parentSession)
		if errors.Is(err, errLineageUnproven) {
			return fmt.Errorf("%w: subagent reference %q ownership could not be verified: %w", ErrSubagentNotOwned, ref, err)
		}
		if err != nil {
			return fmt.Errorf("subagent reference %q ownership could not be verified: %w", ref, err)
		}
		if !ok {
			return fmt.Errorf("%w: %q is outside the current conversation lineage", ErrSubagentNotOwned, ref)
		}
	}
	if want := strings.TrimSpace(workspaceRoot); want != "" && strings.TrimSpace(meta.WorkspaceRoot) != want {
		return fmt.Errorf("%w: %q belongs to a different workspace", ErrSubagentNotOwned, ref)
	}
	return nil
}

func (s *SubagentStore) infoOf(meta sessionstore.SubagentMeta) RunInfo {
	state := RunState(meta.Status)
	if meta.Status == sessionstore.SubagentRunning && !s.held(meta.Ref) {
		state = RunInterrupted
	}
	return RunInfo{
		Ref: meta.Ref, Name: meta.Name, Kind: meta.Kind, Model: meta.Model, Effort: meta.Effort,
		State: state, ParentSession: meta.ParentSession, ParentToolCallID: meta.ParentToolCallID, ParentTurn: meta.ParentTurn,
		StartedAt: meta.CreatedAt, UpdatedAt: meta.UpdatedAt, Tokens: meta.Tokens,
	}
}

// tokensOf is what the run weighed. A finished run carries the estimate its
// own record kept; a run this process is executing now has no record yet, so
// it is counted from the conversation in memory.
func (s *SubagentStore) tokensOf(meta sessionstore.SubagentMeta) int {
	if meta.Status == sessionstore.SubagentRunning {
		if sess := s.liveSession(meta.Ref); sess != nil {
			return runTokens(sess.Snapshot())
		}
	}
	return meta.Tokens
}

// runTokens estimates what a run's own conversation cost the provider: a
// chat-shaped agent re-sends its whole conversation on every model call, so
// the prompt of the k-th call is everything said before it. It is an estimate
// and not a bill — there is no tokenizer here — but it is the same measure
// for every run, which is what a reader comparing two sub-agents needs.
func runTokens(msgs []provider.Message) int {
	prompt, output, history := 0, 0, 0
	for _, m := range msgs {
		size := messageTokens(m)
		if m.Role == provider.RoleAssistant {
			prompt += history
			output += size
		}
		history += size
	}
	return prompt + output
}

// messageTokens is what one message weighs on the wire: its text, its
// reasoning, and the calls it asked for.
func messageTokens(m provider.Message) int {
	n := tokencount.Text(m.Content) + tokencount.Text(m.ReasoningContent)
	for _, call := range m.ToolCalls {
		n += tokencount.Text(call.Name) + tokencount.Text(call.Arguments)
	}
	return n
}

// Runs lists the sub-agent runs a conversation spawned, newest first.
func (s *SubagentStore) Runs(parentSession, workspaceRoot string) ([]RunInfo, error) {
	if s == nil || strings.TrimSpace(parentSession) == "" {
		return nil, nil
	}
	artifacts, err := sessionstore.ListSubagentsByParent(filepath.Dir(s.dir), parentSession)
	if err != nil {
		return nil, err
	}
	out := make([]RunInfo, 0, len(artifacts))
	for _, a := range artifacts {
		if want := strings.TrimSpace(workspaceRoot); want != "" && strings.TrimSpace(a.Meta.WorkspaceRoot) != want {
			continue
		}
		meta := a.Meta
		meta.Ref = a.Ref
		info := s.infoOf(meta)
		info.Tokens = s.tokensOf(meta)
		out = append(out, info)
	}
	slices.SortFunc(out, func(a, b RunInfo) int { return b.StartedAt.Compare(a.StartedAt) })
	return out, nil
}

// LiveRuns lists the runs of parentSession that this process is executing now.
// It reads the in-memory registry and one small record per live run, never the
// store's directory, so asking often costs what is running and not what ran.
func (s *SubagentStore) LiveRuns(parentSession, workspaceRoot string) ([]RunInfo, error) {
	parentSession = strings.TrimSpace(parentSession)
	if s == nil || parentSession == "" {
		return nil, nil
	}
	s.mu.Lock()
	refs := make([]string, 0, len(s.live))
	for ref := range s.live {
		refs = append(refs, ref)
	}
	s.mu.Unlock()
	want := strings.TrimSpace(workspaceRoot)
	out := make([]RunInfo, 0, len(refs))
	for _, ref := range refs {
		meta, err := s.LoadMeta(ref)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				continue
			}
			return nil, err
		}
		if strings.TrimSpace(meta.ParentSession) != parentSession || (want != "" && strings.TrimSpace(meta.WorkspaceRoot) != want) {
			continue
		}
		meta.Ref = ref
		info := s.infoOf(meta)
		info.Tokens = s.tokensOf(meta)
		out = append(out, info)
	}
	slices.SortFunc(out, func(a, b RunInfo) int { return b.StartedAt.Compare(a.StartedAt) })
	return out, nil
}

// Transcript reads a run's conversation from index after, at most limit
// messages (a page when zero). A run this process is executing is read from
// memory; any other from its stored transcript.
func (s *SubagentStore) Transcript(ref, parentSession, workspaceRoot string, after, limit int) (RunTranscript, error) {
	if s == nil || !sessionstore.ValidSubagentRef(strings.TrimSpace(ref)) {
		return RunTranscript{}, ErrSubagentNotFound
	}
	ref = strings.TrimSpace(ref)
	meta, err := s.LoadMeta(ref)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return RunTranscript{}, ErrSubagentNotFound
		}
		return RunTranscript{}, err
	}
	meta.Ref = ref
	if err := s.checkOwner(ref, meta, parentSession, workspaceRoot); err != nil {
		return RunTranscript{}, err
	}
	if after < 0 {
		after = 0
	}
	if limit <= 0 {
		limit = defaultTranscriptPage
	}
	out := RunTranscript{Info: s.infoOf(meta), After: after}
	sess := s.liveSession(ref)
	if sess != nil {
		// A run is recorded complete a moment before its owner lets go of it:
		// only one that still says running is being written.
		out.Live = meta.Status == sessionstore.SubagentRunning
	} else {
		loaded, err := sessionstore.LoadSession(s.sessionPath(ref))
		if err != nil {
			return RunTranscript{}, fmt.Errorf("load subagent transcript %q: %w", ref, err)
		}
		sess = loaded
	}
	out.Total = sess.Len()
	out.Messages = sess.MessageRange(after, after+limit)
	out.Next = after + len(out.Messages)
	return out, nil
}
