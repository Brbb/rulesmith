// Package workflow provides a portable, deterministic policy runtime independent of any UI.
package workflow

import "encoding/json"

type Field struct {
	Type     string `json:"type"`
	Required bool   `json:"required,omitempty"`
	Label    string `json:"label,omitempty"`
}
type Schema map[string]Field
type RoutingCase struct {
	ID        string     `json:"id"`
	Label     string     `json:"label,omitempty"`
	Condition string     `json:"condition,omitempty"`
	Rules     *RuleGroup `json:"rules,omitempty"`
	Order     int        `json:"order,omitempty"`
	Default   bool       `json:"default,omitempty"`
}
type Stage struct {
	Cases       []RoutingCase     `json:"cases,omitempty"`
	Routing     string            `json:"routing,omitempty"`
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	Kind        string            `json:"kind"`             // transform, switch, if, javascript, or decision
	Inputs      Schema            `json:"inputs,omitempty"` // validated against the workflow input
	Outputs     Schema            `json:"outputs,omitempty"`
	Expressions map[string]string `json:"expressions,omitempty"`
	Script      string            `json:"script,omitempty"`
	Outcome     string            `json:"outcome,omitempty"`
	Explanation string            `json:"explanation,omitempty"`
}
type Edge struct {
	ID        string     `json:"id"`
	From      string     `json:"from"`
	To        string     `json:"to"`
	Condition string     `json:"condition,omitempty"`
	Label     string     `json:"label,omitempty"`
	Rules     *RuleGroup `json:"rules,omitempty"`
	Order     int        `json:"order,omitempty"`
	Default   bool       `json:"default,omitempty"`
}
type Definition struct {
	Version      int            `json:"version"`
	ID           string         `json:"id"`
	Name         string         `json:"name"`
	Description  string         `json:"description"`
	InputSchema  Schema         `json:"inputSchema"`
	Stages       []Stage        `json:"stages"`
	Edges        []Edge         `json:"edges"`
	ExampleInput map[string]any `json:"exampleInput,omitempty"`
}
type Trace struct {
	StageID     string         `json:"stageId"`
	Name        string         `json:"name"`
	Status      string         `json:"status"`
	Explanation string         `json:"explanation"`
	Outputs     map[string]any `json:"outputs,omitempty"`
	Edges       []EdgeTrace    `json:"edges,omitempty"`
}
type EdgeTrace struct {
	Label     string `json:"label,omitempty"`
	EdgeID    string `json:"edgeId"`
	Condition string `json:"condition"`
	Matched   bool   `json:"matched"`
}
type Result struct {
	Runtime     string  `json:"runtime,omitempty"`
	Outcome     string  `json:"outcome"`
	Explanation string  `json:"explanation"`
	Trace       []Trace `json:"trace"`
	PolicyID    string  `json:"policyId"`
}

func Decode(data []byte) (Definition, error) {
	var d Definition
	err := json.Unmarshal(data, &d)
	return d, err
}
func terminal(s string) bool { return s == "PASS" || s == "REJECT" || s == "FLAG" || s == "UNKNOWN" }
