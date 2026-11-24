import { createGatewayApp } from "./app.js";
import { loadGatewayConfig } from "./config.js";
import { createFacilitatorClient } from "./facilitator.js";
import { QuoteStore } from "./quoteStore.js";
import { HttpStudioClient } from "./studioClient.js";

async function main(): Promise<void> {
  const config = loadGatewayConfig(process.env);
  const app = createGatewayApp({
    config,
    facilitatorClient: await createFacilitatorClient(config),
    studio: new HttpStudioClient(config.STUDIO_SERVICE_URL, config.STUDIO_INTERNAL_TOKEN),
    quoteStore: new QuoteStore(),
  });
  app.listen(config.GATEWAY_PORT, () => {
    process.stdout.write(`selvedge paid gateway listening on ${config.GATEWAY_PORT}\n`);
  });
}

main().catch((caught: unknown) => {
  process.stderr.write(`${caught instanceof Error ? caught.stack : String(caught)}\n`);
  process.exit(1);
});
