import path from "node:path";
import { mkdirSync } from "node:fs";

import {
	resolveProjectCodexExecutable,
	verifyCodexExecutable,
} from "@/runtime/codex-process/executable";
import { createCodexWaitGraph } from "@/runtime/codex-wait-graph";
import { stateDir } from "@/runtime/engine/state-dir";
import type { InstallProductionCodexWorkbenchOptions } from "@/server/canvas/lib/codex-workbench";
import { createProductionBindings } from "@/server/canvas/lib/codex-workbench-bindings";
import { createGenerationOwnerStore } from "@/server/canvas/lib/codex-workbench-generation-owners";
import { createProductionHooks } from "@/server/canvas/lib/codex-workbench-hooks";
import type {
	CanvasCodexWorkbenchHost,
	CodexWorkbenchStorage,
} from "@/server/canvas/lib/codex-workbench-host";

/**
 * Create this installation's Codex storage under the canvas state directory,
 * with a mode nobody else on the machine can read.
 * @returns Where each part of it lives.
 */
function createWorkbenchStorage(): CodexWorkbenchStorage {
	const root = path.join(stateDir(), "codex-workbench");
	mkdirSync(root, { recursive: true, mode: 0o700 });
	const codexHome = path.join(root, "codex-home");
	return {
		root,
		codexHome,
		sqliteHome: path.join(root, "sqlite-home"),
		epochRoot: path.join(root, "epoch"),
		configPath: path.join(codexHome, "config.toml"),
	};
}

/**
 * Build the one mandatory real production installation used by the canvas
 * application: the proven executable, the storage under it, and the bindings
 * and hooks each generation is built from.
 * @param host What the canvas provides the workbench.
 * @returns The installation options.
 */
export function createCanvasCodexWorkbenchInstallation(
	host: CanvasCodexWorkbenchHost,
): InstallProductionCodexWorkbenchOptions {
	// Prove the mandatory runtime before creating any workbench storage. The
	// process owner proves it again at each spawn so a later replacement cannot
	// inherit a stale verification.
	const executablePath = verifyCodexExecutable(resolveProjectCodexExecutable()).executablePath;
	const storage = createWorkbenchStorage();
	const waitGraph = createCodexWaitGraph();
	const generations = createGenerationOwnerStore();

	return {
		process: {
			executablePath,
			checkoutRoot: host.checkoutRoot,
			storage: { rootDirectory: storage.root },
			onGroupOwned: host.onCodexProcessGroupOwned,
		},
		/**
		 * Everything one generation is built from.
		 * @param input The generation's input.
		 * @returns Its bindings.
		 */
		bindings: (input) =>
			createProductionBindings({
				host,
				storage,
				waitGraph,
				input,
				owners: generations.for(input),
			}),
		/**
		 * The lifecycle hooks one generation runs under.
		 * @param input The generation's input.
		 * @returns Its hooks.
		 */
		hooks: (input) => createProductionHooks({ host, input, owners: generations.for(input) }),
	};
}

export type { CanvasCodexWorkbenchHost } from "@/server/canvas/lib/codex-workbench-host";
