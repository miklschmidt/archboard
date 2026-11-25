// Restarting the Archboard server on the source and the bundle that are on disk
// now. The server reads its TypeScript source once, at start (ADR 0021), and a
// browser tab loads the vite build in `dist/frontend` (ADR 0014), so a restart
// that picks up an edit must build that bundle between the stop and the start.
// The build is package.json's `build`, so the one place that says how
// to build stays there. A release builds nothing: it stops the server and starts it
// again, which is how a server runs the version that an install put on disk (ADR 0076).

import { installation } from "@archboard/workspace/installation";
import { bundleToServe } from "#runtime/services/frontend-bundle.ts";
import {
	type EnsureResult,
	ensureServerRunning,
	refuseUnstartableServer,
} from "#runtime/operations/spawn.ts";
import { type StopResult, stopServer } from "#runtime/operations/stop.ts";
import { silenceVersionWarning } from "#runtime/clients/server-client-transport.ts";

interface RestartResult extends EnsureResult {
	stop: StopResult;
	/** The entry script of the bundle that was built, as `/health` reports it. */
	frontendBuild: string | null;
}

/**
 * Stop the Archboard server, build the frontend and start the server. A
 * server that could not be started again is refused before it is stopped, and
 * a stop that is refused leaves the bundle unbuilt.
 * @returns The stop, the entry script of the new bundle and the started server.
 * @throws {Error} When the server may not be started or stopped, or
 * `FRONTEND_BUILD_FAILED` when the build fails after the stop.
 */
async function restartServer(): Promise<RestartResult> {
	silenceVersionWarning();
	refuseUnstartableServer();
	const stop = await stopServer();
	const built = await bundleToServe(installation().mode);
	const started = await ensureServerRunning({ force: true });
	return { ...started, stop, frontendBuild: built };
}

export { restartServer };
