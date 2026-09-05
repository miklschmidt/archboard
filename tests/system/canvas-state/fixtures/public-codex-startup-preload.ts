import { mock } from "bun:test";
import { resolve } from "node:path";

const modulePath = resolve(import.meta.dir, "../../../../src/runtime/codex-process/executable.ts");
const actual = await import(modulePath);
const executable = process.env["ARCHBOARD_TEST_PUBLIC_CODEX_EXECUTABLE"];
if (executable !== undefined) {
	await Promise.resolve(
		mock.module(modulePath, () => ({
			...actual,
			resolveProjectCodexExecutable: () => executable,
			verifyCodexExecutable:
				process.env["ARCHBOARD_TEST_PUBLIC_CODEX_PROOF_FAILURE"] === "verification_timeout"
					? () => {
							throw new actual.CodexExecutableError({
								code: "verification_timeout",
								executablePath: executable,
								message:
									"Codex codex-cli 0.151.0 did not answer the bounded --version proof. Run bun install to restore the exact package-local runtime, then retry.",
							});
						}
					: actual.verifyCodexExecutable,
		})),
	);
}

const shutdownDelayMs = Number(process.env["ARCHBOARD_TEST_PUBLIC_SHUTDOWN_DELAY_MS"] ?? "0");
const shutdownFailure = process.env["ARCHBOARD_TEST_PUBLIC_SHUTDOWN_FAILURE"] === "always";
if (
	process.env["ARCHBOARD_STARTUP_TERMINAL_FD"] !== undefined &&
	((Number.isFinite(shutdownDelayMs) && shutdownDelayMs > 0) || shutdownFailure)
) {
	const applicationPath = resolve(
		import.meta.dir,
		"../../../../src/server/canvas/lib/codex-workbench-application.ts",
	);
	const actualApplicationModule = await import(applicationPath);
	const createApplication = actualApplicationModule.createCanvasCodexWorkbenchApplication;
	await Promise.resolve(
		mock.module(applicationPath, () => ({
			...actualApplicationModule,
			createCanvasCodexWorkbenchApplication: (...args: Parameters<typeof createApplication>) => {
				const application = createApplication(...args);
				let delay: Promise<void> | null = null;
				return {
					...application,
					shutdown: () => {
						if (shutdownFailure)
							return Promise.reject(new Error("injected workbench cleanup failure"));
						delay ??= Bun.sleep(shutdownDelayMs);
						return delay.then(application.shutdown);
					},
				};
			},
		})),
	);
}

const readinessTimeoutMs = Number(process.env["ARCHBOARD_TEST_PUBLIC_READINESS_TIMEOUT_MS"] ?? "0");
if (Number.isFinite(readinessTimeoutMs) && readinessTimeoutMs > 0) {
	const timingPath = resolve(import.meta.dir, "../../../../src/shared/timing/timing.ts");
	const actualTiming = await import(timingPath);
	await Promise.resolve(
		mock.module(timingPath, () => ({
			...actualTiming,
			CANVAS_STARTUP_READINESS_MS: readinessTimeoutMs,
		})),
	);
}

const cleanupDeadlineMs = Number(process.env["ARCHBOARD_TEST_PUBLIC_CLEANUP_DEADLINE_MS"] ?? "0");
const cleanupGraceMs = Number(process.env["ARCHBOARD_TEST_PUBLIC_CLEANUP_GRACE_MS"] ?? "0");
if (
	Number.isFinite(cleanupDeadlineMs) &&
	cleanupDeadlineMs > 0 &&
	Number.isFinite(cleanupGraceMs) &&
	cleanupGraceMs >= 0 &&
	cleanupGraceMs <= cleanupDeadlineMs
) {
	const cleanupPath = resolve(
		import.meta.dir,
		"../../../../src/runtime/engine/canvas-startup-cleanup.ts",
	);
	const actualCleanup = await import(cleanupPath);
	await Promise.resolve(
		mock.module(cleanupPath, () => ({
			...actualCleanup,
			failedCanvasCleanupTiming: () => ({
				shutdownDeadlineMs: cleanupDeadlineMs,
				applicationGraceMs: cleanupGraceMs,
				pollMs: 5,
			}),
		})),
	);
}
