package workflow

import (
	"fmt"
	"math"
	"sort"
	"strings"

	"github.com/expr-lang/expr"
)

// Validate checks graph structure and expression syntax before any execution.
func Validate(d Definition) error {
	var err error
	d, err = resolveRouting(d)
	if err != nil {
		return err
	}
	return validateResolved(d)
}
func validateResolved(d Definition) error {
	if d.Version != 1 {
		return fmt.Errorf("version must be 1")
	}
	if d.ID == "" || strings.TrimSpace(d.Name) == "" {
		return fmt.Errorf("policy id and name are required")
	}
	if len(d.Stages) == 0 || len(d.Stages) > 64 || len(d.Edges) > 256 {
		return fmt.Errorf("policy needs 1–64 stages and at most 256 edges")
	}
	if err := checkSchema(d.InputSchema); err != nil {
		return err
	}
	nodes := map[string]Stage{}
	indeg := map[string]int{}
	out := map[string][]string{}
	edgeIDs := map[string]bool{}
	for _, s := range d.Stages {
		if s.ID == "" || nodes[s.ID].ID != "" {
			return fmt.Errorf("stage IDs must be unique and nonempty: %q", s.ID)
		}
		nodes[s.ID] = s
		indeg[s.ID] = 0
		if s.Kind != "transform" && s.Kind != "decision" && s.Kind != "switch" && s.Kind != "javascript" && s.Kind != "if" {
			return fmt.Errorf("stage %s: kind must be transform, switch, if, javascript, or decision", s.ID)
		}
		if s.Kind == "javascript" {
			if strings.TrimSpace(s.Script) == "" || len(s.Script) > 16384 {
				return fmt.Errorf("stage %s: JavaScript needs 1–16384 bytes of source", s.ID)
			}
			if len(s.Expressions) > 0 {
				return fmt.Errorf("JavaScript stage %s cannot declare Expr expressions", s.ID)
			}
			if len(s.Outputs) == 0 {
				return fmt.Errorf("JavaScript stage %s needs a typed output contract", s.ID)
			}
		} else if s.Script != "" {
			return fmt.Errorf("stage %s: script is only valid on JavaScript stages", s.ID)
		}
		if s.Kind == "decision" && !terminal(s.Outcome) {
			return fmt.Errorf("stage %s: invalid terminal outcome", s.ID)
		}
		if (s.Kind == "decision" || s.Kind == "switch" || s.Kind == "if") && (len(s.Expressions) > 0 || len(s.Outputs) > 0) {
			return fmt.Errorf("%s %s cannot declare expressions or outputs", s.Kind, s.ID)
		}
		if err := checkSchema(s.Inputs); err != nil {
			return fmt.Errorf("stage %s: %w", s.ID, err)
		}
		if err := checkSchema(s.Outputs); err != nil {
			return fmt.Errorf("stage %s: %w", s.ID, err)
		}
		for _, k := range keys(s.Expressions) {
			v := s.Expressions[k]
			if _, ok := s.Outputs[k]; !ok {
				return fmt.Errorf("stage %s: output %s needs a type", s.ID, k)
			}
			if _, err := expr.Compile(v, expr.MaxNodes(2000)); err != nil {
				return fmt.Errorf("stage %s expression %s: %w", s.ID, k, err)
			}
		}
		for _, k := range keys(s.Outputs) {
			if _, ok := s.Expressions[k]; !ok && s.Kind != "javascript" && s.Kind != "if" {
				return fmt.Errorf("stage %s: output %s needs an expression", s.ID, k)
			}
		}
	}
	for _, e := range d.Edges {
		if e.ID == "" || edgeIDs[e.ID] {
			return fmt.Errorf("edge IDs must be unique and nonempty")
		}
		edgeIDs[e.ID] = true
		if nodes[e.From].ID == "" || nodes[e.To].ID == "" {
			return fmt.Errorf("edge %s references missing stage", e.ID)
		}
		if nodes[e.From].Kind == "decision" {
			return fmt.Errorf("terminal stage %s cannot have outgoing edges", e.From)
		}
		code, err := EdgeExpression(e)
		if err != nil {
			return fmt.Errorf("edge %s: %w", e.ID, err)
		}
		if e.Default && nodes[e.From].Kind != "switch" && nodes[e.From].Kind != "if" {
			return fmt.Errorf("fallback %s requires a switch stage", e.ID)
		}
		if strings.TrimSpace(code) != "" {
			if _, err := expr.Compile(code, expr.AsBool(), expr.MaxNodes(2000)); err != nil {
				return fmt.Errorf("edge %s: %w", e.ID, err)
			}
		}
		indeg[e.To]++
		out[e.From] = append(out[e.From], e.To)
	}
	roots := []string{}
	for id, n := range indeg {
		if n == 0 {
			roots = append(roots, id)
		}
	}
	if len(roots) != 1 {
		return fmt.Errorf("graph must have exactly one entry stage (found %d)", len(roots))
	}
	q := append([]string{}, roots...)
	count := 0
	for len(q) > 0 {
		id := q[0]
		q = q[1:]
		count++
		for _, to := range out[id] {
			indeg[to]--
			if indeg[to] == 0 {
				q = append(q, to)
			}
		}
	}
	if count != len(nodes) {
		return fmt.Errorf("graph contains a cycle or unreachable stages")
	}
	for _, s := range d.Stages {
		if s.Kind == "switch" || s.Kind == "if" {
			defaults := 0
			for _, edge := range d.Edges {
				if edge.From == s.ID && edge.Default {
					defaults++
				}
			}
			if defaults > 1 {
				return fmt.Errorf("switch %s has multiple fallbacks", s.ID)
			}
		}
		if s.Kind != "decision" && len(out[s.ID]) == 0 {
			return fmt.Errorf("stage %s needs an outgoing edge", s.ID)
		}
	}
	return nil
}
func checkSchema(s Schema) error {
	for _, k := range keys(s) {
		f := s[k]
		switch f.Type {
		case "string", "number", "boolean", "object", "array":
		default:
			return fmt.Errorf("field %s has unsupported type %q", k, f.Type)
		}
	}
	return nil
}
func keys[V any](m map[string]V) []string {
	r := make([]string, 0, len(m))
	for k := range m {
		r = append(r, k)
	}
	sort.Strings(r)
	return r
}
func checkValues(s Schema, v map[string]any) (missing, wrong []string) {
	for _, k := range keys(s) {
		f := s[k]
		x, ok := v[k]
		if !ok || x == nil {
			if f.Required {
				missing = append(missing, k)
			}
			continue
		}
		valid := false
		switch f.Type {
		case "string":
			_, valid = x.(string)
		case "boolean":
			_, valid = x.(bool)
		case "number":
			switch n := x.(type) {
			case float64:
				valid = !math.IsNaN(n) && !math.IsInf(n, 0)
			case float32:
				valid = !math.IsNaN(float64(n)) && !math.IsInf(float64(n), 0)
			case int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64:
				valid = true
			}
		case "object":
			_, valid = x.(map[string]any)
		case "array":
			_, valid = x.([]any)
		}
		if !valid {
			wrong = append(wrong, fmt.Sprintf("%s must be %s", k, f.Type))
		}
	}
	return
}
func evaluate(code string, env map[string]any, isBool bool) (any, error) {
	opts := []expr.Option{expr.Env(env), expr.MaxNodes(2000)}
	if isBool {
		opts = append(opts, expr.AsBool())
	}
	p, e := expr.Compile(code, opts...)
	if e != nil {
		return nil, e
	}
	return expr.Run(p, env)
}

