import { createControlApp } from "./app";
import { readControlConfig } from "./config";

const config = readControlConfig();
const control = await createControlApp(config);
const server = control.app.listen(
  config.port,
  config.demo ? "127.0.0.1" : "0.0.0.0",
  () => {
    console.log(`Xenia multihotel disponible en ${config.origin}`);
  },
);
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  server.close(async () => {
    await control.close();
    process.exit(0);
  });
}
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
