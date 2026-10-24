import { executeSandbox } from "../lib/sandbox-core";
self.onmessage = async (
  event: MessageEvent<{
    source: string;
    input: Record<string, unknown>;
    stages: Record<string, unknown>;
    validateOnly?: boolean;
  }>,
) => {
  try {
    const { source, input, stages, validateOnly } = event.data;
    const outputs = await executeSandbox(source, input, stages, validateOnly);
    self.postMessage({ outputs });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error ? error.message : "JavaScript execution failed",
    });
  }
};
