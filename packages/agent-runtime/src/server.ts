import { createRuntimeApp } from "./runtimeApp.js";

const DEFAULT_RUNTIME_PORT = 8730;

const containmentLogPath = process.env.CONTAINMENT_LOG_PATH;
if (containmentLogPath === undefined || containmentLogPath === "") {
  process.stderr.write("CONTAINMENT_LOG_PATH must point to the JSON lines file written by the runtime\n");
  process.exit(1);
}
const port = Number(process.env.RUNTIME_PORT ?? DEFAULT_RUNTIME_PORT);
createRuntimeApp({ containmentLogPath }).listen(port, () => {
  process.stdout.write(`selvedge agent runtime listening on ${port}\n`);
});
