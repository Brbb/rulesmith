package studio

import (
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"

	"policy.studio/pkg/workflow"
)

//go:embed samples/*.json
var samples embed.FS

func Samples() []workflow.Definition {
	var result []workflow.Definition
	for _, name := range []string{"contract", "iot", "eligibility"} {
		b, _ := samples.ReadFile("samples/" + name + ".json")
		d, _ := workflow.Decode(b)
		result = append(result, d)
	}
	return result
}
func reply(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func decode(w http.ResponseWriter, r *http.Request, v any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if e := d.Decode(v); e != nil {
		return e
	}
	if d.Decode(new(any)) != io.EOF {
		return fmt.Errorf("expected one JSON object")
	}
	return nil
}
func Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		reply(w, 200, map[string]any{"ok": true, "aiMode": aiMode()})
	})
	mux.HandleFunc("GET /api/samples", func(w http.ResponseWriter, r *http.Request) { reply(w, 200, Samples()) })
	mux.HandleFunc("POST /api/validate", func(w http.ResponseWriter, r *http.Request) {
		var d workflow.Definition
		if e := decode(w, r, &d); e != nil {
			reply(w, 400, map[string]string{"error": e.Error()})
			return
		}
		if e := workflow.Validate(d); e != nil {
			reply(w, 422, map[string]string{"error": e.Error()})
			return
		}
		reply(w, 200, map[string]bool{"valid": true})
	})
	mux.HandleFunc("POST /api/evaluate", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Policy workflow.Definition `json:"policy"`
			Input  map[string]any      `json:"input"`
		}
		if e := decode(w, r, &req); e != nil {
			reply(w, 400, map[string]string{"error": e.Error()})
			return
		}
		reply(w, 200, workflow.Run(req.Policy, req.Input))
	})
	mux.HandleFunc("POST /api/evaluate-browser", evaluateBrowser)
	mux.HandleFunc("POST /api/assistant", assistant)
	return mux
}
func aiMode() string {
	if os.Getenv("AI_API_KEY") == "" {
		return "demo"
	}
	return "provider"
}
