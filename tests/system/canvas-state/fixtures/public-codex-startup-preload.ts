import { mock } from "bun:test";
import { resolve } from "node:path";

const modulePath = resolve(import.meta.dir, "../../../../src/runtime/codex-process/executable.ts");
const actual = await import(modulePath);
const executable = process.env.ARCHBOARD_TEST_PUBLIC_CODEX_EXECUTABLE;
if (executable !== undefined) {
	await Promise.resolve(
		mock.module(modulePath, () => ({
			...actual,
			resolveProjectCodexExecutable: () => executable,
			verifyCodexExecutable:
				process.env.ARCHBOARD_TEST_PUBLIC_CODEX_PROOF_FAILURE === "verification_timeout"
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

const shutdownDelayMs = Number(process.env.ARCHBOARD_TEST_PUBLIC_SHUTDOWN_DELAY_MS ?? "0");
if (
	process.env.ARCHBOARD_STARTUP_TERMINAL_FD !== undefined &&
	Number.isFinite(shutdownDelayMs) &&
	shutdownDelayMs > 0
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
						delay ??= Bun.sleep(shutdownDelayMs);
						return delay.then(application.shutdown);
					},
				};
			},
		})),
	);
}
