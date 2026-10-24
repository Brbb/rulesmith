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
