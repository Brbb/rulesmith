package studio

import (
	"fmt"
	"net/http"
	"policy.studio/pkg/workflow"
)

type codeResult struct {
	Outputs map[string]any `json:"outputs,omitempty"`
	Error   string         `json:"error,omitempty"`
}

// This is a client-assisted preview, not a server-attested evaluation of JavaScript.
// Code source is portable data; this endpoint never runs it in the Go process.
func evaluateBrowser(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Policy      workflow.Definition   `json:"policy"`
		Input       map[string]any        `json:"input"`
		CodeResults map[string]codeResult `json:"codeResults"`
	}
	if err := decode(w, r, &req); err != nil {
		reply(w, 400, map[string]string{"error": err.Error()})
		return
	}
	if len(req.CodeResults) > 64 {
		reply(w, 400, map[string]string{"error": "Too many JavaScript results"})
		return
	}
	for id := range req.CodeResults {
		valid := false
		for _, stage := range req.Policy.Stages {
			if stage.ID == id && stage.Kind == "javascript" {
				valid = true
			}
		}
		if !valid {
			reply(w, 400, map[string]string{"error": "Result references a non-JavaScript stage"})
			return
		}
	}
	var pending any
	result := workflow.RunWithExecutor(req.Policy, req.Input, func(stage workflow.Stage, input, stages map[string]any) (map[string]any, error) {
		if result, ok := req.CodeResults[stage.ID]; ok {
			if result.Error != "" {
				return nil, fmt.Errorf("%s", result.Error)
			}
			if result.Outputs == nil {
				return nil, fmt.Errorf("Return a JSON object")
			}
			return result.Outputs, nil
		}
		pending = map[string]any{"stage": stage, "input": input, "stages": stages}
		return nil, fmt.Errorf("awaiting browser execution")
	})
	if pending != nil {
		reply(w, 200, map[string]any{"pending": pending})
		return
	}
	result.Runtime = "browser-assisted"
	reply(w, 200, map[string]any{"result": result})
}
