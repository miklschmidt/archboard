import { isMainModule } from "./runtime/engine/entry.js";
import application, { startServer } from "./server/canvas/index.js";

export { startServer };
export default application;

if (isMainModule(import.meta.url)) void startServer();
