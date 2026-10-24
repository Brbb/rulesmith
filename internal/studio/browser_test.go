package studio

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"policy.studio/pkg/workflow"
	"testing"
)

func TestBrowserContinuationAndFailureIsolation(t *testing.T) {
	policy := workflow.Definition{Version: 1, ID: "code", Name: "Code", InputSchema: workflow.Schema{"value": {Type: "number", Required: true}}, Stages: []workflow.Stage{
		{ID: "js", Name: "JS", Kind: "javascript", Script: "return { doubled: input.value * 2 };", Outputs: workflow.Schema{"doubled": {Type: "number", Required: true}}},
		{ID: "done", Name: "Done", Kind: "decision", Outcome: "PASS"},
	}, Edges: []workflow.Edge{{ID: "next", From: "js", To: "done", Condition: "stages.js.doubled > 0"}}}
	request := func(path string, code map[string]any) (int, map[string]json.RawMessage) {
		body := map[string]any{"policy": policy, "input": map[string]any{"value": 4}}
		if code != nil {
			body["codeResults"] = code
		}
		data, _ := json.Marshal(body)
		recorder := httptest.NewRecorder()
		Handler().ServeHTTP(recorder, httptest.NewRequest("POST", path, bytes.NewReader(data)))
		var response map[string]json.RawMessage
		_ = json.Unmarshal(recorder.Body.Bytes(), &response)
		return recorder.Code, response
	}
	status, response := request("/api/evaluate-browser", nil)
	var pending struct {
		Stage  workflow.Stage `json:"stage"`
		Input  map[string]any `json:"input"`
		Stages map[string]any `json:"stages"`
	}
	_ = json.Unmarshal(response["pending"], &pending)
	if status != 200 || pending.Stage.ID != "js" || pending.Input["value"] != 4.0 || len(pending.Stages) != 0 {
		t.Fatalf("invalid pending response: %s", response["pending"])
	}
	for _, test := range []struct {
		name    string
		code    map[string]any
		outcome string
	}{
		{"valid", map[string]any{"js": map[string]any{"outputs": map[string]any{"doubled": 8}}}, "PASS"},
		{"wrong type", map[string]any{"js": map[string]any{"outputs": map[string]any{"doubled": "eight"}}}, "EXECUTION_ERROR"},
		{"sandbox failure", map[string]any{"js": map[string]any{"error": "interrupted"}}, "EXECUTION_ERROR"},
	} {
		t.Run(test.name, func(t *testing.T) {
			status, response := request("/api/evaluate-browser", test.code)
			var result workflow.Result
			_ = json.Unmarshal(response["result"], &result)
			if status != 200 || result.Outcome != test.outcome || result.Runtime != "browser-assisted" {
				t.Fatalf("unexpected browser result: %+v", result)
			}
		})
	}
	if status, _ := request("/api/evaluate-browser", map[string]any{"done": map[string]any{"outputs": map[string]any{}}}); status != 400 {
		t.Fatal("non-code result accepted")
	}
	_, response = request("/api/evaluate", nil)
	var result workflow.Result
	_ = json.Unmarshal(mustJSON(response), &result)
	if result.Outcome != "EXECUTION_ERROR" {
		t.Fatal("normal endpoint must not execute browser code")
	}
}
func mustJSON(value any) []byte { data, _ := json.Marshal(value); return data }