// Run follows exactly one matching edge per stage. Ambiguous routing fails closed.
// Missing required data and unroutable inputs are UNKNOWN; invalid data or runtime failures are EXECUTION_ERROR.
func Run(d Definition, input map[string]any) Result {
	return RunWithExecutor(d, input, nil)
}

// StageExecutor supplies JSON outputs from an isolated JavaScript runtime.
// The caller owns isolation and resource limits. The Go runtime never evaluates JavaScript.
type StageExecutor func(Stage, map[string]any, map[string]any) (map[string]any, error)

func RunWithExecutor(d Definition, input map[string]any, execute StageExecutor) Result {
	r := Result{PolicyID: d.ID, Trace: []Trace{}}
	finish := func(out, msg string) Result { r.Outcome = out; r.Explanation = msg; return r }
	var routingErr error
	d, routingErr = resolveRouting(d)
	if routingErr != nil {
		return finish("EXECUTION_ERROR", routingErr.Error())
	}
	if err := validateResolved(d); err != nil {
		return finish("EXECUTION_ERROR", err.Error())
	}
	if missing, wrong := checkValues(d.InputSchema, input); len(wrong) > 0 {
		return finish("EXECUTION_ERROR", strings.Join(wrong, "; "))
	} else if len(missing) > 0 {
		return finish("UNKNOWN", "Missing required input: "+strings.Join(missing, ", "))
	}
	nodes := map[string]Stage{}
	indeg := map[string]int{}
	edges := map[string][]Edge{}
	for _, s := range d.Stages {
		nodes[s.ID] = s
	}
	for _, e := range d.Edges {
		indeg[e.To]++
		edges[e.From] = append(edges[e.From], e)
	}
	current := ""
	for _, s := range d.Stages {
		if indeg[s.ID] == 0 {
			current = s.ID
		}
	}
	outputs := map[string]any{}
	env := map[string]any{"input": input, "stages": outputs}
	for step := 0; step < len(d.Stages); step++ {
		s := nodes[current]
		t := Trace{StageID: s.ID, Name: s.Name, Status: "COMPLETED", Explanation: s.Explanation}
		if m, w := checkValues(s.Inputs, input); len(w) > 0 || len(m) > 0 {
			t.Status = "UNKNOWN"
			t.Explanation = "Stage input contract not satisfied: " + strings.Join(append(m, w...), ", ")
			r.Trace = append(r.Trace, t)
			if len(w) > 0 {
				r.Trace[len(r.Trace)-1].Status = "EXECUTION_ERROR"
				return finish("EXECUTION_ERROR", t.Explanation)
			}
			return finish("UNKNOWN", t.Explanation)
		}
		if s.Kind == "decision" {
			t.Status = s.Outcome
			r.Trace = append(r.Trace, t)
			return finish(s.Outcome, s.Explanation)
		}
		values := map[string]any{}
		if s.Kind == "javascript" {
			var err error
			if execute == nil {
				err = fmt.Errorf("JavaScript stages require the isolated browser executor")
			} else {
				values, err = execute(s, input, outputs)
			}
			if err != nil {
				t.Status = "EXECUTION_ERROR"
				t.Explanation = fmt.Sprintf("JavaScript stage %s: %v", s.ID, err)
				r.Trace = append(r.Trace, t)
				return finish("EXECUTION_ERROR", t.Explanation)
			}
		} else {
			for _, k := range keys(s.Expressions) {
				v, err := evaluate(s.Expressions[k], env, false)
				if err != nil {
					t.Status = "EXECUTION_ERROR"
					t.Explanation = fmt.Sprintf("%s.%s: %v", s.ID, k, err)
					r.Trace = append(r.Trace, t)
					return finish("EXECUTION_ERROR", t.Explanation)
				}
				values[k] = v
			}
		}
		if s.Kind == "javascript" {
			for _, key := range keys(values) {
				if _, ok := s.Outputs[key]; !ok {
					t.Status = "EXECUTION_ERROR"
					t.Explanation = "Undeclared JavaScript output: " + key
					r.Trace = append(r.Trace, t)
					return finish("EXECUTION_ERROR", t.Explanation)
				}
			}
		}
		if m, w := checkValues(s.Outputs, values); len(m)+len(w) > 0 {
			t.Status = "EXECUTION_ERROR"
			t.Explanation = "Output contract failed: " + strings.Join(append(m, w...), ", ")
			r.Trace = append(r.Trace, t)
			return finish("EXECUTION_ERROR", t.Explanation)
		}
		outputs[s.ID] = values
		t.Outputs = values
		matches := []Edge{}
		sorted := append([]Edge{}, edges[s.ID]...)
		sort.Slice(sorted, func(i, j int) bool {
			if s.Kind == "switch" || s.Kind == "if" {
				if sorted[i].Default != sorted[j].Default {
					return !sorted[i].Default
				}
				if sorted[i].Order != sorted[j].Order {
					return sorted[i].Order < sorted[j].Order
				}
			}
			return sorted[i].ID < sorted[j].ID
		})
		for _, e := range sorted {
			code, _ := EdgeExpression(e)
			ok := !e.Default || len(matches) == 0
			if strings.TrimSpace(code) != "" {
				v, err := evaluate(code, env, true)
				if err != nil {
					t.Status = "EXECUTION_ERROR"
					t.Explanation = fmt.Sprintf("Edge %s: %v", e.ID, err)
					r.Trace = append(r.Trace, t)
					return finish("EXECUTION_ERROR", t.Explanation)
				}
				ok = v.(bool)
			}
			traceCode := code
			if e.Default {
				traceCode = "otherwise"
			}
			t.Edges = append(t.Edges, EdgeTrace{EdgeID: e.ID, Condition: traceCode, Matched: ok, Label: e.Label})
			if ok {
				matches = append(matches, e)
				if (s.Kind == "switch" || s.Kind == "if") && s.Routing != "exclusive" {
					break
				}
			}
		}
		r.Trace = append(r.Trace, t)
		if len(matches) == 0 {
			return finish("UNKNOWN", "No matching route after "+s.Name)
		}
		if len(matches) > 1 {
			return finish("EXECUTION_ERROR", "Ambiguous routing after "+s.Name+": multiple edges matched")
		}
		current = matches[0].To
	}
	return finish("EXECUTION_ERROR", "Execution limit reached")
}
