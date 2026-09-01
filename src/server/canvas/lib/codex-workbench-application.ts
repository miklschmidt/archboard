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
	let shutdownSettled = false;

	const publishStoppedIfSettled = (): void => {
		if (!shutdownSettled || preparePromise !== null) return;
		options.state.installed = false;
		options.state.phase = "stopped";
		options.state.shutdown = shutdown;
	};

	const shutdown = (): Promise<void> => {
		shutdownRequested = true;
		if (
			options.state.phase !== "idle" &&
			options.state.shutdown !== null &&
			options.state.shutdown !== shutdown
		)
			return options.state.shutdown();
		if (options.state.phase === "stopping") {
			if (shutdownPromise !== null) return shutdownPromise;
			return Promise.reject(
				new Error("Codex application shutdown is in progress without an owned cleanup promise."),
			);
		}
		if (shutdownPromise !== null) return shutdownPromise;
		if (options.state.phase === "stopped")
			return Promise.reject(
				new Error("The stopped Codex application has no terminal shutdown result."),
			);
		if (options.state.phase === "idle") {
			options.state.installed = false;
			options.state.phase = "stopped";
			options.state.shutdown = shutdown;
			shutdownSettled = true;
			shutdownPromise = Promise.resolve();
			return shutdownPromise;
		}
		let resolveShutdown!: () => void;
		let rejectShutdown!: (error: unknown) => void;
		const operation = new Promise<void>((resolve, reject) => {
			resolveShutdown = resolve;
			rejectShutdown = reject;
		});
		shutdownPromise = operation;
		shutdownSettled = false;
		options.state.installed = false;
		options.state.phase = "stopping";
		options.state.shutdown = shutdown;
		let cleanup: Promise<CodexWorkbenchSnapshot>;
		try {
			// Production revokes retained dispatch synchronously before returning cleanup.
			cleanup = options.module.shutdownProductionCodexWorkbench();
		} catch (error) {
			cleanup = Promise.reject(error);
		}
		void cleanup.then(
			() => {
				shutdownSettled = true;
				publishStoppedIfSettled();
				return resolveShutdown();
			},
			(error: unknown) => {
				shutdownSettled = true;
				publishStoppedIfSettled();
				return rejectShutdown(error);
			},
		);
		return operation;
	};

	const prepare = (): Promise<CodexWorkbenchSnapshot> => {
		const phase = options.state.phase;
		const recoveringFromStopped = phase === "stopped";
		if (phase === "stopping")
			return Promise.reject(
				new Error(
					"Cannot prepare the Codex workbench while application shutdown is in progress. Wait for shutdown to finish, then call prepare() again.",
				),
			);
		if (phase === "preparing") {
			if (preparePromise !== null) return preparePromise;
			return Promise.reject(
				new Error("Codex application preparation is already owned by another source instance."),
			);
		}
		if (phase === "idle" || phase === "stopped") {
			if (options.state.installed)
				return Promise.reject(
					new Error(`Codex application phase ${phase} cannot retain installed ownership.`),
				);
			shutdownRequested = false;
			shutdownPromise = null;
			shutdownSettled = false;
		} else if (phase === "installed") {
			if (!options.state.installed)
				return Promise.reject(
					new Error("The installed Codex application phase has no installed owner."),
				);
		} else {
			return Promise.reject(new Error(`Unsupported Codex application phase: ${String(phase)}.`));
		}
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
			if (recoveringFromStopped) {
				const failure = Promise.reject(error) as Promise<CodexWorkbenchSnapshot>;
				shutdownRequested = true;
				shutdownSettled = true;
				// This promise only rejects, so it is both the failed prepare and terminal result.
				shutdownPromise = failure as unknown as Promise<void>;
				options.state.installed = false;
				options.state.phase = "stopped";
				options.state.shutdown = shutdown;
				return failure;
			}
			options.state.phase = wasInstalled ? "installed" : "idle";
			options.state.shutdown = wasInstalled ? shutdown : null;
			return Promise.reject(error);
		}

		let operation!: Promise<CodexWorkbenchSnapshot>;
		const publishRecoveryFailure = (): void => {
			if (!recoveringFromStopped) return;
			shutdownRequested = true;
			shutdownSettled = true;
			// A rejected prepare has no snapshot value, so its exact promise is terminal-safe.
			shutdownPromise = operation as unknown as Promise<void>;
			options.state.installed = false;
			options.state.shutdown = shutdown;
		};
		operation = (async (): Promise<CodexWorkbenchSnapshot> => {
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
				if (startupFailure !== null && shutdownFailure !== null) {
					const failure = new AggregateError(
						[startupFailure, shutdownFailure],
						"Codex startup and concurrent application shutdown both failed.",
					);
					publishRecoveryFailure();
					throw failure;
				}
				if (startupFailure !== null) {
					publishRecoveryFailure();
					throw startupFailure;
				}
				if (shutdownFailure !== null) throw shutdownFailure;
				throw new Error(
					"The Codex workbench was shut down while application readiness was pending.",
				);
			}
			if (startupFailure !== null) {
				options.state.installed = false;
				if (recoveringFromStopped) {
					publishRecoveryFailure();
				} else {
					options.state.phase = "idle";
					options.state.shutdown = null;
				}
				throw startupFailure;
			}
			options.state.installed = true;
			options.state.phase = "installed";
			options.state.shutdown = shutdown;
			return result!;
		})().finally(() => {
			preparePromise = null;
			publishStoppedIfSettled();
		});
		preparePromise = operation;
		return operation;
	};

	return Object.freeze({ prepare, shutdown });
}
