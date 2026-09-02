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

export interface CanvasCodexWorkbenchApplicationState {
	installed: boolean;
	phase: "idle" | "preparing" | "installed" | "stopping" | "stopped";
	shutdown: (() => Promise<void>) | null;
}

export interface CanvasCodexWorkbenchApplicationOptions {
	readonly state: CanvasCodexWorkbenchApplicationState;
	readonly module: CanvasCodexWorkbenchModule;
	readonly installation: () => InstallProductionCodexWorkbenchOptions;
}

/** Own one production Codex graph for one canvas application lifetime. */
export function createCanvasCodexWorkbenchApplication(
	options: CanvasCodexWorkbenchApplicationOptions,
): {
	readonly prepare: () => Promise<CodexWorkbenchSnapshot>;
	readonly shutdown: () => Promise<void>;
} {
	let owner: CodexWorkbenchOwner | null = null;
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
			options.state.installed = false;
			options.state.phase = "stopping";
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
			options.state.phase = "stopped";
			options.state.shutdown = shutdown;
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
		if (options.state.phase !== "idle")
			return Promise.reject(
				new Error(`Cannot prepare the Codex workbench from ${options.state.phase}.`),
			);
		shutdownRequested = false;
		options.state.phase = "preparing";
		options.state.shutdown = shutdown;
		preparePromise = (async () => {
			try {
				owner = options.module.installProductionCodexWorkbench(options.installation());
				const snapshot = await owner.start();
				if (shutdownRequested) {
					throw new Error("The Codex workbench was stopped during startup.");
				}
				options.state.installed = true;
				options.state.phase = "installed";
				return snapshot;
			} catch (error) {
				options.state.installed = false;
				if (!shutdownRequested) {
					let cleanupFailure: unknown = null;
					try {
						await owner?.shutdown();
					} catch (cleanupError) {
						cleanupFailure = cleanupError;
					}
					if (cleanupFailure !== null) {
						options.state.phase = "stopping";
						options.state.shutdown = shutdown;
						throw new AggregateError(
							[error, cleanupFailure],
							"Codex workbench startup and terminal cleanup both failed.",
							{ cause: error },
						);
					}
					// A concurrent shutdown owns the final publication once requested.
					if (!shutdownRequested) {
						owner = null;
						options.state.phase = "idle";
						options.state.shutdown = null;
					}
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
