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
		shutdownPromise = (async () => {
			if (preparePromise !== null) {
				try {
					await preparePromise;
				} catch {
					// Startup owns its partial cleanup; shutdown still publishes stopped.
				}
			}
			options.state.installed = false;
			options.state.phase = "stopping";
			try {
				await owner?.shutdown();
			} finally {
				owner = null;
				options.state.phase = "stopped";
				options.state.shutdown = shutdown;
			}
		})();
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
					await owner.shutdown();
					owner = null;
					throw new Error("The Codex workbench was stopped during startup.");
				}
				options.state.installed = true;
				options.state.phase = "installed";
				return snapshot;
			} catch (error) {
				options.state.installed = false;
				if (!shutdownRequested) {
					owner = null;
					options.state.phase = "idle";
					options.state.shutdown = null;
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
