package workflow

import "fmt"

// resolveRouting projects block-owned cases onto connections for the execution
// loop. Legacy edge predicates remain readable for CLI/API compatibility.
func resolveRouting(d Definition) (Definition, error) {
	d.Edges = append([]Edge(nil), d.Edges...)
	for _, stage := range d.Stages {
		router := stage.Kind == "switch" || stage.Kind == "if"
		if stage.Routing != "" && (!router || stage.Routing != "exclusive") {
			return d, fmt.Errorf("stage %s: unsupported routing mode", stage.ID)
		}
		if !router && len(stage.Cases) > 0 {
			return d, fmt.Errorf("stage %s: only IF and Switch own cases", stage.ID)
		}
		if stage.Kind == "if" && (len(stage.Cases) != 2 || stage.Routing != "") {
			return d, fmt.Errorf("IF %s needs exactly a true case and a false fallback", stage.ID)
		}
		if len(stage.Cases) == 0 {
			continue
		}
		seen := map[string]bool{}
		defaults := 0
		for _, item := range stage.Cases {
			if item.ID == "" || seen[item.ID] {
				return d, fmt.Errorf("stage %s: case IDs must be unique and nonempty", stage.ID)
			}
			seen[item.ID] = true
			if item.Default {
				defaults++
			}
			found := false
			for index, edge := range d.Edges {
				if edge.From != stage.ID || edge.ID != item.ID {
					continue
				}
				if edge.Condition != "" || edge.Rules != nil || edge.Default || edge.Order != 0 {
					return d, fmt.Errorf("connection %s duplicates its block's condition", edge.ID)
				}
				edge.Condition, edge.Rules, edge.Default, edge.Order, edge.Label = item.Condition, item.Rules, item.Default, item.Order, item.Label
				d.Edges[index] = edge
				found = true
			}
			if !found {
				return d, fmt.Errorf("stage %s: case %s needs a connection", stage.ID, item.ID)
			}
		}
		for _, edge := range d.Edges {
			if edge.From == stage.ID && !seen[edge.ID] {
				return d, fmt.Errorf("stage %s: connection %s needs a case", stage.ID, edge.ID)
			}
		}
		if stage.Kind == "if" && defaults != 1 {
			return d, fmt.Errorf("IF %s needs one false fallback", stage.ID)
		}
	}
	return d, nil
}
