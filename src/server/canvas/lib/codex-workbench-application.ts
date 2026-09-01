import type {
	CodexWorkbenchOwner,
	CodexWorkbenchSnapshot,
	InstallProductionCodexWorkbenchOptions,
} from "./codex-workbench.js";

export interface CanvasCodexWorkbenchModule {
	readonly installProductionCodexWorkbench: (
		options: InstallProductionCodexWorkbenchOptions,
	) => CodexWorkbenchOwner;
	readonly reloadProductionCodexWorkbench: (
		options: InstallProductionCodexWorkbenchOptions,
	) => Promise<CodexWorkbenchSnapshot>;
	readonly shutdownProductionCodexWorkbench: () => Promise<CodexWorkbenchSnapshot>;
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

function asError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

/** Own mandatory application readiness and terminal teardown for one retained graph. */
export function createCanvasCodexWorkbenchApplication(
	options: CanvasCodexWorkbenchApplicationOptions,
): {
	readonly prepare: () => Promise<CodexWorkbenchSnapshot>;
	readonly shutdown: () => Promise<void>;
} {
	let preparePromise: Promise<CodexWorkbenchSnapshot> | null = null;
	let shutdownPromise: Promise<void> | null = null;
	let shutdownRequested = false;

	const shutdown = (): Promise<void> => {
		shutdownRequested = true;
		if (shutdownPromise !== null) return shutdownPromise;
		if (options.state.phase === "idle" || options.state.phase === "stopped") {
			options.state.installed = false;
			options.state.phase = "stopped";
			options.state.shutdown = null;
			return Promise.resolve();
		}
		options.state.phase = "stopping";
		let cleanup: Promise<CodexWorkbenchSnapshot>;
		try {
			// Production revokes retained dispatch synchronously before returning cleanup.
			cleanup = options.module.shutdownProductionCodexWorkbench();
		} catch (error) {
			cleanup = Promise.reject(error);
		}
		const operation = cleanup
			.then(() => undefined)
			.finally(() => {
				options.state.installed = false;
				options.state.phase = "stopped";
				options.state.shutdown = null;
			});
		shutdownPromise = operation;
		return operation;
	};

	const prepare = (): Promise<CodexWorkbenchSnapshot> => {
		if (preparePromise !== null) return preparePromise;
		shutdownRequested = false;
		shutdownPromise = null;
		const wasInstalled = options.state.installed;
		options.state.phase = "preparing";
		// Publish terminal authority before installation or readiness can await.
		options.state.shutdown = shutdown;
		let readiness: Promise<CodexWorkbenchSnapshot>;
		try {
			const installation = options.installation();
			readiness = wasInstalled
				? options.module.reloadProductionCodexWorkbench(installation)
				: options.module.installProductionCodexWorkbench(installation).start();
		} catch (error) {
			options.state.phase = wasInstalled ? "installed" : "idle";
			options.state.shutdown = wasInstalled ? shutdown : null;
			return Promise.reject(error);
		}

		const operation = (async (): Promise<CodexWorkbenchSnapshot> => {
			let result: CodexWorkbenchSnapshot | null = null;
			let startupFailure: Error | null = null;
			try {
				result = await readiness;
			} catch (error) {
				startupFailure = asError(error);
			}
			if (shutdownRequested) {
				let shutdownFailure: Error | null = null;
				try {
					await shutdown();
				} catch (error) {
					shutdownFailure = asError(error);
				}
				if (startupFailure !== null && shutdownFailure !== null)
					throw new AggregateError(
						[startupFailure, shutdownFailure],
						"Codex startup and concurrent application shutdown both failed.",
					);
				if (startupFailure !== null) throw startupFailure;
				if (shutdownFailure !== null) throw shutdownFailure;
				throw new Error(
					"The Codex workbench was shut down while application readiness was pending.",
				);
			}
			if (startupFailure !== null) {
				options.state.installed = false;
				options.state.phase = "idle";
				options.state.shutdown = null;
				throw startupFailure;
			}
			options.state.installed = true;
			options.state.phase = "installed";
			options.state.shutdown = shutdown;
			return result!;
		})().finally(() => {
			preparePromise = null;
		});
		preparePromise = operation;
		return operation;
	};

	return Object.freeze({ prepare, shutdown });
}
