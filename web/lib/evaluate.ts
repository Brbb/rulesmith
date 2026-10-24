import { api, type Policy, type Run, type Stage } from "./types";
import { runJavaScript } from "./javascript";
export async function evaluatePolicy(
  policy: Policy,
  input: Record<string, unknown>,
): Promise<Run> {
  if (!policy.stages.some((stage) => stage.kind === "javascript"))
    return api<Run>("evaluate", { policy, input });
  const codeResults: Record<
    string,
    { outputs?: Record<string, unknown>; error?: string }
  > = Object.create(null);
  for (let step = 0; step <= policy.stages.length; step++) {
    const response = await api<{
      result?: Run;
      pending?: {
        stage: Stage;
        input: Record<string, unknown>;
        stages: Record<string, unknown>;
      };
    }>("evaluate-browser", { policy, input, codeResults });
    if (response.result) return response.result;
    if (
      !response.pending ||
      Object.hasOwn(codeResults, response.pending.stage.id)
    )
      throw new Error("Invalid browser execution continuation");
    const { stage, input: stageInput, stages } = response.pending;
    try {
      codeResults[stage.id] = {
        outputs: await runJavaScript(stage.script || "", stageInput, stages),
      };
    } catch (error) {
      codeResults[stage.id] = {
        error:
          error instanceof Error
            ? error.message
            : "JavaScript execution failed",
      };
    }
  }
  throw new Error("Browser execution exceeded the stage limit");
}
export async function validatePolicy(policy: Policy): Promise<void> {
  await api("validate", policy);
  for (const stage of policy.stages)
    if (stage.kind === "javascript") {
      try {
        await runJavaScript(stage.script || "", {}, {}, true);
      } catch (error) {
        throw new Error(`${stage.name}: ${(error as Error).message}`);
      }
    }
}
