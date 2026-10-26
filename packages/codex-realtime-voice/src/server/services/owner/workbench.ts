import { mkdirSync } from "node:fs";
import {
	createDefaultWorkbenchHost,
	type DefaultWorkbenchHostInput,
} from "#server/services/host/default.ts";
import {
	workbenchStorage,
	type CodexWorkbenchStorageInput,
} from "#server/services/host/storage.ts";
import { createTabSessions, type TabSessions } from "#server/services/sessions/browser-tabs.ts";
import { createWorkbenchBrowserConnections } from "#server/services/browser-socket/connections.ts";
import type { CodexProcessOptions } from "@archboard/codex-app-server/process";
import { captureWorkbenchInstructions } from "#runtime/rules/host/instructions.ts";
import {
	CODEX_WORKBENCH_OWNER,
	installProductionCodexWorkbench,
	type CodexWorkbenchOwner,
} from "#server/services/generation/workbench.ts";
import { createProductionBindings } from "#server/services/generation/bindings.ts";
import { createProductionHooks } from "#server/services/generation/hooks.ts";
import { createGenerationOwnerStore } from "#server/services/generation/owners.ts";
import { createServerCodexWorkbenchApplication } from "#server/services/owner/application.ts";
import type { CodexWorkbenchHostPolicy } from "#server/protocol/generation/host.ts";
import type { CodexWorkbenchDomainScope } from "#server/protocol/generation/domain.ts";
import type { BrowserLeaseLedger } from "#server/protocol/gateway/contract.ts";
import { announceContextChange } from "#server/services/announce/announce.ts";
import type { ContextChange } from "#server/protocol/announce/contract.ts";

/** An installation supplies private paths, the executable environment, and frozen domain policy. */
export interface CreateCodexWorkbenchOptions {
	readonly storage: CodexWorkbenchStorageInput;
	readonly process: Omit<CodexProcessOptions, "workingDirectory" | "storage">;
	readonly host: DefaultWorkbenchHostInput;
	readonly extensions?: CodexWorkbenchExtensions;
	readonly browserLeaseLedger?: BrowserLeaseLedger;
}

/** Optional application adapters install domain context and browser routing on the core lifecycle. */
export type CodexWorkbenchExtensions = Omit<
	Partial<CodexWorkbenchHostPolicy>,
	"instructions" | "resolveCheckout" | "shownCheckoutOf" | "shownConversationOf" | "onShownChange"
> & {
	/** The checkout a browser's tab shows first. Default: the checkout its socket was accepted with. */
	readonly browserCheckoutOf?: (browserId: string) => string;
	/** Install the host's reading and activation of the tab registry on each generation's gateway. */
	readonly installBrowserSessions?: (tabs: TabSessions) => () => void;
};

/**
 * Capture process inputs before a caller can change a reviewed installation.
 * @param input The explicit Codex process inputs.
 * @returns Independent immutable process inputs.
 */
function captureProcessOptions(
	input: CreateCodexWorkbenchOptions["process"],
): CreateCodexWorkbenchOptions["process"] {
	const captured = { ...input };
	return Object.freeze({
		...captured,
		...(captured.hostEnvironment === undefined
			? {}
			: { hostEnvironment: Object.freeze({ ...captured.hostEnvironment }) }),
		...(captured.pathPrefixes === undefined
			? {}
			: { pathPrefixes: Object.freeze([...captured.pathPrefixes]) }),
		...(captured.diagnosticSecrets === undefined
			? {}
			: { diagnosticSecrets: Object.freeze([...captured.diagnosticSecrets]) }),
	});
}

/**
 * Build the complete Codex workbench from explicit installation and host inputs.
 * @param options The private storage, process environment, and host policy.
 * @returns Lifecycle, session, connection, and browser activation operations.
 */
