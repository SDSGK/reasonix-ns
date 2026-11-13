package provider_test

// A working session must survive a provider switch mid-conversation. The same
// unified Message slice is handed to each implementation's Stream in turn, and
// every request body is captured for structural assertions. The rules exercised
// here are the round-trip rules documented on provider.Message:
//
//   - Anthropic signs its thinking blocks (ReasoningSignature) and requires the
//     signed block replayed after a tool call; OpenAI-compatible endpoints have
//     no signature and must never receive one.
//   - OpenAI Responses issue ReasoningID/ReasoningStatus; Anthropic has no such
//     ids and must never receive one.
//   - ToolCalls and their RoleTool results keep their ID linkage across every
//     provider's serialization.
//
// This is the same separation pi formalizes as provider-agnostic context
// handoff; here it is pinned by contract tests instead of by convention.

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"reasonix/internal/contract/provider"
	"reasonix/internal/model/anthropic"
	"reasonix/internal/model/openai"
)

// handoffSession builds the same working conversation for every provider: a
// user ask, an assistant turn that thought and called a tool, and the tool
// result. fromAnthropic picks which provider's reasoning proof the assistant
// turn carries.
func handoffSession(fromAnthropic bool) []provider.Message {
	sig, rid := "", ""
	if fromAnthropic {
		sig = "sig-anthropic"
	} else {
		rid = "rs_openai"
	}
	return []provider.Message{
		{Role: provider.RoleUser, Content: "weather in Paris?"},
		{
			Role:               provider.RoleAssistant,
			Content:            "Let me check.",
			ReasoningContent:   "The user asked for Paris weather.",
			ReasoningSignature: sig,
			ReasoningID:        rid,
			ToolCalls: []provider.ToolCall{
				{ID: "t1", Name: "get_weather", Arguments: `{"city":"Paris"}`},
			},
		},
		{Role: provider.RoleTool, ToolCallID: "t1", Content: "sunny"},
	}
}

func weatherTools() []provider.ToolSchema {
	return []provider.ToolSchema{{
		Name:        "get_weather",
		Description: "weather",
		Parameters:  json.RawMessage(`{"type":"object"}`),
	}}
}

// drain consumes a stream and returns the terminal error, if any.
func drain(ch <-chan provider.Chunk) error {
	var terminal error
	for c := range ch {
		if c.Type == provider.ChunkError {
			terminal = c.Err
		}
	}
	return terminal
}

// openAIFixture serves a minimal OpenAI chat SSE response and captures the
// last request body it received.
func openAIFixture(t *testing.T, capture *string) provider.Provider {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		*capture = string(body)
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"content\":\"sunny in Paris\"}}]}\n\ndata: [DONE]\n\n")
	}))
	t.Cleanup(srv.Close)
	p, err := openai.New(provider.Config{Name: "relay", BaseURL: srv.URL, Model: "m", APIKey: "k"})
	if err != nil {
		t.Fatal(err)
	}
	return p
}

// anthropicFixture serves a minimal Anthropic SSE response and captures the
// last request body it received.
func anthropicFixture(t *testing.T, capture *string) provider.Provider {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		*capture = string(body)
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, `data: {"type":"message_start","message":{"usage":{"input_tokens":10,"output_tokens":1}}}`+"\n\n"+
			`data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"sunny in Paris"}}`+"\n\n"+
			`data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"input_tokens":10,"output_tokens":6}}`+"\n\n"+
			`data: {"type":"message_stop"}`+"\n\n")
	}))
	t.Cleanup(srv.Close)
	p, err := anthropic.New(provider.Config{Name: "fixture", BaseURL: srv.URL, Model: "claude-opus-4-8", APIKey: "test"})
	if err != nil {
		t.Fatal(err)
	}
	return p
}

