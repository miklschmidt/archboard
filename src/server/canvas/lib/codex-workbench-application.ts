import type {
	CodexWorkbenchOwner,
	CodexWorkbenchSnapshot,
	InstallProductionCodexWorkbenchOptions,
} from "./codex-workbench.js";

export interface CanvasCodexWorkbenchModule {
	readonly installProductionCodexWorkbench: (
		options: InstallProductionCodexWorkbenchOptions,
	) => CodexWorkbenchOwner;
}

export interface CanvasCodexWorkbenchApplicationOptions {
	readonly module: CanvasCodexWorkbenchModule;
	readonly installation: () => InstallProductionCodexWorkbenchOptions;
}

/**
 * Own one production Codex graph for one canvas application stage.
 *
 * The Canvas application lifetime owns application phases (TASK-143.08.04);
 * this owner publishes none of its own. It keeps exactly the one closure-local
 * guard `prepare` needs so a second installation cannot start a second child,
 * and it hands `start`/`stop`/`forceStop` straight to the stage.
 */
export function createCanvasCodexWorkbenchApplication(
	options: CanvasCodexWorkbenchApplicationOptions,
): {
	readonly prepare: () => Promise<CodexWorkbenchSnapshot>;
	readonly shutdown: () => Promise<void>;
} {
	let owner: CodexWorkbenchOwner | null = null;
	let installed = false;
	let preparePromise: Promise<CodexWorkbenchSnapshot> | null = null;
	let shutdownPromise: Promise<void> | null = null;
	let shutdownRequested = false;

	const shutdown = (): Promise<void> => {
		shutdownRequested = true;
		if (shutdownPromise !== null) return shutdownPromise;
		const preparing = preparePromise;
		const stoppingOwner = owner;
		let stopped = false;
		const operation = (async () => {
			installed = false;
			// Do not wait for readiness before stopping. The owner invalidates its
			// startup ticket, rejects readiness, and TERM/KILL-reaps the process
			// group. Waiting for prepare here would make a pre-readiness signal
			// unable to reach the child it needs to stop.
			await stoppingOwner?.shutdown();
			if (preparing !== null) {
				try {
					await preparing;
				} catch {
					// Cancellation is the expected completion of startup during stop.
				}
			}
			stopped = true;
			owner = null;
		})();
		shutdownPromise = operation.finally(() => {
			// A failed verified stop keeps its owner reachable so a force/retry
			// call can finish reaping it. Successful shutdown stays idempotent.
			if (!stopped) shutdownPromise = null;
		});
		return shutdownPromise;
	};

	const prepare = (): Promise<CodexWorkbenchSnapshot> => {
		if (preparePromise !== null) return preparePromise;
		if (installed || owner !== null)
			return Promise.reject(
				new Error("The Codex workbench is already installed; stop it before preparing again."),
			);
		shutdownRequested = false;
		shutdownPromise = null;
		preparePromise = (async () => {
			try {
				owner = options.module.installProductionCodexWorkbench(options.installation());
				const snapshot = await owner.start();
				if (shutdownRequested) {
					throw new Error("The Codex workbench was stopped during startup.");
				}
				installed = true;
				return snapshot;
			} catch (error) {
				installed = false;
				if (!shutdownRequested) {
					let cleanupFailure: unknown = null;
					try {
						await owner?.shutdown();
					} catch (cleanupError) {
						cleanupFailure = cleanupError;
					}
					// A failed terminal cleanup keeps its owner reachable for the
					// stage's force pass; a clean one releases it for a later retry.
					if (cleanupFailure !== null)
						throw new AggregateError(
							[error, cleanupFailure],
							"Codex workbench startup and terminal cleanup both failed.",
							{ cause: error },
						);
					if (!shutdownRequested) owner = null;
				}
				throw error;
			} finally {
				preparePromise = null;
			}
		})();
		return preparePromise;
	};

	return Object.freeze({ prepare, shutdown });
}
