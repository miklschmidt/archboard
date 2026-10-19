import { join } from "node:path";

/**
 * The real server entry, started with the preload that points the server at the Codex stand-in
 * a test names. A server test spreads it into `startOwnedServer`.
 */
const productionServer = {
	serverPath: join(import.meta.dir, "../../../../apps/server/src/server.ts"),
	preload: join(import.meta.dir, "../fixtures/codex-production-preload.ts"),
} as const;

export { productionServer };
