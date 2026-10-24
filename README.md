<div align="center">

# Rulesmith

**Write policies in words. Shape them into workflows. Explain every decision.**

A local policy studio with conversational AI authoring, a visual editor, and a deterministic Go runtime.

Next.js · React Flow · Tailwind · Go · Expr · QuickJS

[Quick start](#quick-start) · [Product tour](#product-tour) · [Examples](#examples) · [Integration](#integrate-with-your-application) · [Technical guide](docs/guide.md)

</div>

![An executable applicant policy, edited directly as natural-language rules](docs/screenshots/policy-in-words.png)

Rulesmith brings the policy, its workflow, and its execution record into one workspace. Edit an underlined rule in plain language, inspect the same rule on the graph, then run it against JSON and see how the decision was reached. Definitions stay portable: the canvas is a view of your policy, not its file format.

**No database or API key required to get started.** A guided assistant demo works out of the box; configure an AI provider for open-ended authoring.

## Quick start

Requires **Go 1.24+**, **Node.js 20.9+**, npm, and Make.

Run these commands from the repository root, the directory containing `Makefile`:

```sh
make install
```

Start the backend and frontend in two terminals:

```sh
# Terminal 1 — Go API
make api
```

```sh
# Terminal 2 — web studio
make web
```

Open [127.0.0.1:3000](http://127.0.0.1:3000). The API runs at `127.0.0.1:8080`.

Start with **Document · Contract review** and click **Run**. In **Tests**, turn `hasSignature` off for a review decision, or `evidenceComplete` off for insufficient evidence. The form and JSON views edit the same payload.

## Product tour

### A policy you can read and edit

**Overview** presents the whole workflow as executable prose. Change underlined fields, operators, values, and destinations directly. Those edits update the graph, portable JSON, and runtime behavior together. Complex expressions remain available in the expression editor.

The left explorer organizes projects, nested folders, and workflow files. Each file keeps its own draft, tests, and conversation. Right-click to rename or move items; drag to reorganize; recover deleted items from Trash.

### A conversation that evolves the same draft

![AI assistant refining an eligibility policy while its workflow remains visible](docs/screenshots/ai-assistant.png)

Describe a policy, refine a threshold, add a requirement, and review the proposed revision before applying it. The assistant retains conversation context and a working draft. It can also execute policies, explain saved decisions, and replay the original policy and input.

Try this in the **AI** tab:

1. “Create an applicant eligibility policy.”
2. “At least 21 years old, monthly income over 4000, and an active account.”
3. “Raise the minimum age to 25. Keep the other requirements.”
4. Review the revision, **Apply revision**, then run a test.

Screenshots show the built-in **guided demo**, which supports selected examples without an API key. Connect an OpenAI-compatible provider for broader conversations; generated definitions still pass validation before review.

### Follow the workflow and the evidence

![Contract-review workflow, structured test payload, and execution explanation](docs/screenshots/workflow-execution.png)

Build horizontal flows using **Evaluation**, **IF**, **Switch**, **Code**, and **Decision** blocks. Conditions live inside routing blocks; arrows show readable case labels. The **+** connector adds a branch, including a choice of block when dropped onto empty canvas. Existing connections stay attached.

The right sidebar switches between **AI**, **Tests**, **Interface**, and **Blocks**. The bottom dock holds the selected block’s editor or the latest **Run trace**. Traces expose visited stages, typed outputs, evaluated conditions, explanations, and the final outcome. Field completion draws from the current test payload and available ancestor outputs.

| Outcome | Meaning |
| --- | --- |
| **PASS** | The policy explicitly approves. |
| **REJECT** | The policy explicitly rejects. |
| **FLAG** | The policy requests human review. |
| **UNKNOWN** | Required evidence is missing, or no route can decide. |
| **EXECUTION_ERROR** | A type, expression, output contract, or runtime failure prevented evaluation. |

Save regression cases with expected outcomes and run them together. Chat commands such as `/run`, `/runs FLAG`, `/audit`, and `/replay` make the same execution history available in conversation.

## Examples

| Example | What it demonstrates |
| --- | --- |
| [Contract review](examples/contract.json) | Structured evidence, value thresholds, approval, review, and insufficient evidence. |
| [Cold-chain monitor](examples/iot.json) | Temperature and freshness checks on supplied sensor data. |
| [Applicant eligibility](examples/eligibility.json) | Editable rule sentences, eligibility thresholds, and fallback review. |
| [IF routing](examples/if.json) | A single amount check with True/False destinations. |
| [Order total in JavaScript](examples/javascript.json) | Filtering line items, calculating a discount, and returning typed outputs. |

The studio includes the first three examples. Import the others using **Import policy JSON**; matching `*-input.json` fixtures are in [examples](examples).

## Add an AI provider

Export the following in the terminal that starts the Go API:

```sh
export AI_API_KEY='your-key'
export AI_BASE_URL='https://api.openai.com/v1'
export AI_MODEL='your-model-name'
make api
```

Use an OpenAI-compatible Chat Completions provider with JSON-object response support. The base URL is the API root; Rulesmith appends `/chat/completions`. Keys stay in the backend process. The provider receives the current policy, pending draft, conversation, test input, and relevant run context.

See [.env.example](.env.example) for configuration. The server does **not** automatically load `.env`; export variables before starting it. Provider failures are surfaced explicitly. AI helps author and explain policies; it does not decide the result of Expr execution.

## Integrate with your application

For document processing, your application owns the extraction step and calls Rulesmith with **structured JSON plus the complete workflow definition**:

```text
Your application → PDF/text extraction → structured evidence
                                               ↓
Exported workflow JSON ─────────────────→ Rulesmith API → outcome + explanation + trace
```

There is no server-side policy registry yet: saving a workflow in the studio saves it in that browser, not as a remotely callable policy ID. Export the definition and keep its version in your application. `POST /api/evaluate` is stateless and accepts `{policy, input}` on each call.

### JavaScript integration example

Start the API with `make api`, then run this dependency-free Node.js example from the repository root:

```sh
node examples/integrate.mjs
```

[examples/integrate.mjs](examples/integrate.mjs) loads the bundled contract definition and submits example evidence. Replace the definition with your exported workflow and `input` with the output of your own extraction pipeline:

```js
import { readFile } from "node:fs/promises";

// Use an exported workflow, or the bundled contract example.
const policy = JSON.parse(
  await readFile(new URL("./contract.json", import.meta.url), "utf8"),
);

// Your application supplies structured evidence after its own PDF/OCR extraction.
// These are example values, not data extracted by Rulesmith.
const input = {
  vendor: "Example Ltd",
  value: 72000,
  hasSignature: true,
  hasLiabilityCap: true,
  evidenceComplete: true,
};

const api = (process.env.POLICY_API_URL || "http://127.0.0.1:8080").replace(/\/$/, "");
const response = await fetch(`${api}/api/evaluate`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ policy, input }),
  signal: AbortSignal.timeout(10000),
});
if (!response.ok) {
  throw new Error(`Rulesmith HTTP ${response.status}: ${await response.text()}`);
}

// HTTP 200 includes policy rejection, missing evidence, and execution failures.
// Inspect outcome rather than treating response.ok as an approval.
const result = await response.json();
console.log(JSON.stringify(result, null, 2));
if (result.outcome === "EXECUTION_ERROR") process.exitCode = 2;
```

This example returns **FLAG** because 72,000 exceeds the contract's 50,000 limit. The response contains `outcome`, `explanation`, and `trace`. `POLICY_API_URL` can override the local API root. The same route is proxied through the studio at `http://127.0.0.1:3000/api/evaluate`.

Do not turn an extraction failure into `false`: “could not establish whether a signature exists” is different from “signature absent.” Preserve uncertainty in your extraction pipeline and map it to evidence fields your workflow explicitly checks. In this sample, set `evidenceComplete: false` when evidence is unresolved; omitting a required input also produces **UNKNOWN**.

The example uses an Expr-only workflow. The plain HTTP endpoint does not execute browser Code blocks; those need the studio's browser-assisted executor or a Go embedder's isolated executor. API requests are limited to **1 MiB**. The default API is for local use and has no authentication; see [the technical guide](docs/guide.md#http-api) for the full contract.

### Document and integration support

**(planned)** means the capability is not implemented. These are possible extensions, with no promised delivery date. Connecting an AI provider does not enable file ingestion by itself.

| Capability | Status | What happens today / intended extension |
| --- | --- | --- |
| Evaluate JSON through HTTP | **Available** | Send the full workflow and structured input to `POST /api/evaluate`; receive the outcome and trace. |
| Evaluate JSON without HTTP | **Available** | Use the Go CLI or embed `pkg/workflow` in your application. |
| Import an exported workflow JSON file | **Available** | Import it into the studio, review/edit it, and run it against the Tests payload. This imports rules, not a source document. |
| Enter test evidence in a form or JSON | **Available** | Add nested fields in Tests or paste JSON; save cases with expected outcomes. |
| Generate or refine rules from a natural-language description | **Available** | Use AI chat with a configured provider, then review and apply the draft. The no-key guided demo supports selected examples. |
| Extract a PDF externally, then evaluate its JSON | **Available through your application** | Your PDF parser, OCR service, or AI extraction tool produces evidence matching the workflow's input contract; the integration above evaluates it. |
| Run JavaScript transformations | **Available in the browser** | Code blocks run in the studio's isolated sandbox; the ordinary Go/HTTP runtime does not execute them. |
| Upload a PDF and run a workflow against it | **(planned)** | An integrated upload → extraction → evidence review → evaluation flow. No PDF upload/extraction UI exists today. |
| Send a PDF as an HTTP attachment | **(planned)** | A document-ingestion endpoint accepting multipart uploads or encoded file bytes. Current endpoints accept JSON contracts, not document attachments. |
| Send a remote PDF URL for processing | **(planned)** | A controlled document-fetching and extraction path. The API currently does not fetch URLs or interpret a URL string as a document. |
| Direct PDF processing with AI | **(planned)** | Extract evidence from document pages through a configured model; preserve uncertain fields for review. The current AI adapter sends policy/chat JSON, not PDF files. |
| Process scanned PDFs with built-in OCR | **(planned)** | OCR and page-layout extraction before producing structured evidence. Supply OCR results externally today. |
| Turn an uploaded policy PDF into executable rules | **(planned)** | Propose rules, exceptions, and input fields from a policy document, with human review before applying them. Use a text description in chat today. |
| Attach page citations and extraction confidence to a decision | **(planned)** | Link extracted fields and proposed rules to source passages. Current traces record evaluation, not document extraction provenance. |
| Run a saved policy by ID/version over HTTP | **(planned)** | A persistent policy registry and version lookup. Supply the complete definition in every request today. |
| Batch document uploads or asynchronous document jobs | **(planned)** | Queue documents, track extraction/evaluation progress, and retrieve results. Saved test cases can run JSON cases today; they are not a document-processing queue. |

## Run without the editor

```sh
go run ./cmd/policy validate -policy examples/contract.json
go run ./cmd/policy run \
  -policy examples/contract.json \
  -input examples/contract-input.json
```

The CLI returns JSON with the outcome, explanation, and full trace. All completed policy decisions, including **REJECT**, return exit code `0`; inspect `outcome`. Command errors return `1`, execution errors return `2`.

Embed [pkg/workflow](pkg/workflow) in a Go application using `workflow.Validate` and `workflow.Run`. Expr-only workflows run locally without React, HTTP, or an AI provider.

### How it fits together

```text
Policy in words ─┐
Visual workflow ─┼─→ Portable workflow JSON ─→ Go / Expr runtime ─→ Outcome + trace
JSON definition ─┘            ↑
                      Reviewed AI drafts
```

The definition owns typed inputs, outputs, stages, cases, and connections. React Flow positions are presentation state. The runtime traverses a deterministic DAG along one selected path; this MVP does not implement parallel execution or joins.

**Code blocks** run JavaScript in a fresh QuickJS WebAssembly VM inside a disposable browser worker. They have no DOM, network, storage, or host API access, and enforce time, memory, and JSON boundary limits. Code workflows use browser-assisted execution; the standard Go CLI fails closed at a Code stage unless an embedder supplies an executor. See [the sandbox and trust model](docs/guide.md#security-boundary-and-limits) before using that mode for enforcement.

## Development

```sh
make test   # Go race checks, TypeScript, frontend and sandbox tests
make build  # bin/policy and the production web build
```

To run the production web build, use `cd web && npm start` with the Go API still running.

| Directory | Purpose |
| --- | --- |
| [web](web) | Next.js studio, React Flow canvas, rule editors, and browser sandbox. |
| [pkg/workflow](pkg/workflow) | Reusable workflow model, validation, and execution engine. |
| [internal/studio](internal/studio) | HTTP API, AI adapter, and browser execution protocol. |
| [cmd/policy](cmd/policy) | CLI and API entry point. |
| [examples](examples) | Portable sample definitions and test inputs. |

[Read the technical guide](docs/guide.md) for schema semantics, HTTP endpoints, assistant commands, sandbox limits, and detailed editor behavior.

## MVP scope

Workspace files, chats, saved tests, and recent runs persist in **this browser**. Export workflow JSON to move a definition between environments. Local run history is for inspection and replay; it is not a tamper-resistant audit system.

The API binds to loopback and has no authentication or multi-user storage. Contract examples evaluate structured evidence rather than extracting PDFs; IoT examples evaluate JSON rather than connecting to devices. The project is intended for local authoring and evaluation, with production collaboration and external adapters left for future work.
