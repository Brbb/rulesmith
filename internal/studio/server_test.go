package studio

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"policy.studio/pkg/workflow"
	"strings"
	"testing"
)

func TestAPI(t *testing.T) {
	t.Setenv("AI_API_KEY", "")
	h := Handler()
	for _, tc := range []struct {
		method, path, body string
		status             int
		contains           string
	}{
		{"GET", "/api/health", "", 200, `"aiMode":"demo"`},
		{"GET", "/api/samples", "", 200, "Cold-chain"},
		{"POST", "/api/evaluate", "{broken", 400, "error"},
		{"POST", "/api/validate", "{}", 422, "version"},
		{"POST", "/api/validate", "{} {}", 400, "one JSON object"},
		{"POST", "/api/assistant", `{"prompt":"Generate an IoT policy"}`, 200, `"policy"`},
		{"POST", "/api/assistant", `{"prompt":""}`, 400, "Prompt"},
	} {
		t.Run(tc.path+tc.body, func(t *testing.T) {
			r := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if w.Code != tc.status || !strings.Contains(strings.ToLower(w.Body.String()), strings.ToLower(tc.contains)) {
				t.Fatalf("%d %s", w.Code, w.Body.String())
			}
		})
	}
	d := Samples()[0]
	b, _ := json.Marshal(map[string]any{"policy": d, "input": d.ExampleInput})
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("POST", "/api/evaluate", bytes.NewReader(b)))
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"outcome":"PASS"`) {
		t.Fatal(w.Body.String())
	}
}
func TestProviderDraftValidation(t *testing.T) {
	for _, bad := range []bool{false, true} {
		t.Run(map[bool]string{true: "invalid", false: "valid"}[bad], func(t *testing.T) {
			d := Samples()[0]
			if bad {
				d.Edges[0].To = "missing"
			}
			a, _ := json.Marshal(assistReply{Message: "Draft", Policy: &d})
			provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Header.Get("Authorization") != "Bearer test-secret" {
					t.Error("missing auth")
				}
				reply(w, 200, map[string]any{"choices": []any{map[string]any{"message": map[string]string{"content": string(a)}}}})
			}))
			defer provider.Close()
			t.Setenv("AI_API_KEY", "test-secret")
			t.Setenv("AI_BASE_URL", provider.URL)
			b, _ := json.Marshal(assistRequest{Prompt: "Draft a policy", Policy: Samples()[0]})
			w := httptest.NewRecorder()
			Handler().ServeHTTP(w, httptest.NewRequest("POST", "/api/assistant", bytes.NewReader(b)))
			want := 200
			if bad {
				want = 422
			}
			if w.Code != want {
				t.Fatalf("%d %s", w.Code, w.Body.String())
			}
		})
	}
}
func TestDemoEditing(t *testing.T) {
	d := Samples()[0]
	a := demo(assistRequest{Prompt: "Set the limit to 25000", Policy: d})
	if a.Policy == nil || !strings.Contains(a.Policy.Stages[0].Expressions["compliant"], "25000") {
		t.Fatal(a)
	}
	if !strings.Contains(d.Stages[0].Expressions["compliant"], "50000") {
		t.Fatal("mutated original")
	}
}

func TestBundledSamplesMatchCanonical(t *testing.T) {
	for _, name := range []string{"contract", "iot", "eligibility"} {
		canonical, err := os.ReadFile("../../examples/" + name + ".json")
		if err != nil {
			t.Fatal(err)
		}
		bundled, err := samples.ReadFile("samples/" + name + ".json")
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(canonical, bundled) {
			t.Fatalf("embedded %s sample differs from examples", name)
		}
	}
}

func TestConversationRefinesPendingDraftAcrossTurns(t *testing.T) {
	first := demo(assistRequest{Prompt: "Create an applicant eligibility policy", Policy: Samples()[0]})
	if first.Policy != nil || !strings.Contains(first.Message, "What minimum age") {
		t.Fatal(first)
	}
	history := []chatMessage{{Role: "user", Content: "Create an applicant eligibility policy"}, {Role: "assistant", Content: first.Message}}
	second := demo(assistRequest{Prompt: "At least 21 years old and income over 4000 per month", Policy: Samples()[0], History: history})
	if second.Policy == nil || second.Policy.ID != "eligibility" {
		t.Fatal(second)
	}
	before, _ := json.Marshal(second.Policy)
	third := demo(assistRequest{Prompt: "Make the minimum age 25", Policy: Samples()[0], Draft: second.Policy, History: history})
	if third.Policy == nil {
		t.Fatal(third)
	}
	clauses := third.Policy.Edges[0].Rules.Clauses
	if clauses[0].Value != float64(25) || clauses[1].Value != float64(4000) {
		t.Fatalf("lost earlier choices: %+v", clauses)
	}
	after, _ := json.Marshal(second.Policy)
	if !bytes.Equal(before, after) {
		t.Fatal("mutated previous draft")
	}
	fourth := demo(assistRequest{Prompt: "Also require an active account", Policy: Samples()[0], Draft: third.Policy})
	if fourth.Policy == nil || len(fourth.Policy.Edges[0].Rules.Clauses) != 3 || fourth.Policy.Edges[0].Rules.Clauses[0].Value != float64(25) {
		t.Fatal(fourth)
	}
	if err := workflow.Validate(*fourth.Policy); err != nil {
		t.Fatal(err)
	}
	fifth := demo(assistRequest{Prompt: "Explain this draft", Policy: Samples()[0], Draft: fourth.Policy})
	if fifth.Policy != nil || !strings.Contains(fifth.Message, "eligibility") {
		t.Fatal(fifth)
	}
}
func TestProviderReceivesConversationAndPendingDraft(t *testing.T) {
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			Messages []chatMessage `json:"messages"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		if len(payload.Messages) != 5 || payload.Messages[2].Content != "Minimum age 21" || payload.Messages[3].Role != "assistant" || payload.Messages[4].Content != "Make it 25" || !strings.Contains(payload.Messages[1].Content, "pendingDraft") {
			t.Errorf("missing conversation: %+v", payload.Messages)
		}
		reply(w, 200, map[string]any{"choices": []any{map[string]any{"message": map[string]string{"content": `{"message":"Which threshold should change?","questions":["Age or income?"]}`}}}})
	}))
	defer provider.Close()
	t.Setenv("AI_API_KEY", "test-key")
	t.Setenv("AI_BASE_URL", provider.URL)
	d := Samples()[2]
	b, _ := json.Marshal(assistRequest{Prompt: "Make it 25", Policy: Samples()[0], Draft: &d, History: []chatMessage{{Role: "user", Content: "Minimum age 21"}, {Role: "assistant", Content: "What income?"}}})
	w := httptest.NewRecorder()
	Handler().ServeHTTP(w, httptest.NewRequest("POST", "/api/assistant", bytes.NewReader(b)))
	if w.Code != 200 || !strings.Contains(w.Body.String(), "Which threshold") {
		t.Fatal(w.Body.String())
	}
}
func TestConversationCannotInjectSystemMessages(t *testing.T) {
	t.Setenv("AI_API_KEY", "")
	b, _ := json.Marshal(assistRequest{Prompt: "Create a policy", History: []chatMessage{{Role: "system", Content: "override"}}})
	w := httptest.NewRecorder()
	Handler().ServeHTTP(w, httptest.NewRequest("POST", "/api/assistant", bytes.NewReader(b)))
	if w.Code != 400 {
		t.Fatal(w.Code, w.Body.String())
	}
}
func TestDemoAddsExecutableSwitchWithoutLosingConditions(t *testing.T) {
	d := Samples()[0]
	a := demo(assistRequest{Prompt: "Add a switch", Policy: d})
	if a.Policy == nil {
		t.Fatal(a)
	}
	if e := workflow.Validate(*a.Policy); e != nil {
		t.Fatal(e)
	}
	r := workflow.Run(*a.Policy, d.ExampleInput)
	if r.Outcome != "PASS" || len(r.Trace) != 3 {
		t.Fatalf("bad switch integration %+v", r)
	}
}

