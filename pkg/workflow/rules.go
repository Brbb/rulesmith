package workflow

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

// RuleGroup is an executable sentence, not a separate description of an expression.
// Edges use either Rules or Condition so their natural and developer views cannot drift.
type Clause struct {
	Field    string `json:"field"`
	Operator string `json:"operator"`
	Value    any    `json:"value,omitempty"`
}
type RuleGroup struct {
	Match   string   `json:"match"`
	Clauses []Clause `json:"clauses"`
}

var fieldPath = regexp.MustCompile(`^(input|stages)(\.[A-Za-z_$][A-Za-z0-9_$]*|\[([0-9]+|"([^"\\]|\\.)*")\])+$`)

func RuleExpression(group RuleGroup) (string, error) {
	if group.Match != "all" && group.Match != "any" {
		return "", fmt.Errorf("rule match must be all or any")
	}
	if len(group.Clauses) == 0 || len(group.Clauses) > 16 {
		return "", fmt.Errorf("rule group needs 1–16 clauses")
	}
	parts := []string{}
	for _, c := range group.Clauses {
		if !fieldPath.MatchString(c.Field) {
			return "", fmt.Errorf("invalid rule field %q", c.Field)
		}
		if c.Operator == "exists" {
			parts = append(parts, "("+c.Field+" != nil)")
			continue
		}
		operator := map[string]string{"eq": "==", "neq": "!=", "gt": ">", "gte": ">=", "lt": "<", "lte": "<=", "contains": "contains"}[c.Operator]
		if operator == "" {
			return "", fmt.Errorf("unsupported rule operator %q", c.Operator)
		}
		switch c.Value.(type) {
		case string, bool, float64, float32, int, int64, nil:
		default:
			return "", fmt.Errorf("rule values must be scalar")
		}
		if c.Operator == "gt" || c.Operator == "gte" || c.Operator == "lt" || c.Operator == "lte" {
			switch c.Value.(type) {
			case float64, float32, int, int64:
			default:
				return "", fmt.Errorf("comparison %s needs a numeric value", c.Operator)
			}
		}
		if c.Operator == "contains" {
			if _, ok := c.Value.(string); !ok {
				return "", fmt.Errorf("contains needs a string value")
			}
		}
		value, err := json.Marshal(c.Value)
		if err != nil {
			return "", err
		}
		literal := string(value)
		if c.Value == nil {
			literal = "nil"
		}
		parts = append(parts, "("+c.Field+" "+operator+" "+literal+")")
	}
	join := " && "
	if group.Match == "any" {
		join = " || "
	}
	return strings.Join(parts, join), nil
}
func EdgeExpression(edge Edge) (string, error) {
	if edge.Default {
		if edge.Rules != nil || strings.TrimSpace(edge.Condition) != "" {
			return "", fmt.Errorf("fallback cannot also declare a condition")
		}
		return "", nil
	}
	if edge.Rules != nil {
		if strings.TrimSpace(edge.Condition) != "" {
			return "", fmt.Errorf("use rules or condition, not both")
		}
		return RuleExpression(*edge.Rules)
	}
	return edge.Condition, nil
}
