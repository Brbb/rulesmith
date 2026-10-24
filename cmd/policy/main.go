package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"policy.studio/internal/studio"
	"policy.studio/pkg/workflow"
)

func main() {
	if len(os.Args) < 2 {
		fail("usage: policy serve | validate -policy FILE | run -policy FILE -input FILE (or - for stdin)")
	}
	switch os.Args[1] {
	case "serve":
		f := flag.NewFlagSet("serve", flag.ExitOnError)
		addr := f.String("addr", "127.0.0.1:8080", "listen address")
		_ = f.Parse(os.Args[2:])
		fmt.Println("Policy API listening on http://" + *addr)
		s := http.Server{Addr: *addr, Handler: studio.Handler(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 60 * time.Second, IdleTimeout: 60 * time.Second}
		if e := s.ListenAndServe(); e != nil {
			fail(e.Error())
		}
	case "validate", "run":
		f := flag.NewFlagSet(os.Args[1], flag.ExitOnError)
		p := f.String("policy", "", "workflow JSON")
		in := f.String("input", "-", "input JSON or stdin")
		_ = f.Parse(os.Args[2:])
		b, e := os.ReadFile(*p)
		if e != nil {
			fail(e.Error())
		}
		d, e := workflow.Decode(b)
		if e != nil {
			fail(e.Error())
		}
		if os.Args[1] == "validate" {
			if e = workflow.Validate(d); e != nil {
				fail(e.Error())
			}
			fmt.Println("Policy is valid")
			return
		}
		if *in == "-" {
			b, e = io.ReadAll(io.LimitReader(os.Stdin, 1<<20))
		} else {
			b, e = os.ReadFile(*in)
		}
		if e != nil {
			fail(e.Error())
		}
		var input map[string]any
		if e = json.Unmarshal(b, &input); e != nil {
			fail(e.Error())
		}
		result := workflow.Run(d, input)
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		_ = enc.Encode(result)
		if result.Outcome == "EXECUTION_ERROR" {
			os.Exit(2)
		}
	default:
		fail("unknown command")
	}
}
func fail(s string) { fmt.Fprintln(os.Stderr, s); os.Exit(1) }
