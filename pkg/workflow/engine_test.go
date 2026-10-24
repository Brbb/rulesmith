package workflow_test

import (
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"

	"policy.studio/pkg/workflow"
)

func sample(t *testing.T, name string) workflow.Definition {
	t.Helper()
	b, e := os.ReadFile("../../examples/" + name + ".json")
	if e != nil {
		t.Fatal(e)
	}
	d, e := workflow.Decode(b)
	if e != nil {
		t.Fatal(e)
	}
	return d
}
func TestOutcomeContracts(t *testing.T) {
	for _, tc := range []struct {
		name, sample, out string
		modify            func(workflow.Definition, map[string]any)
	}{
		{"contract pass", "contract", "PASS", nil},
		{"contract flag", "contract", "FLAG", func(d workflow.Definition, i map[string]any) { i["hasSignature"] = false }},
		{"contract unknown evidence", "contract", "UNKNOWN", func(d workflow.Definition, i map[string]any) { i["evidenceComplete"] = false }},
		{"contract threshold inclusive", "contract", "PASS", func(d workflow.Definition, i map[string]any) { i["value"] = float64(50000) }},
		{"contract over threshold", "contract", "FLAG", func(d workflow.Definition, i map[string]any) { i["value"] = float64(50001) }},
		{"missing input", "contract", "UNKNOWN", func(d workflow.Definition, i map[string]any) { delete(i, "value") }},
		{"wrong type", "contract", "EXECUTION_ERROR", func(d workflow.Definition, i map[string]any) { i["value"] = "24000" }},
		{"iot pass", "iot", "PASS", nil},
		{"iot unsafe", "iot", "FLAG", func(d workflow.Definition, i map[string]any) { i["temperature"] = float64(9) }},
		{"iot stale", "iot", "UNKNOWN", func(d workflow.Definition, i map[string]any) { i["ageMinutes"] = float64(16) }},
		{"iot negative age", "iot", "UNKNOWN", func(d workflow.Definition, i map[string]any) { i["ageMinutes"] = float64(-1) }},
		{"expression runtime error", "contract", "EXECUTION_ERROR", func(d workflow.Definition, i map[string]any) {
			d.Stages[0].Expressions["compliant"] = "int(input.vendor) > 0"
		}},
		{"wrong output type", "contract", "EXECUTION_ERROR", func(d workflow.Definition, i map[string]any) { d.Stages[0].Expressions["compliant"] = "42" }},
		{"ambiguous routing", "contract", "EXECUTION_ERROR", func(d workflow.Definition, i map[string]any) {
			d.Edges[0].Condition = "true"
			d.Edges[1].Condition = "true"
		}},
		{"no matching route", "contract", "UNKNOWN", func(d workflow.Definition, i map[string]any) {
			for n := range d.Edges {
				d.Edges[n].Condition = "false"
			}
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			d := sample(t, tc.sample)
			if tc.modify != nil {
				tc.modify(d, d.ExampleInput)
			}
			r := workflow.Run(d, d.ExampleInput)
			if r.Outcome != tc.out {
				t.Fatalf("want %s, got %s: %s", tc.out, r.Outcome, r.Explanation)
			}
		})
	}
}
func TestGraphValidation(t *testing.T) {
	for _, tc := range []struct {
		name string
		edit func(*workflow.Definition)
	}{
		{"cycle", func(d *workflow.Definition) {
			d.Stages[1].Kind = "transform"
			d.Stages[1].Outcome = ""
			d.Edges = append(d.Edges, workflow.Edge{ID: "cycle", From: d.Stages[1].ID, To: d.Stages[0].ID})
		}},
		{"duplicate stage", func(d *workflow.Definition) { d.Stages[1].ID = d.Stages[0].ID }},
		{"duplicate edge", func(d *workflow.Definition) { d.Edges[1].ID = d.Edges[0].ID }},
		{"dangling edge", func(d *workflow.Definition) { d.Edges[0].To = "absent" }},
		{"invalid expression", func(d *workflow.Definition) { d.Edges[0].Condition = "input. >" }},
		{"invalid type", func(d *workflow.Definition) { d.InputSchema["value"] = workflow.Field{Type: "money"} }},
		{"invalid outcome", func(d *workflow.Definition) { d.Stages[1].Outcome = "EXECUTION_ERROR" }},
		{"multiple roots", func(d *workflow.Definition) { d.Edges = d.Edges[1:] }},
		{"terminal with outgoing edge", func(d *workflow.Definition) {
			d.Edges = append(d.Edges, workflow.Edge{ID: "bad", From: d.Stages[1].ID, To: d.Stages[2].ID})
		}},
		{"untyped output", func(d *workflow.Definition) { d.Stages[0].Expressions["extra"] = "true" }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			d := sample(t, "contract")
			tc.edit(&d)
			if workflow.Validate(d) == nil {
				t.Fatal("expected rejection")
			}
		})
	}
}
func TestTraceDeterministicAndInputUnchanged(t *testing.T) {
	d := sample(t, "contract")
	before, _ := json.Marshal(d)
	a := workflow.Run(d, d.ExampleInput)
	for n := 0; n < 30; n++ {
		b := workflow.Run(d, d.ExampleInput)
		if !reflect.DeepEqual(a, b) {
			t.Fatal("nondeterministic trace")
		}
	}
	after, _ := json.Marshal(d)
	if string(before) != string(after) {
		t.Fatal("policy or input mutated")
	}
	if len(a.Trace) != 2 || a.Trace[0].Outputs["compliant"] != true || len(a.Trace[0].Edges) != 3 {
		t.Fatalf("incomplete trace: %+v", a)
	}
}
func TestStageInputAndMissingOutput(t *testing.T) {
	d := sample(t, "contract")
	d.Stages[0].Inputs["extra"] = workflow.Field{Type: "string", Required: true}
	if r := workflow.Run(d, d.ExampleInput); r.Outcome != "UNKNOWN" {
		t.Fatal(r)
	}
	d = sample(t, "contract")
	d.Stages[0].Expressions["complete"] = "nil"
	if r := workflow.Run(d, d.ExampleInput); r.Outcome != "EXECUTION_ERROR" || !strings.Contains(r.Explanation, "Output contract") {
		t.Fatal(r)
	}
}

func TestMultipleStagesAndPriorTypedOutputs(t *testing.T) {
	d := sample(t, "contract")
	first := workflow.Stage{ID: "normalize", Name: "Normalize amount", Kind: "transform", Outputs: workflow.Schema{"amount": {Type: "number", Required: true}}, Expressions: map[string]string{"amount": "input.value / 1000"}, Explanation: "Convert amount to thousands."}
	d.Stages = append([]workflow.Stage{first}, d.Stages...)
	d.Edges = append(d.Edges, workflow.Edge{ID: "normalize-assess", From: "normalize", To: "assess"})
	d.Stages[1].Expressions["compliant"] = "input.hasSignature && input.hasLiabilityCap && stages.normalize.amount <= 50"
	r := workflow.Run(d, d.ExampleInput)
	if r.Outcome != "PASS" || len(r.Trace) != 3 || r.Trace[0].StageID != "normalize" {
		t.Fatalf("unexpected chained run: %+v", r)
	}
	d.ExampleInput["value"] = float64(51000)
	if r = workflow.Run(d, d.ExampleInput); r.Outcome != "FLAG" {
		t.Fatal(r)
	}
}
