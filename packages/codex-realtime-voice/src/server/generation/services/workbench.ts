import { createCodexProcess } from "@archboard/codex-app-server/process";
import { openCodexConnection } from "@archboard/codex-app-server/connection";
import {
	CODEX_WORKBENCH_OWNER,
	installCodexWorkbenchOwnerLifecycle,
	type CodexWorkbenchChildInput,
	type CodexWorkbenchComponents,
	type CodexWorkbenchGenerationFactory,
	type CodexWorkbenchGenerationHooks,
	type CodexWorkbenchGenerationInput,
	type CodexWorkbenchOwner,
	type CodexWorkbenchOwnerOptions,
	type CodexWorkbenchSnapshot,
} from "#server/owner/services/lifecycle.ts";
import type {
	InstallProductionCodexWorkbenchOptions,
	ProductionCodexWorkbenchBindings,
} from "#server/generation/protocol/contract.ts";
import {
	createProductionCodexWorkbenchFactories,
	installDynamicRegistrations,
} from "#server/generation/services/factories.ts";
import { composeCodexWorkbenchGeneration } from "#server/generation/services/compose.ts";

/**
 * Build one generation of the production workbench: the components a running
 * child owns, over the connection the owner opened to it.
 * @param options What the production owner was installed with.
 * @returns The factory the owner calls for each generation.
 */
function productionGenerationFactory(
	options: InstallProductionCodexWorkbenchOptions,
): CodexWorkbenchGenerationFactory {
	return async (input) => {
		const bindings = options.bindings(input);
		return composeCodexWorkbenchGeneration({
			factories: createProductionCodexWorkbenchFactories(
				bindings,
				input.connection,
				input.adoptedSession,
			),
			connection: input.connection,
			activate: false,
			hooks: options.hooks(input),
			assertActivationCurrent: input.assertActivationCurrent,
		});
	};
}

/**
 * Open the connection to one child as it arrives, and register this
 * workbench's dynamic dispatchers on it while its transport is open.
 * @param options What the production owner was installed with.
 * @returns The factory the owner calls for each child.
 */
function productionKernelFactory(
	options: InstallProductionCodexWorkbenchOptions,
): CodexWorkbenchOwnerOptions["createKernel"] {
	return (input) => {
		const bindings = options.bindings(input);
		const connection = openCodexConnection({
			child: input.child,
			recordPrefix: bindings.recordPrefix,
		});
		if (connection.transport.inspect().state === "open") {
			installDynamicRegistrations(
				connection.transport,
				bindings.tools,
				bindings.dynamicRegistrations,
			);
		}
		return connection;
	};
}

/**
 * Install the mandatory production owner for one server application lifetime.
 * @param options The child process, and the bindings and hooks each generation
 * is built from.
 * @returns The owner.
 */
function installProductionCodexWorkbench(
	options: InstallProductionCodexWorkbenchOptions,
): CodexWorkbenchOwner {
	return installCodexWorkbenchOwner({
		/**
		 * Start the private app-server child this workbench runs over.
		 * @returns The child.
		 */
		createProcess: () => createCodexProcess(options.process),
		createKernel: productionKernelFactory(options),
		createGeneration: productionGenerationFactory(options),
	});
}

/**
 * Install one workbench owner, production or a test's own, over the lifecycle
 * every owner shares.
 * @param options The process, kernel and generation this owner is built from.
 * @returns The owner.
 */
function installCodexWorkbenchOwner(options: CodexWorkbenchOwnerOptions): CodexWorkbenchOwner {
	return installCodexWorkbenchOwnerLifecycle(options);
}

export {
	CODEX_WORKBENCH_OWNER,
	type CodexWorkbenchChildInput,
	type CodexWorkbenchComponents,
	type CodexWorkbenchGenerationHooks,
	type CodexWorkbenchGenerationInput,
	type CodexWorkbenchOwner,
	type CodexWorkbenchSnapshot,
	type ProductionCodexWorkbenchBindings,
	type InstallProductionCodexWorkbenchOptions,
	installProductionCodexWorkbench,
	installCodexWorkbenchOwner,
};
