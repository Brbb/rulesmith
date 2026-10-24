package workflow

import (
	"fmt"
	"strings"
	"testing"
)

func javascriptFixture() Definition {
	return Definition{Version: 1, ID: "javascript", Name: "JavaScript", InputSchema: Schema{"amount": {Type: "number", Required: true}}, Stages: []Stage{
		{ID: "base", Name: "Base", Kind: "transform", Outputs: Schema{"subtotal": {Type: "number", Required: true}}, Expressions: map[string]string{"subtotal": "input.amount * 2"}},
		{ID: "code", Name: "Code", Kind: "javascript", Script: "return { total: stages.base.subtotal + 5 };", Outputs: Schema{"total": {Type: "number", Required: true}}},
		{ID: "pass", Name: "Approve", Kind: "decision", Outcome: "PASS"}, {ID: "flag", Name: "Review", Kind: "decision", Outcome: "FLAG"},
	}, Edges: []Edge{{ID: "base-code", From: "base", To: "code"}, {ID: "code-pass", From: "code", To: "pass", Condition: "stages.code.total >= 20"}, {ID: "code-flag", From: "code", To: "flag", Condition: "stages.code.total < 20"}}}
}
func TestJavaScriptExecutorRoutingAndContracts(t *testing.T) {
	policy := javascriptFixture()
	if err := Validate(policy); err != nil {
		t.Fatal(err)
	}
	result := RunWithExecutor(policy, map[string]any{"amount": 10.0}, func(stage Stage, input, stages map[string]any) (map[string]any, error) {
		if stage.ID != "code" || input["amount"] != 10.0 || stages["base"].(map[string]any)["subtotal"] != 20.0 {
			t.Fatal("executor context must contain original input and prior outputs")
		}
		return map[string]any{"total": 25.0}, nil
	})
	if result.Outcome != "PASS" || result.Trace[1].Outputs["total"] != 25.0 {
		t.Fatalf("unexpected result: %+v", result)
	}
	for _, test := range []struct {
		name    string
		outputs map[string]any
		err     error
	}{
		{"wrong type", map[string]any{"total": "25"}, nil}, {"missing", map[string]any{}, nil}, {"undeclared", map[string]any{"total": 25.0, "extra": true}, nil}, {"timeout", nil, fmt.Errorf("time limit")},
	} {
		t.Run(test.name, func(t *testing.T) {
			result := RunWithExecutor(policy, map[string]any{"amount": 10.0}, func(Stage, map[string]any, map[string]any) (map[string]any, error) { return test.outputs, test.err })
			if result.Outcome != "EXECUTION_ERROR" || result.Trace[len(result.Trace)-1].StageID != "code" {
				t.Fatalf("must fail at code stage: %+v", result)
			}
		})
	}
}
func TestJavaScriptNeverExecutesInDefaultRuntime(t *testing.T) {
	result := Run(javascriptFixture(), map[string]any{"amount": 10.0})
	if result.Outcome != "EXECUTION_ERROR" || !strings.Contains(result.Explanation, "browser executor") {
		t.Fatalf("default runtime must fail closed: %+v", result)
	}
	policy := javascriptFixture()
	policy.Stages[1].Script = ""
	if Validate(policy) == nil {
		t.Fatal("empty source accepted")
	}
	policy = javascriptFixture()
	policy.Stages[1].Script = strings.Repeat("x", 16385)
	if Validate(policy) == nil {
		t.Fatal("oversized source accepted")
	}
	policy = javascriptFixture()
	policy.Stages[0].Script = "return {};"
	if Validate(policy) == nil {
		t.Fatal("transform accepted script")
	}
}
