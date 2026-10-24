# Rulesmith technical guide

A working local MVP for AI-assisted, explainable policy workflows. Next.js / React, shadcn-style source components with Radix Slot, Tailwind, Lucide, and React Flow; Go with Expr for a deterministic execution runtime. No database or API key is required.

## Run locally

Requires **Go 1.24+**, **Node.js 20.9+**, and npm. From the repository root (the directory containing `Makefile`):

```sh
make install
```

Start the API in one terminal:

```sh
make api
```

Start the studio in another:

```sh
make web
```

Open **http://127.0.0.1:3000**. The API binds to **127.0.0.1:8080**. `make build` produces `bin/policy` and a Next.js production build; start the latter with `cd web && npm start` while the API is running. The production build uses Next's webpack builder for compatibility with restricted local worker environments.

## Try the complete loop

1. Open the contract sample and click **Run**. The example passes.
2. In the right sidebar’s **Tests** tab, change `hasSignature` to `false`: **FLAG**. Set `evidenceComplete` to `false`: **UNKNOWN**. Remove required `value`: **UNKNOWN**. Supply `value` as a string: **EXECUTION_ERROR**.
3. Select a canvas stage to edit its name, expressions, output types, explanation, and routes. Drag handles to connect stages; use the **Blocks** tab to add IF, Evaluation, Switch, Code, or Decision stages. Ordinary stages have one unconditional next connection; routing blocks expose a connector per case. Every new transform must be connected and have an outgoing route before it can validate.
4. Use **Definition** to edit the entire portable JSON, including field schemas and additional output expressions; click **Validate & apply**. Unapplied JSON edits do not affect runs or saves.
5. Open the right sidebar’s **AI** tab and ask **Set the limit to 25000**. Review its complete JSON, then **Apply revision** and run again. Assistant drafts never apply automatically.
6. Switch to **Cold-chain monitor**. The example passes; temperature `9` flags; age `16` minutes is unknown.
7. **Save** validates and commits the active file in this browser. **Export** writes portable JSON; **Import** validates a JSON file and adds it to the active project. Draft definitions and test payloads are recovered automatically when switching files or reloading. Canvas positions are temporary presentation state.

## Studio layout and field completion

The left project explorer contains projects, folders, and workflow files. Separate **New workflow**, **New folder**, and **New project** icons have hover and keyboard-focus tooltips. New files go into the selected folder (or the active file’s folder); use its **Move to…** menu to move it. Projects and folders are local browser organization. There is one executable file type: a workflow that contains policy rules. Folders can nest at any depth. Right-click a file or folder (or use its **…** button) to rename, move, or delete it; folder menus also create workflows and subfolders. **F2** renames, **Delete** moves the selected item to Trash, and **Shift+F10** opens its menu. Drag files/folders onto another folder to move them, hover to expand a closed folder, or drop on **Project root** to move out of a folder. Moves reject cycles and name collisions. Deleting a folder includes its descendants; **Undo** and the persistent **Trash → Restore** recover the subtree and its existing file identities, drafts, payloads, tests, chats, and audit links. Empty projects remain empty after reload. Original generated Policies/Workflows categories consolidate into Workflows without changing file identities; custom folders are preserved. Each file retains its own draft, test payload, saved cases, and AI conversation. Existing single-policy saves and the active authoring conversation migrate into the local workspace.

The right sidebar has **AI**, **Tests**, **Interface**, and **Blocks** tabs. Blocks is a persistent palette for adding IF, Evaluation, Switch, Code, and Decision components. AI keeps the evolving conversation and composer. Tests defaults to an Interface-style field form with editable names, types and values. Add/remove fields and nested subfields, build arrays, toggle booleans, and switch to **JSON** to paste or edit raw data; both views share one payload. Duplicate field names and unfinished/nonfinite numbers block evaluation; malformed JSON stays intact until repaired. The same Form/JSON editor is available inside saved cases, and changing a case input marks its previous result stale. Tests supports up to 20 saved input/expected-outcome cases per file, including **Run all**. Results remain visible across tool-tab switches and are marked stale after policy changes. Interface edits the input contract, lists discovered input data fields and typed stage outputs, and exposes the latest result. Both sidebars can collapse; narrow screens use drawers.

