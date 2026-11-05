// Restarting the Archboard server on the source and the bundle that are on disk
// now. The server reads its TypeScript source once, at start (ADR 0021), and a
// browser tab loads the vite build in `dist/frontend` (ADR 0014), so a restart
// that picks up an edit must build that bundle between the stop and the start.
// The build is package.json's `build`, so the one place that says how
// to build stays there. A release builds nothing: it stops the server and starts it
// again, which is how a server runs the version that an install put on disk (ADR 0075).

import { installation } from "@archboard/workspace/installation";
import { frontendBuild } from "#runtime/services/staleness.ts";
import {
	type EnsureResult,
	ensureServerRunning,
	refuseUnstartableServer,
} from "#runtime/operations/spawn.ts";
import { type StopResult, stopServer } from "#runtime/operations/stop.ts";
import { silenceVersionWarning } from "#runtime/clients/server-client-transport.ts";
import { codedError } from "@archboard/diagnostics/thrown-error";

interface RestartResult extends EnsureResult {
	stop: StopResult;
	/** The entry script of the bundle that was built, as `/health` reports it. */
	frontendBuild: string | null;
}

/**
 * Build the frontend of the checkout whose source this process runs. The
 * build prints its progress to stderr as it runs, so that a slow core build
 * is visible, and stdout keeps only the answer of the command.
 * @returns The entry script of the new bundle.
 * @throws {Error} `FRONTEND_BUILD_FAILED` when the build fails. Its errors are already on stderr.
 */
async function buildFrontend(): Promise<string | null> {
	const build = Bun.spawn([process.execPath, "run", "build"], {
		cwd: installation().root,
		stdin: "ignore",
		stdout: 2,
		stderr: "inherit",
	});
	const exit = await build.exited;
	if (exit !== 0) {
		throw codedError(
			`\`bun run build\` failed in ${installation().root} (exit ${String(exit)}). Its output is above.\n` +
				"The Archboard server is stopped. Fix the build, then run `archboard restart` again.",
			"FRONTEND_BUILD_FAILED",
		);
	}
	return frontendBuild();
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

/**
 * The frontend bundle the started server serves. A checkout builds it from its source. A release
 * never changes on disk except by an install (ADR 0075), so it builds nothing.
 * @param mode Whether this process runs a release or a checkout.
 * @returns The entry script of the bundle.
 * @throws {Error} `FRONTEND_BUILD_FAILED` when a checkout's build fails.
 */
async function bundleToServe(
	mode: ReturnType<typeof installation>["mode"],
): Promise<string | null> {
	return mode === "release" ? frontendBuild() : await buildFrontend();
}

export { bundleToServe, restartServer };