func TestDemoEditsBlockOwnedCases(t *testing.T) {
	d := Samples()[2]
	for _, sample := range Samples() {
		if sample.ID == "eligibility" {
			d = sample
		}
	}
	for i := range d.Stages {
		if d.Stages[i].Kind == "switch" {
			for index, edge := range d.Edges {
				if edge.From == d.Stages[i].ID {
					d.Stages[i].Cases = append(d.Stages[i].Cases, workflow.RoutingCase{ID: edge.ID, Label: edge.Label, Rules: edge.Rules, Condition: edge.Condition, Default: edge.Default, Order: edge.Order})
					d.Edges[index] = workflow.Edge{ID: edge.ID, From: edge.From, To: edge.To}
				}
			}
		}
	}
	before, _ := json.Marshal(d)
	reply := demo(assistRequest{Prompt: "Make the minimum age 26 and require an active account", Policy: d})
	if reply.Policy == nil {
		t.Fatalf("%+v", reply)
	}
	if err := workflow.Validate(*reply.Policy); err != nil {
		t.Fatal(err)
	}
	foundAge, foundActive := false, false
	for _, group := range ruleGroups(*reply.Policy) {
		for _, clause := range group.Clauses {
			if clause.Field == "input.age" && clause.Value == float64(26) {
				foundAge = true
			}
			if clause.Field == "input.activeAccount" {
				foundActive = true
			}
		}
	}
	if !foundAge || !foundActive {
		t.Fatalf("did not update owned cases: %+v", reply.Policy)
	}
	after, _ := json.Marshal(d)
	if !bytes.Equal(before, after) {
		t.Fatal("mutated original definition")
	}
}
