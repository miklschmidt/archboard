import { isMainModule } from "./runtime/engine/entry.js";
import { loadCanvasApplication } from "./server/canvas/index.js";

const application = await loadCanvasApplication(new URL(import.meta.url).search);

export const startServer = application.startServer;
export default application.default;

if (isMainModule(import.meta.url)) void startServer();
