// Only this worker imports the WASM VM. User source never enters native eval/Function or HTML.
export function runJavaScript(
  source: string,
  input: Record<string, unknown>,
  stages: Record<string, unknown>,
  validateOnly = false,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../workers/javascript.worker.ts", import.meta.url),
      { type: "module" },
    );
    const timer = setTimeout(() => {
      worker.terminate();
      reject(
        new Error("JavaScript worker exceeded its 5 second wall-clock limit"),
      );
    }, 5000);
    function finish() {
      clearTimeout(timer);
      worker.terminate();
    }
    worker.onmessage = (event) => {
      finish();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.outputs);
    };
    worker.onerror = () => {
      finish();
      reject(new Error("JavaScript sandbox failed to initialize or execute"));
    };
    worker.postMessage({ source, input, stages, validateOnly });
  });
}