// TestHandoffAnthropicHistoryToOpenAI hands a session an Anthropic client
// produced — signed thinking included — to an OpenAI-compatible endpoint. The
// endpoint must accept the history, see the tool linkage, and never receive
// the Anthropic reasoning signature.
func TestHandoffAnthropicHistoryToOpenAI(t *testing.T) {
	var body string
	p := openAIFixture(t, &body)

	stream, err := p.Stream(context.Background(), provider.Request{
		Messages: handoffSession(true),
		Tools:    weatherTools(),
	})
	if err != nil {
		t.Fatalf("openai rejected an anthropic-origin history: %v", err)
	}
	if err := drain(stream); err != nil {
		t.Fatalf("stream error: %v", err)
	}
	if !json.Valid([]byte(body)) {
		t.Fatalf("request body is not valid JSON: %q", body)
	}
	if !strings.Contains(body, "tool_calls") {
		t.Error("openai request lost the assistant tool_calls")
	}
	if !strings.Contains(body, `"tool_call_id":"t1"`) {
		t.Error("openai request lost the tool result linkage (tool_call_id)")
	}
	if strings.Contains(body, "sig-anthropic") {
		t.Error("the anthropic reasoning signature leaked into the openai request")
	}
}

// TestHandoffOpenAIHistoryToAnthropic hands a session an OpenAI-compatible
// client produced — reasoning item id included — to an Anthropic endpoint. The
// endpoint must accept the history, express the tool linkage as tool_use /
// tool_result blocks, and never receive the OpenAI reasoning id.
func TestHandoffOpenAIHistoryToAnthropic(t *testing.T) {
	var body string
	p := anthropicFixture(t, &body)

	stream, err := p.Stream(context.Background(), provider.Request{
		Messages: handoffSession(false),
		Tools:    weatherTools(),
	})
	if err != nil {
		t.Fatalf("anthropic rejected an openai-origin history: %v", err)
	}
	if err := drain(stream); err != nil {
		t.Fatalf("stream error: %v", err)
	}
	if !json.Valid([]byte(body)) {
		t.Fatalf("request body is not valid JSON: %q", body)
	}
	if !strings.Contains(body, `"type":"tool_use"`) {
		t.Error("anthropic request lost the assistant tool_use block")
	}
	if !strings.Contains(body, `"type":"tool_result"`) {
		t.Error("anthropic request lost the tool_result block")
	}
	if strings.Contains(body, "rs_openai") {
		t.Error("the openai reasoning id leaked into the anthropic request")
	}
}

// TestHandoffChainAlternatesWithoutLosingStructure walks one session through
// three provider switches (anthropic → openai → anthropic → openai). Each hop
// must accept everything the previous hops produced and answer cleanly.
func TestHandoffChainAlternatesWithoutLosingStructure(t *testing.T) {
	var openAIBody, anthropicBody string
	openAI := openAIFixture(t, &openAIBody)
	claude := anthropicFixture(t, &anthropicBody)

	msgs := handoffSession(true)

	hops := []struct {
		name    string
		p       provider.Provider
		capture *string
	}{
		{"anthropic", claude, &anthropicBody},
		{"openai", openAI, &openAIBody},
		{"anthropic again", claude, &anthropicBody},
		{"openai again", openAI, &openAIBody},
	}
	for i, hop := range hops {
		stream, err := hop.p.Stream(context.Background(), provider.Request{
			Messages: msgs,
			Tools:    weatherTools(),
		})
		if err != nil {
			t.Fatalf("hop %d (%s) rejected the history: %v", i+1, hop.name, err)
		}
		if err := drain(stream); err != nil {
			t.Fatalf("hop %d (%s) stream error: %v", i+1, hop.name, err)
		}
		// The next hop receives this hop's answer appended to the shared
		// history; the assistant text itself is fixture-constant.
		msgs = append(msgs, provider.Message{Role: provider.RoleAssistant, Content: "sunny in Paris"})
	}
	if !strings.Contains(anthropicBody, `"type":"tool_use"`) {
		t.Error("final anthropic hop lost the tool_use block")
	}
	if !strings.Contains(openAIBody, "tool_calls") {
		t.Error("final openai hop lost the tool_calls")
	}
}