Workflows remain horizontal. **IF** blocks carry the yellow IF badge and own one condition plus True/False destinations. **Switch** blocks own their ordered cases and optional fallback. Connections show plain text case labels; clicking a label opens the owning block. Added and reordered cases update their connectors immediately. The Switch’s + connector adds a branch. Dragging an occupied case connector also adds a separate branch and preserves its existing destination; change a destination explicitly in the case editor. A new Switch case starts unconnected: drag its connector to an existing block (its body or input connector), or onto empty canvas to choose a new Evaluation, IF, Switch, Code, or terminal decision. A Decision can return PASS, REJECT, FLAG, or UNKNOWN. Escape or clicking outside cancels the block picker without changing the workflow. Ordinary connections are unconditional. Selecting a block opens its editor in the minimizable bottom dock. The dock also has **Run trace**, including outputs, evaluated branches, explanations, and an **Explain** action that opens AI. Add components through the **Blocks** tab. Edit all routing conditions inside the IF or Switch editor; connections have no predicate editor. The center has **Overview**, **Workflow**, and **Definition** views under a compact document header.

Both condition and stage-expression editors autocomplete from the **current test payload**, including nested objects and representative array items (`input.items[0].sku`). Suggestions show types and sample values. Declared input fields remain available while payload JSON is invalid. Stage expressions suggest only ancestor outputs; routing cases can access outputs from preceding blocks. Type `input.` or `stages.`, or press **Ctrl/⌘ Space**, navigate with **↑/↓**, accept with **Enter/Tab**, and dismiss with **Escape**. Suggestions update immediately when the test payload changes; this is field completion, not full Expr language-server validation. Run the policy to validate expression behavior. Changing policy or test data marks existing traces as stale.

## Conversational policy authoring

The assistant keeps an evolving conversation and a pending policy draft. Every request includes the current workspace, the latest draft, and up to 40 prior user/assistant messages. A clarifying question or explanation does not clear the draft. Conversation history (up to 120 messages per file) and the pending draft are stored in this browser and restored after reload. Switching sidebar tabs or collapsing it does not cancel a request. **New chat** clears the local authoring conversation without changing the applied policy.

Try this sequence in the AI tab:

1. “Create an applicant eligibility policy.” The guided demo asks for the missing age and income requirements.
2. “At least 21 years old and monthly income over 4000.” It creates a switch and executable rule sentences.
3. “Make the minimum age 25.” The same draft keeps the income rule.
4. “Also require an active account.” The draft keeps both thresholds and adds the extra requirement.
5. Edit the rule sentences directly in the draft card, or continue refining by chat. **Apply revision** validates and updates the editor; **Save** persists the active policy. Applying a revision is separate from saving it.
6. Select the Switch block to edit its case sentence, change a value, and run the policy. The trace shows the generated Expr condition.

Without a key, this is explicitly a deterministic **guided demo**, not a general language model. It supports the eligibility conversation above (including threshold changes, active-account requirements, renaming, and “what if” questions), contract generation and limit edits, cold-chain generation, adding a switch to existing sample logic, and trace explanations. Unsupported or ambiguous requests keep the draft and explain the supported next steps. A configured provider enables open-ended authoring and follow-up reasoning.

For unrestricted natural-language generation and edits, configure an OpenAI-compatible **Chat Completions** provider in the Go API shell:

```sh
export AI_API_KEY='your-key'
export AI_BASE_URL='https://api.openai.com/v1'
export AI_MODEL='gpt-4.1-mini'
make api
```

`.env.example` documents these settings; Go does not automatically load `.env`. `AI_BASE_URL` is the API root, including `/v1` if needed; the server appends `/chat/completions`. The selected model/provider must support `response_format: {"type":"json_object"}`. Keys stay in the Go process. The provider receives the current policy, pending draft, recent conversation, current test input, prompt, and current run trace when relevant. Generated definitions are validated before being offered for review. Explanations from a provider are advisory; the deterministic trace remains the execution record. Provider errors are shown explicitly rather than silently replaced with demo results. No live paid provider was needed for local verification; conversation forwarding, pending-draft context, provider parsing, and invalid-draft rejection are tested with a mock server.

## Portable CLI and library

```sh
go run ./cmd/policy validate -policy examples/contract.json
go run ./cmd/policy run -policy examples/contract.json -input examples/contract-input.json
go run ./cmd/policy run -policy examples/iot.json -input examples/iot-input.json
go run ./cmd/policy run -policy examples/eligibility.json -input examples/eligibility-input.json
cat examples/contract-input.json | go run ./cmd/policy run -policy examples/contract.json -input -
go build -o bin/policy ./cmd/policy
```

