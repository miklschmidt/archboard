// The frontend bundle a restarted server serves. A checkout builds it from its source with
// package.json's `build`, so the one place that says how to build stays there. A release never
// changes on disk except by an install, so it builds nothing (ADR 0076).

import { installation } from "@archboard/workspace/installation";
import { codedError } from "@archboard/diagnostics/thrown-error";
import { frontendBuild } from "#runtime/services/staleness.ts";

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
 * The frontend bundle the started server serves. A checkout builds it from its source. A release
 * never changes on disk except by an install (ADR 0076), so it builds nothing.
 * @param mode Whether this process runs a release or a checkout.
 * @returns The entry script of the bundle.
 * @throws {Error} `FRONTEND_BUILD_FAILED` when a checkout's build fails.
 */
async function bundleToServe(
	mode: ReturnType<typeof installation>["mode"],
): Promise<string | null> {
	return mode === "release" ? frontendBuild() : await buildFrontend();
}

export { bundleToServe };
