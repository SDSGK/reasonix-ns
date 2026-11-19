package serve

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"reasonix/internal/session/control"
)

func post(mux *http.ServeMux, target, body string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, target, strings.NewReader(body)))
	return rec
}

func TestSubagentContinueSendsTheTaskAndAnswersWithTheTurn(t *testing.T) {
	src := &subagentSource{}
	src.turn = control.SubagentTurn{Ref: "sa_1", Answer: "all done", Read: []string{"a.go"}, Wrote: []string{"b.go"}}
	rec := post(subagentMux(src), "/subagents/sa_1/submit", `{"input":"keep going"}`)
	var got subagentContinueView
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil || rec.Code != 200 {
		t.Fatalf("status %d body %s err %v", rec.Code, rec.Body.String(), err)
	}
	if src.gotRef != "sa_1" || src.gotInput != "keep going" {
		t.Fatalf("asked %q with %q", src.gotRef, src.gotInput)
	}
	if got.Ref != "sa_1" || got.Answer != "all done" || len(got.Read) != 1 || len(got.Wrote) != 1 {
		t.Fatalf("turn = %+v", got)
	}
}

func TestSubagentContinueRefusesABusySessionAndAnUnknownRun(t *testing.T) {
	for _, tc := range []struct {
		err    error
		status int
		code   string
	}{
		{control.ErrTurnRunning, http.StatusConflict, "subagent.busy"},
		{errors.New("disk on fire"), http.StatusInternalServerError, "subagent.read_failed"},
	} {
		src := &subagentSource{err: tc.err}
		rec := post(subagentMux(src), "/subagents/sa_1/submit", `{"input":"keep going"}`)
		var reason Reason
		_ = json.Unmarshal(rec.Body.Bytes(), &reason)
		if rec.Code != tc.status || reason.Code != tc.code {
			t.Fatalf("%v: status %d code %q, want %d %s", tc.err, rec.Code, reason.Code, tc.status, tc.code)
		}
	}
}

func TestSubagentContinueRefusesABodyThatIsNotATask(t *testing.T) {
	src := &subagentSource{}
	rec := post(subagentMux(src), "/subagents/sa_1/submit", `not json`)
	var reason Reason
	_ = json.Unmarshal(rec.Body.Bytes(), &reason)
	if rec.Code != http.StatusBadRequest || reason.Code != "subagent.bad_request" {
		t.Fatalf("status %d code %q", rec.Code, reason.Code)
	}
	if src.gotInput != "" {
		t.Fatalf("a malformed body reached the controller as %q", src.gotInput)
	}
}