The CLI emits a JSON outcome and complete trace. Exit codes: `0` for completed PASS/REJECT/FLAG/UNKNOWN evaluation, `1` for command/file/JSON errors, `2` for EXECUTION_ERROR. Consumers must inspect `outcome` to distinguish approval, rejection, review, or insufficient evidence.

`pkg/workflow` has no HTTP, React Flow, AI provider, or filesystem dependency. Import it from another Go program and call `workflow.Validate(definition)` and `workflow.Run(definition, input)`. It can be used as a local runtime without the web app.

## Execution contract

- `version: 1` definitions contain an input schema, stages, and connections. The JSON has no React Flow objects or coordinates. IF/Switch stages own a `cases` array with `id`, `label`, `order`, `default`, and either an Expr `condition` or structured `rules`. Each case ID matches its connection ID; that connection stores only `id`, `from`, and `to`. Original files with edge predicates remain accepted by the CLI/API for compatibility.
- The graph is a DAG with exactly one entry. This MVP deliberately follows **one selected path** through the DAG; it does not schedule parallel branches or implement join barriers.
- Stages are `transform` (pure Expr output expressions), `javascript` (isolated browser Code), `if` (one condition and True/False destinations), `switch` (ordered first-match routing), or `decision` (terminal PASS/REJECT/FLAG/UNKNOWN). Decisions cannot have outgoing routes or output expressions. Every nonterminal must have an outgoing edge. A switch cannot compute outputs; use an evaluation stage before it when values need to be computed.
- Supported field types: `string`, `number`, `boolean`, `object`, `array`; `required` controls presence. Schemas validate top-level fields; object/array members are not recursively typed. Extra input fields are allowed. Stage `inputs` are contracts against the original workflow input, not bindings from other stages.
- Expr scope: `input.FIELD` and `stages.STAGE_ID.OUTPUT`. Previous stage outputs are validated before being exposed downstream. Output expressions are evaluated in sorted field order, independently; sibling outputs in the same stage cannot reference one another. Unvisited stage outputs are unavailable.
- Ordinary connections always continue. IF checks its one condition and takes either its matching case or the false/default case. Switch cases run in ascending `order` (ID breaks ties), stop at the first match, and consider the optional single `default: true` case last. A fallback has no condition or rules. A nonmatching switch without fallback yields UNKNOWN. The editor migrates legacy edge predicates into block-owned cases. For predicates previously attached to an evaluation/Code block, it inserts a Switch with `routing: "exclusive"`, preserving the previous fail-closed behavior on overlapping matches. The Switch editor can explicitly change this to first-match mode. Computation IDs, case/connection IDs, destinations, and saved audit snapshots remain intact.
- A missing/null required input, incomplete declared evidence, or no matching route yields **UNKNOWN**. Wrong field types, output contract failures, Expr failures, and multiple matching routes yield **EXECUTION_ERROR**. **REJECT** is an explicit negative decision; **FLAG** means a valid policy explicitly selected human review; it is not an execution failure.
- Trace entries record visited stages, validated outputs, tested edge conditions and results, terminal decisions, and errors. Skipped stages do not appear. Identical policies and inputs produce identical traces; there are no timestamps or random IDs in runtime results.
- Limits: 64 stages, 256 edges, 1 MiB API request bodies. Expr is a pure expression runtime with its own allocation limits; this is a local authoring tool, not a hardened service for arbitrary hostile policies.