export function createCodexWorkbench(options: CreateCodexWorkbenchOptions) {
	const storage = workbenchStorage(options.storage);
	const tabs = createTabSessions();

	const extensions = Object.freeze({ ...options.extensions });
	const ingress = createWorkbenchBrowserConnections(
		tabs,
		(named) => host.resolveCheckout(named),
		() => {
			requireScope();
		},
	);
	const defaults = createDefaultWorkbenchHost(options.host, {
		/**
		 * Resolve the shown checkout through the core tab registry.
		 * @param browserId The registered browser.
		 * @returns The checkout shown by its tab.
		 */
		shownCheckoutOf: (browserId) => {
			const id = tabs.of(browserId);
			if (id === null) throw new Error("The browser has no registered tab session.");
			return tabs.shown(id, () => {
				const checkout = extensions.browserCheckoutOf?.(browserId) ?? ingress.checkoutOf(browserId);
				if (checkout === undefined) throw new Error("The browser has no admitted checkout.");
				return checkout;
			});
		},
		shownConversationOf: tabs.current,
		/**
		 * Subscribe to browser activation changes of the shown conversation.
		 * @param listener Receives shown-conversation changes.
		 * @returns The subscription cleanup.
		 */
		onShownChange: (listener) => tabs.onShownChange(() => listener()),
	});
	const policy = Object.freeze({ ...defaults, ...extensions });
	const processOptions = captureProcessOptions(options.process);
	for (const directory of [storage.ownerDirectory, storage.coordinatorDirectory])
		mkdirSync(directory, { recursive: true, mode: 0o700 });
	const leaseLedger = options.browserLeaseLedger ?? { sessions: new Map() };
	let current: CodexWorkbenchDomainScope | null = null;
	let owner: CodexWorkbenchOwner | null = null;
	const host: CodexWorkbenchHostPolicy = Object.freeze({
		...policy,
		instructions: captureWorkbenchInstructions(policy.instructions),
		contextCodec: Object.freeze({ ...policy.contextCodec }),
		...(policy.domainTools === undefined
			? {}
			: {
					domainTools: Object.freeze({
						...policy.domainTools,
						registrations: Object.freeze(
							policy.domainTools.registrations.map((registration) =>
								Object.freeze({ ...registration }),
							),
						),
					}),
				}),
		/**
		 * Install host context for this generation and unwind failed installation.
		 * @param scope The exact generation capabilities.
		 * @returns The cleanup that retires both host adapters.
		 */
		onGeneration: (scope: CodexWorkbenchDomainScope) => {
			const removeDefault = defaults.onGeneration?.(scope);
			let uninstall: (() => void) | undefined;
			try {
				uninstall = extensions.onGeneration?.(scope);
			} catch (error) {
				removeDefault?.();
				throw error;
			}
			current = scope;
			return () => {
				if (current === scope) current = null;
				try {
					uninstall?.();
				} finally {
					removeDefault?.();
				}
			};
		},
		/**
		 * Attach browser routing and session expiry before accepting browser work.
		 * @param scope The gateway and its session operations.
		 * @returns The cleanup for routing and expiry.
		 */
		onBrowserGateway: (
			scope: Parameters<NonNullable<CodexWorkbenchHostPolicy["onBrowserGateway"]>>[0],
		) => {
			const removeTabs = extensions.installBrowserSessions?.(tabs);
			const stopEnding = tabs.onEnded((id) => {
				scope.gateway.endSession(id);
				void scope.sessions.end(id).catch(policy.onFatal);
			});
			let remove: () => void;
			try {
				remove =
					extensions.onBrowserGateway === undefined
						? ingress.install(scope)
						: extensions.onBrowserGateway(scope);
			} catch (error) {
				stopEnding();
				removeTabs?.();
				throw error;
			}
			return () => {
				try {
					remove();
				} finally {
					stopEnding();
					removeTabs?.();
				}
			};
		},
	});
	const server = Object.freeze({ host });
	const application = createServerCodexWorkbenchApplication({
		module: {
			/**
			 * Create and retain the one private Codex process owner.
			 * @param installation The internal generation installation.
			 * @returns The private process owner.
			 */
			installProductionCodexWorkbench: (installation) => {
				owner = installProductionCodexWorkbench(installation);
				return owner;
			},
		},
		/**
		 * Configure the internal generation graph from captured installation inputs.
		 * @returns The internal installation.
		 */
		installation: () => {
			const generations = createGenerationOwnerStore();
			return {
				process: {
					...processOptions,
					workingDirectory: storage.coordinatorDirectory,
					storage: {
						rootDirectory: storage.root,
						ownerDirectory: storage.ownerDirectory,
						codexHome: storage.codexHome,
						sqliteHome: storage.sqliteHome,
					},
				},
				/**
				 * Build this exact generation from its captured process and storage.
				 * @param input The exact process generation.
				 * @returns Its component bindings.
				 */
				bindings: (input) =>
					createProductionBindings({
						server,
						storage,
						input,
						owners: generations.for(input),
						leaseLedger,
					}),
				/**
				 * Bind readiness, context installation, and retirement to this generation.
				 * @param input The exact process generation.
				 * @returns Its lifecycle hooks.
				 */
				hooks: (input) =>
					createProductionHooks({ server, storage, input, owners: generations.for(input) }),
			};
		},
	});
	/**
	 * Require the private process owner created by startup.
	 * @returns The private process owner.
	 */
	const requireOwner = (): CodexWorkbenchOwner => {
		if (owner === null)
			throw new Error(
				"The voice agent has not started. Start it before it serves browser sockets.",
			);
		return owner;
	};
	/**
	 * Require the ready generation and its current execution authority.
	 * @returns The live generation capabilities.
	 */
	const requireScope = (): CodexWorkbenchDomainScope => {
		if (current === null || !requireOwner().snapshot().ready)
			throw new Error(
				"The voice agent is not ready for browser sockets. Retry once its status reads ready.",
			);
		current.assertCurrent();
		return current;
	};
	return Object.freeze({
		start: application.prepare,
		/**
		 * Stop the private workbench and release browser session state.
		 */
		shutdown: async () => {
			await application.shutdown();
			tabs.forgetAll();
			ingress.clear();
		},
		/**
		 * Read the private process lifecycle without starting a child.
		 * @returns The current lifecycle snapshot.
		 */
		snapshot: () =>
			owner?.snapshot() ?? {
				owner: CODEX_WORKBENCH_OWNER,
				state: "idle" as const,
				generation: 0,
				childPid: null,
				ready: false,
				failure: null,
			},
		browser: ingress.port,
		instructions: host.instructions,
		/**
		 * Tell the agents of the live tab sessions about a context change.
		 * @param change What changed, and who is told.
		 * @returns One receipt per tab session and audience.
		 */
		announce: (change: ContextChange) =>
			announceContextChange(
				{
					/**
					 * The ready generation.
					 * @returns Its capabilities.
					 */
					scope: () => {
						if (current === null || !requireOwner().snapshot().ready)
							throw new Error(
								"The voice agent is not ready to announce a change. Retry once its status reads ready.",
							);
						return current;
					},
					resolveCheckout: host.resolveCheckout,
				},
				change,
			),
	});
}
