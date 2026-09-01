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

	const prepare = async (): Promise<CodexWorkbenchSnapshot> => {
		const module = await options.load();
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
		const operation = (async (): Promise<void> => {
			if (!options.state.installed) return;
			const module = await options.load();
			await module.shutdownProductionCodexWorkbench();
			options.state.installed = false;
			options.state.shutdown = null;
		})();
		shutdownPromise = operation;
		return operation;
	};

	return Object.freeze({ prepare, shutdown });
}