Expr syntax: [official language definition](https://expr-lang.org/docs/language-definition). Canvas integration: [React Flow documentation](https://reactflow.dev/learn).

## Executable rule sentences

A routing case can use `rules: {match: "all" | "any", clauses: [{field, operator, value?}]}`. Operators are `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, and `exists`. Field paths are restricted to safe `input` / `stages` references; values are scalar, and numeric comparisons require numbers. Each group has 1–16 clauses. Input schema fields can have a display `label`.

The sentence UI and Expr code are derived from the same group. The backend rejects a case that supplies both `rules` and `condition`. **Use expression** converts a sentence to its generated Expr; **Use sentences** can recover the simple comparison/boolean subset. Complex Expr remains in advanced mode rather than being guessed at. Explicitly replacing a complex expression with a new sentence is a separate action.

## HTTP API

All endpoints return JSON. Next.js proxies `/api/*` to the local Go process; set `POLICY_API_URL` in the web environment to change the destination (restart/rebuild after changing).

| Method | Path | Body / response |
|---|---|---|
| GET | `/api/health` | `{ok, aiMode}` |
| GET | `/api/samples` | Bundled definitions with example inputs |
| POST | `/api/validate` | Definition → `{valid:true}` or 422 error |
| POST | `/api/evaluate` | `{policy, input}` → outcome, explanation, trace |
| POST | `/api/assistant` | `{prompt, policy, draft?, history?, input?, run?}` → `{mode, message, changes?, questions?, policy?}` |

Malformed JSON returns 400. Evaluate returns HTTP 200 for all five outcome types; inspect `outcome`. Assistant provider failures return 502, and invalid provider drafts return 422. The API is intended for loopback use and has no authentication, external connectors, or durable server-side storage.

## Tests and verification

```sh
make test
make build
```

Tests cover sample thresholds, all five outcomes, missing/wrong data, expression failures, output contracts, ambiguous/no routes, switch priority and short-circuiting, fallbacks, structured rule validation, multi-turn draft refinement, cycles, duplicate/dangling IDs, deterministic traces, no input mutation, HTTP requests, demo edits, provider responses, and invalid AI drafts. `go test -race ./...` checks concurrent use. Frontend tests cover nested/array payload discovery, safe field accessors, invalid-JSON fallback, caret replacement, suggestion filtering, ancestor scope, cycle-safe editing, numeric-literal behavior, readable rule compilation, branch labels, and safe conversion of simple legacy conditions. TypeScript and the production build check the frontend. If your execution environment restricts Go's normal cache, use `GOCACHE=/tmp/policy-go-cache go test -race ./...`.

## Scope

The document sample evaluates **structured evidence**; it does not perform PDF/OCR extraction or imply that a document was verified. The IoT sample evaluates supplied JSON; it does not connect to MQTT. Database, S3, MQTT adapters, agent execution inside stages, authentication, multi-user versioning, and parallel fan-out are future additions. AI is used for authoring and explanations; policy execution is deterministic.

Source map: `pkg/workflow` runtime; `cmd/policy` CLI/API entry point; `internal/studio` HTTP and assistant; `examples` portable fixtures; `web` studio. Canonical sample files live in `examples`; the three policy JSON files are copied into `internal/studio/samples` for embedding in the CLI binary. Update both when changing bundled examples; a test checks they stay in sync.

### Chat execution and local audit history

The chat starts empty; hover or focus the information icon for authoring guidance. Type `/` in the composer to discover commands and templates:

- `/eligibility`, `/contract`, `/iot`: start a guided policy draft.
- `/run`: execute the working draft (if present) or the current editor policy with the Test payload. `/run {"age": 20}` supplies a complete replacement input for that execution.
- `/runs [query]`: find saved runs by outcome, policy name, or ID (for example `/runs FLAG`).
- `/audit [ID]` or `/explain [ID]`: inspect a saved decision. Omit the ID for the latest run.
- `/replay [ID]`: execute that run’s original policy snapshot and input again, recording a new run linked to the original.
- `/help`: command reference. “Run this policy,” “show recent runs,” and “explain the last run” also work without an AI key.

Run cards offer **Details** for inputs, stage outputs, evaluated branches, and the saved policy, or **Code** for the complete JSON record. The latest 50 runs are stored in this browser, including runs started from the main Run button. These are local inspection records, not a durable or tamper-resistant production audit service. A new conversation preserves run history. Replays call the deterministic Go evaluator; they never silently substitute the current editor policy for the saved snapshot.

Canvas blocks show only their icon and stage label. A completed run subtly colors visited icons; hover a block for its stage type and status. IF blocks carry a yellow **IF** badge. Select IF or Switch to edit its conditions, then switch between **Natural language** and **Form**; only one representation appears at a time. The working draft’s rule details and complete definition are available through **Details** and **Code**.

### Whole-policy authoring

The editor has **Overview**, **Workflow**, and **Definition** tabs, with Workflow selected initially. Overview presents every stage’s routing rules as editable prose, plus the input contract, computed fields, and terminal decisions. Underlined fields, comparison operators, values, AND/OR joins, and destinations edit the executable definition directly; terminal outcomes are editable alongside their explanations. The graph, condition inspector, JSON definition, and runtime share those changes. Save policy to persist them in this browser.

Switch cases retain their execution priority and explicit otherwise route. Evaluation stages show independent routes and their exactly-one-match semantics. Shared downstream stages appear once, after their predecessors. Complex expressions remain exact and open in the expression inspector rather than being guessed into prose. Small arrows open stage or route details in the bottom dock while keeping the whole-policy view visible. When a current run exists, the matching routes are subtly marked.

## Isolated browser JavaScript stages

Use **Blocks → Code**. The block is inserted before the selected stage with its incoming routes rewired, so the graph stays connected. Select it to edit the function body and its typed output contract in the bottom dock. **Test code** uses the current Tests payload and, when a current run exists, the outputs of its ancestor stages. **Run**, saved regression cases, chat `/run`, and replay all use the same executor.

A function receives `input` (the original JSON payload) and `stages` (already-completed stage outputs). Return a plain object containing the declared outputs. Mutating the local input copy does not change the workflow’s original input. Later conditions and stages access returned values through `stages.STAGE_ID.OUTPUT_NAME`.

```js
const total = input.items
  .filter(item => item.quantity > 0)
  .reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
return { total };
```

Declare `total` as a required number. [examples/javascript.json](../examples/javascript.json) includes filtering, line totals, a VIP discount, typed array outputs, and approval/review routes; its example input yields **35.1**, two retained lines, and **PASS**. Import it through the editor to try it. Import the JSON definition to add it to the browser workspace.

### Security boundary and limits

User code runs in a fresh **QuickJS WebAssembly VM inside a disposable Web Worker**, using the bundled [QuickJS browser variant](https://github.com/justjake/quickjs-emscripten/tree/main/packages/quickjs-emscripten-core). Source is never passed to native browser `eval`, `Function`, HTML, or a script element. No host functions or application objects are installed in the guest VM. DOM, cookies, storage, fetch, sockets, workers, Node APIs, and application state are unavailable. The embedded WASM is bundled locally; it does not load an engine from a CDN.

Each function has a **100 ms interpreter interrupt budget**, an **8 MiB guest heap limit**, a **256 KiB guest stack limit**, and a **5 second outer worker deadline** that also covers VM startup and built-ins that may not yield to the interpreter interrupt. A worker is terminated after every result or failure. These bound the guest runtime, rather than promising a fixed total browser-process memory footprint. Date/time and randomness are disabled. There are no imports or asynchronous host services; returned promises are rejected.

Only JSON crosses the boundary: at most 16 KiB of source, 128 KiB of input plus ancestor context, and 64 KiB of output, with bounded nesting and collection size. Cycles, accessors, functions, undefined values, non-finite numbers, non-plain objects, sparse/oversized arrays, and prototype-related keys are rejected. Captured serialization intrinsics prevent guest changes to `JSON.stringify` from replacing the serializer. React renders source and output as text; HTML-like strings remain inert data. Every returned field must have an output declaration. Missing or mistyped outputs, source errors, sandbox failures, and timeouts become **EXECUTION_ERROR** on the code stage; downstream decisions do not run.

The Go engine **never executes JavaScript**. `/api/evaluate-browser` reconstructs routing from the definition and original input, requests one reachable code stage at a time, and validates browser-supplied outputs before proceeding. Results are marked `runtime: "browser-assisted"`. This is a local preview protocol; a modified client can forge its reported outputs, so it is not a server-attested enforcement service.

The normal Go/CLI runtime fails closed when it reaches a JavaScript stage. CLI `validate` checks the graph, source presence/size, and contracts; browser Save/Apply also syntax-checks the body without executing it. Go embedders can use `workflow.RunWithExecutor` to supply their own isolated executor. Existing Expr-only workflows remain fully usable in the Go CLI/runtime.

`npm test --prefix web` includes adversarial tests against the same WASM variant: absent host capabilities and constructor escapes, prototype pollution, inert HTML, loops, recursion, heap/output limits, captured intrinsics, fresh VM state, and unsupported outputs. Go tests cover continuation, typed contracts, failure propagation, and the normal endpoint’s refusal to execute JavaScript.

### IF example

Import `examples/if.json` to try a block-owned amount check, or run it locally with `./bin/policy run -policy examples/if.json -input examples/if-input.json`. The sample returns PASS for 500 and FLAG above 1000.
