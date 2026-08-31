import type * as CanvasApplication from "./lib/application.js";

export {
	CODEX_WORKBENCH_OWNER,
	CodexWorkbenchCompositionError,
	composeCodexWorkbenchGeneration,
	createCodexWorkbenchRequestRouter,
	createProductionCodexWorkbenchFactories,
	emptyCodexWorkbenchRetainedState,
	installCodexWorkbenchOwner,
	installProductionCodexWorkbench,
} from "./lib/codex-workbench.js";
export type {
	CodexWorkbenchGeneration,
	CodexWorkbenchComponentFactories,
	CodexWorkbenchComponents,
	CodexWorkbenchDynamicAdapterFactories,
	CodexWorkbenchGenerationHooks,
	CodexWorkbenchGenerationInput,
	CodexWorkbenchOwner,
	CodexWorkbenchOwnerOptions,
	CodexWorkbenchRequestOwners,
	CodexWorkbenchRequestRouter,
	CodexWorkbenchRetainedState,
	CodexWorkbenchSnapshot,
	CodexWorkbenchState,
	ComposeCodexWorkbenchGenerationOptions,
	InstallProductionCodexWorkbenchOptions,
	ProductionCodexWorkbenchBindings,
} from "./lib/codex-workbench.js";

/** Load one canvas application generation without caching a previous reload. */
export async function loadCanvasApplication(cacheKey = ""): Promise<typeof CanvasApplication> {
	return import(`./lib/application.js${cacheKey}`);
}
