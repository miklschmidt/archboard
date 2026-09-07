import { createCodexProcess } from "@/runtime/codex-process";
import { createCodexTransport } from "@/runtime/codex-transport";
import {
	createIdentityAuthorities,
	createIdentityLedger,
} from "@/shared/codex-workbench-identity";
import { CodexWorkbenchCompositionError } from "@/server/canvas/lib/codex-workbench-error";
import {
	CODEX_WORKBENCH_OWNER,
	installCodexWorkbenchOwnerLifecycle,
	type CodexWorkbenchComponents,
	type CodexWorkbenchGeneration,
	type CodexWorkbenchGenerationFactory,
	type CodexWorkbenchGenerationHooks,
	type CodexWorkbenchGenerationInput,
	type CodexWorkbenchKernelAcquisition,
	type CodexWorkbenchOwner,
	type CodexWorkbenchOwnerOptions,
	type CodexWorkbenchSnapshot,
	type CodexWorkbenchStableKernel,
	type CodexWorkbenchState,
	type CodexWorkbenchStopReason,
} from "@/server/canvas/lib/codex-workbench-lifecycle";
import type {
	CodexWorkbenchComponentFactories,
	CodexWorkbenchCoordinatorCallOwner,
	CodexWorkbenchDynamicAdapterFactories,
	ComposeCodexWorkbenchGenerationOptions,
	InstallProductionCodexWorkbenchOptions,
	ProductionCodexWorkbenchBindings,
} from "@/server/canvas/lib/codex-workbench-contract";
import {
	createProductionCodexWorkbenchFactories,
	installDynamicRegistrations,
} from "@/server/canvas/lib/codex-workbench-factories";
import { composeCodexWorkbenchGeneration } from "@/server/canvas/lib/codex-workbench-compose";

/**
 * Build one generation of the production workbench: the components a running
 * child owns, over whichever kernel the owner handed down.
 * @param options What the production owner was installed with.
 * @returns The factory the owner calls for each generation.
 */
function productionGenerationFactory(
	options: InstallProductionCodexWorkbenchOptions,
): CodexWorkbenchGenerationFactory {
	return async (input) => {
		const identityLedger = input.kernel?.identityLedger ?? createIdentityLedger();
		return composeCodexWorkbenchGeneration({
			factories: createProductionCodexWorkbenchFactories(
				options.bindings(input),
				input.kernel,
				input.adoptedSession,
				identityLedger,
				input.initialIdentity,
			),
			identityLedger,
			ownsTransport: input.kernel === null,
			activate: false,
			hooks: options.hooks(input),
			assertActivationCurrent: input.assertActivationCurrent,
		});
	};
}

/**
 * Build the kernel that outlives one child: the identity ledger and the
 * transport, so a restarted child rejoins the same names it left.
 * @param options What the production owner was installed with.
 * @returns The factory the owner calls when it needs a kernel.
 */
function productionKernelFactory(
	options: InstallProductionCodexWorkbenchOptions,
): NonNullable<CodexWorkbenchOwnerOptions["createKernel"]> {
	return (input) => {
		const identityLedger = createIdentityLedger();
		const identity = createIdentityAuthorities(identityLedger);
		const bindings = options.bindings(input);
		const transport = createCodexTransport({
			...bindings.transport({ identity }),
			identity: identity.identity,
		});
		if (transport.inspect().state === "open") {
			installDynamicRegistrations(transport);
		}
		return Object.freeze({
			kernel: Object.freeze({ identityLedger, transport }),
			identity,
		});
	};
}

/**
 * Install the mandatory production owner for one canvas application lifetime.
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
	CodexWorkbenchCompositionError,
	CODEX_WORKBENCH_OWNER,
	type CodexWorkbenchComponents,
	type CodexWorkbenchGeneration,
	type CodexWorkbenchGenerationFactory,
	type CodexWorkbenchGenerationHooks,
	type CodexWorkbenchGenerationInput,
	type CodexWorkbenchKernelAcquisition,
	type CodexWorkbenchOwner,
	type CodexWorkbenchOwnerOptions,
	type CodexWorkbenchSnapshot,
	type CodexWorkbenchStableKernel,
	type CodexWorkbenchState,
	type CodexWorkbenchStopReason,
	type CodexWorkbenchComponentFactories,
	type ComposeCodexWorkbenchGenerationOptions,
	type CodexWorkbenchDynamicAdapterFactories,
	type CodexWorkbenchCoordinatorCallOwner,
	type ProductionCodexWorkbenchBindings,
	createProductionCodexWorkbenchFactories,
	composeCodexWorkbenchGeneration,
	type InstallProductionCodexWorkbenchOptions,
	installProductionCodexWorkbench,
	installCodexWorkbenchOwner,
};
