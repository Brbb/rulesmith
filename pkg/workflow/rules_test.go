package workflow_test

import (
	"encoding/json"
	"strings"
	"testing"

	"policy.studio/pkg/workflow"
)

func TestExecutableSentencesAndSwitch(t *testing.T) {
	for _, tc := range []struct {
		name, out string
		edit      func(map[string]any)
	}{{"qualifies", "PASS", nil}, {"too young", "FLAG", func(i map[string]any) { i["age"] = float64(20) }}, {"income boundary", "FLAG", func(i map[string]any) { i["monthlyIncome"] = float64(4000) }}, {"missing evidence", "UNKNOWN", func(i map[string]any) { delete(i, "monthlyIncome") }}, {"bad type", "EXECUTION_ERROR", func(i map[string]any) { i["age"] = "25" }}} {
		t.Run(tc.name, func(t *testing.T) {
			d := sample(t, "eligibility")
			if tc.edit != nil {
				tc.edit(d.ExampleInput)
			}
			r := workflow.Run(d, d.ExampleInput)
			if r.Outcome != tc.out {
				t.Fatalf("want %s: %+v", tc.out, r)
			}
			if tc.out == "PASS" && (len(r.Trace) != 2 || r.Trace[0].Edges[0].Label != "Meets eligibility") {
				t.Fatalf("missing switch trace: %+v", r)
			}
		})
	}
}
func TestSwitchPriorityAndShortCircuit(t *testing.T) {
	d := sample(t, "eligibility")
	d.InputSchema["text"] = workflow.Field{Type: "string", Required: true}
	d.ExampleInput["text"] = "not-a-number"
	d.Edges = append(d.Edges, workflow.Edge{ID: "before-lexicographically", From: "eligibility", To: "review", Order: 2, Condition: "int(input.text) > 1"})
	r := workflow.Run(d, d.ExampleInput)
	if r.Outcome != "PASS" || len(r.Trace[0].Edges) != 1 {
		t.Fatalf("did not short circuit: %+v", r)
	}
	d.Edges[2].Order = 0
	r = workflow.Run(d, d.ExampleInput)
	if r.Outcome != "EXECUTION_ERROR" {
		t.Fatalf("priority was ignored: %+v", r)
	}
}
func TestSwitchFallbackRecordedOnlyAfterNoMatch(t *testing.T) {
	d := sample(t, "eligibility")
	d.ExampleInput["age"] = float64(19)
	r := workflow.Run(d, d.ExampleInput)
	edges := r.Trace[0].Edges
	if r.Outcome != "FLAG" || len(edges) != 2 || edges[0].Matched || !edges[1].Matched || edges[1].Condition != "otherwise" {
		t.Fatalf("bad fallback trace %+v", r)
	}
}
func TestRuleCompilerRejectsInvalidDefinitions(t *testing.T) {
	for _, tc := range []struct {
		name string
		edit func(*workflow.Definition)
	}{
		{"duplicate fallback", func(d *workflow.Definition) {
			d.Edges = append(d.Edges, workflow.Edge{ID: "fallback2", From: "eligibility", To: "review", Default: true})
		}},
		{"fallback with condition", func(d *workflow.Definition) { d.Edges[1].Condition = "true" }},
		{"two condition sources", func(d *workflow.Definition) { d.Edges[0].Condition = "true" }},
		{"unsafe field", func(d *workflow.Definition) { d.Edges[0].Rules.Clauses[0].Field = "input.age) || true" }},
		{"unknown operator", func(d *workflow.Definition) { d.Edges[0].Rules.Clauses[0].Operator = "eval" }},
		{"wrong scalar", func(d *workflow.Definition) { d.Edges[0].Rules.Clauses[0].Value = "21" }},
		{"no clauses", func(d *workflow.Definition) { d.Edges[0].Rules.Clauses = nil }},
		{"invalid group", func(d *workflow.Definition) { d.Edges[0].Rules.Match = "each" }},
		{"switch outputs", func(d *workflow.Definition) { d.Stages[0].Expressions = map[string]string{"x": "true"} }},
		{"fallback on evaluation", func(d *workflow.Definition) { d.Stages[0].Kind = "transform" }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			d := sample(t, "eligibility")
			tc.edit(&d)
			if workflow.Validate(d) == nil {
				t.Fatal("invalid rule accepted")
			}
		})
	}
}
func TestSentenceSerializationAndCompiler(t *testing.T) {
	d := sample(t, "eligibility")
	code, e := workflow.EdgeExpression(d.Edges[0])
	if e != nil || code != "(input.age >= 21) && (input.monthlyIncome > 4000)" {
		t.Fatalf("%s %v", code, e)
	}
	data, _ := json.Marshal(d)
	restored, e := workflow.Decode(data)
	if e != nil {
		t.Fatal(e)
	}
	if workflow.Run(restored, restored.ExampleInput).Outcome != "PASS" {
		t.Fatal("round trip failed")
	}
	group := workflow.RuleGroup{Match: "all", Clauses: []workflow.Clause{{Field: "input.name", Operator: "eq", Value: "a\"b"}, {Field: "input.optional", Operator: "exists"}}}
	code, e = workflow.RuleExpression(group)
	if e != nil || !strings.Contains(code, `a\"b`) {
		t.Fatalf("unsafe string %s %v", code, e)
	}
}
