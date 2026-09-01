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
	shutdown: (() => Promise<void>) | null;
}

export interface CanvasCodexWorkbenchApplicationOptions {
	readonly state: CanvasCodexWorkbenchApplicationState;
	readonly load: () => Promise<CanvasCodexWorkbenchModule>;
	readonly installation: () => InstallProductionCodexWorkbenchOptions;
}

/** Own mandatory application readiness and terminal teardown for one retained graph. */
export function createCanvasCodexWorkbenchApplication(
	options: CanvasCodexWorkbenchApplicationOptions,
): {
	readonly prepare: () => Promise<CodexWorkbenchSnapshot>;
	readonly shutdown: () => Promise<void>;
} {
	let shutdownPromise: Promise<void> | null = null;
	let loadedModule: CanvasCodexWorkbenchModule | null = null;

	const prepare = async (): Promise<CodexWorkbenchSnapshot> => {
		const module = await options.load();
		loadedModule = module;
		const installation = options.installation();
		const snapshot = options.state.installed
			? await module.reloadProductionCodexWorkbench(installation)
			: await module.installProductionCodexWorkbench(installation).start();
		options.state.installed = true;
		options.state.shutdown = shutdown;
		return snapshot;
	};

	const shutdown = (): Promise<void> => {
		if (shutdownPromise !== null) return shutdownPromise;
		if (!options.state.installed) return Promise.resolve();
		const module = loadedModule;
		if (module === null)
			return Promise.reject(
				new Error("The installed Codex workbench has no synchronously available shutdown owner."),
			);
		// The production shutdown call revokes every retained dispatch slot before
		// returning its cleanup promise.
		let cleanup: Promise<CodexWorkbenchSnapshot>;
		try {
			cleanup = module.shutdownProductionCodexWorkbench();
		} catch (error) {
			return Promise.reject(error);
		}
		const operation = (async (): Promise<void> => {
			await cleanup;
			options.state.installed = false;
			options.state.shutdown = null;
			loadedModule = null;
		})();
		shutdownPromise = operation;
		return operation;
	};

	return Object.freeze({ prepare, shutdown });
}
