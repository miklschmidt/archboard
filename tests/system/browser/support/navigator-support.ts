import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { PanesReport } from "../../../../src/runtime/engine/panes.ts";

type PanesBody = PanesReport & { success: boolean };
type HealthBody = { websocket_clients: number };
type ElementsBody = { elements: unknown[] };
type ChangesBody = { cursor: number };
const repoRoot = fileURLToPath(new URL("../../../..", import.meta.url));
const serverPath = join(repoRoot, "src/server.ts");

export { serverPath, type PanesBody, type HealthBody, type ElementsBody, type ChangesBody };
