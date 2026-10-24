package workflow_test

import (
	"encoding/json"
	"policy.studio/pkg/workflow"
	"strings"
	"testing"
)

func blockPolicy(t *testing.T, kind string) workflow.Definition {
	t.Helper()
	var d workflow.Definition
	if err := json.Unmarshal([]byte(`{"version":1,"id":"blocks","name":"Block routing","inputSchema":{"score":{"type":"number","required":true}},"stages":[{"id":"input","name":"Input","kind":"transform"},{"id":"route","name":"Route","kind":"`+kind+`","cases":[{"id":"yes","label":"True","condition":"input.score >= 10","order":1},{"id":"no","label":"False","default":true}]},{"id":"pass","name":"Pass","kind":"decision","outcome":"PASS"},{"id":"flag","name":"Flag","kind":"decision","outcome":"FLAG"}],"edges":[{"id":"next","from":"input","to":"route"},{"id":"yes","from":"route","to":"pass"},{"id":"no","from":"route","to":"flag"}]}`), &d); err != nil {
		t.Fatal(err)
	}
	return d
}
func TestBlockOwnedRouting(t *testing.T) {
	for _, kind := range []string{"if", "switch"} {
		for _, score := range []float64{9, 10} {
			t.Run(kind+string(rune(int(score)+65)), func(t *testing.T) {
				d := blockPolicy(t, kind)
				before, _ := json.Marshal(d)
				if err := workflow.Validate(d); err != nil {
					t.Fatal(err)
				}
				result := workflow.Run(d, map[string]any{"score": score})
				want := "FLAG"
				if score >= 10 {
					want = "PASS"
				}
				if result.Outcome != want {
					t.Fatalf("%+v", result)
				}
				if len(result.Trace) != 3 || result.Trace[0].Edges[0].Condition != "" || result.Trace[1].Edges[0].Condition != "input.score >= 10" {
					t.Fatalf("bad trace: %+v", result)
				}
				after, _ := json.Marshal(d)
				if string(before) != string(after) {
					t.Fatal("validation or execution mutated definition")
				}
			})
		}
	}
	d := blockPolicy(t, "if")
	if result := workflow.Run(d, map[string]any{}); result.Outcome != "UNKNOWN" {
		t.Fatalf("%+v", result)
	}
	if result := workflow.Run(d, map[string]any{"score": "bad"}); result.Outcome != "EXECUTION_ERROR" {
		t.Fatalf("%+v", result)
	}
}
func TestSwitchCasesPriorityAndStrictMigration(t *testing.T) {
	d := blockPolicy(t, "switch")
	d.Stages[1].Cases = append(d.Stages[1].Cases, workflow.RoutingCase{ID: "second", Condition: "true", Order: 2})
	d.Edges = append(d.Edges, workflow.Edge{ID: "second", From: "route", To: "flag"})
	if result := workflow.Run(d, map[string]any{"score": 10.0}); result.Outcome != "PASS" || len(result.Trace[1].Edges) != 1 {
		t.Fatalf("%+v", result)
	}
	d.Stages[1].Routing = "exclusive"
	if result := workflow.Run(d, map[string]any{"score": 10.0}); result.Outcome != "EXECUTION_ERROR" || !strings.Contains(result.Explanation, "Ambiguous") {
		t.Fatalf("%+v", result)
	}
	d.Stages[1].Cases[2].Condition = "false"
	if result := workflow.Run(d, map[string]any{"score": 10.0}); result.Outcome != "PASS" {
		t.Fatalf("fallback ran after a match: %+v", result)
	}
}
func TestBlockRoutingRejectsDuplicateOrIncompleteDefinitions(t *testing.T) {
	for _, tc := range []struct {
		name   string
		change func(*workflow.Definition)
	}{
		{"condition duplicated on connection", func(d *workflow.Definition) { d.Edges[1].Condition = "false" }},
		{"duplicate case ID", func(d *workflow.Definition) { d.Stages[1].Cases[1].ID = "yes" }},
		{"missing connection", func(d *workflow.Definition) { d.Stages[1].Cases[0].ID = "missing" }},
		{"unowned connection", func(d *workflow.Definition) {
			d.Edges = append(d.Edges, workflow.Edge{ID: "extra", From: "route", To: "pass"})
		}},
		{"missing false branch", func(d *workflow.Definition) { d.Stages[1].Cases[1].Default = false }},
		{"multiple fallbacks", func(d *workflow.Definition) { d.Stages[1].Cases[0].Default = true; d.Stages[1].Cases[0].Condition = "" }},
		{"cases on evaluation", func(d *workflow.Definition) { d.Stages[1].Kind = "transform" }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			d := blockPolicy(t, "if")
			tc.change(&d)
			if err := workflow.Validate(d); err == nil {
				t.Fatal("expected validation failure")
			}
		})
	}
}

func TestRejectIsATerminalDecision(t *testing.T) {
	d := blockPolicy(t, "if")
	d.Stages[3].Outcome = "REJECT"
	result := workflow.Run(d, map[string]any{"score": 9.0})
	if result.Outcome != "REJECT" || result.Trace[len(result.Trace)-1].Status != "REJECT" {
		t.Fatalf("%+v", result)
	}
	data, err := json.Marshal(d)
	if err != nil {
		t.Fatal(err)
	}
	restored, err := workflow.Decode(data)
	if err != nil {
		t.Fatal(err)
	}
	if err = workflow.Validate(restored); err != nil {
		t.Fatal(err)
	}
	if got := workflow.Run(restored, map[string]any{"score": 10.0}); got.Outcome != "PASS" {
		t.Fatalf("%+v", got)
	}
}
