// Restarting the Archboard server on the source and the bundle that are on disk
// now. The server reads its TypeScript source once, at start (ADR 0021), and a
// browser tab loads the vite build in `dist/frontend` (ADR 0014), so a restart
// that picks up an edit must build that bundle between the stop and the start.
// The build is package.json's `build`, so the one place that says how
// to build stays there.

import { SOURCE_CHECKOUT } from "@archboard/workspace/source-checkout";
import { frontendBuild } from "#runtime/services/staleness.ts";
import {
	type EnsureResult,
	ensureServerRunning,
	refuseUnstartableServer,
	type StopResult,
	stopServer,
} from "#runtime/operations/spawn.ts";
import { codedError } from "@archboard/diagnostics/thrown-error";

interface RestartResult extends EnsureResult {
	stop: StopResult;
	/** The entry script of the bundle that was built, as `/health` reports it. */
	frontendBuild: string | null;
}

/**
 * Build the frontend of the checkout whose source this process runs. The
 * build's own output is kept for a failure: a build that worked says nothing
 * that the entry script of its bundle does not.
 * @returns The entry script of the new bundle.
 * @throws {Error} `FRONTEND_BUILD_FAILED`, with the build's output, when the build fails.
 */
async function buildFrontend(): Promise<string | null> {
	const build = Bun.spawn([process.execPath, "run", "build"], {
		cwd: SOURCE_CHECKOUT,
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, exit] = await Promise.all([
		new Response(build.stdout).text(),
		new Response(build.stderr).text(),
		build.exited,
	]);
	if (exit !== 0) {
		throw codedError(
			`\`bun run build\` failed in ${SOURCE_CHECKOUT} (exit ${String(exit)}):\n${stdout}${stderr}\n` +
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
	refuseUnstartableServer();
	const stop = await stopServer();
	const built = await buildFrontend();
	const started = await ensureServerRunning({ force: true });
	return { ...started, stop, frontendBuild: built };
}

export { type RestartResult, restartServer };
