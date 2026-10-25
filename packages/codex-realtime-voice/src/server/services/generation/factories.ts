import { createCodexApprovalBroker } from "#runtime/services/approvals/broker.ts";
import { TELL_COORDINATOR_OWNER } from "#runtime/services/coordinator-callbacks/tell-coordinator.ts";
import { coordinatorDynamicDispatchers } from "#runtime/protocol/coordinator-tools/contract.ts";
import type { VoiceToolset } from "#runtime/rules/host/toolset.ts";
import { createCodexEpochStore } from "#runtime/store/epoch/epoch.ts";
import { createCodexSession } from "@archboard/codex-app-server/session";
import { createCodexThreadLink } from "#runtime/rules/thread-link/thread-link.ts";
import { createCodexTransport, type CodexTransport } from "@archboard/codex-app-server/transport";
import {
	createIdentityAuthorities,
	createIdentityLedger,
	type IdentityAuthorities,
	type IdentityLedger,
} from "@archboard/codex-app-server/identity";
import { createCodexWorkbenchGateway } from "#server/services/gateway/gateway.ts";
import { CodexWorkbenchCompositionError } from "#server/rules/generation/error.ts";
import {
	buildProductionTabSession,
	buildProductionWorkhorse,
} from "#server/services/sessions/factories.ts";
import { createCodexWorkbenchSessions } from "#server/services/sessions/sessions.ts";
import type {
	CodexWorkbenchComponents,
	CodexWorkbenchGenerationInput,
	CodexWorkbenchStableKernel,
} from "#server/services/owner/lifecycle.ts";
import type {
	CodexWorkbenchComponentFactories,
	ComponentName,
	ProductionCodexWorkbenchBindings,
} from "#server/protocol/generation/contract.ts";

/**
 * Register every dynamic dispatcher this workbench serves, so the transport
 * can route a tool call to the owner that answers it.
 * @param transport The transport.
 * @param tools The host's built-in namespaces.
 * @param domains The host domain namespaces and their manifest hashes.
 */
function installDynamicRegistrations(
	transport: CodexTransport,
	tools: VoiceToolset,
	domains: readonly { readonly namespace: string; readonly manifestHash: string }[] = [],
): void {
	const coordinatorTools = coordinatorDynamicDispatchers(tools);
	const reserved = new Set<string>([
		tools.coordinator.namespace.name,
		...coordinatorTools.map(({ namespace }) => namespace),
	]);
	const installed = new Set<string>();
	for (const registration of domains) {
		if (reserved.has(registration.namespace) || installed.has(registration.namespace))
			throw new TypeError("Host domain tools cannot replace a workbench namespace.");
		installed.add(registration.namespace);
		transport.registerDynamicDispatcher({ owner: "codex-dynamic-tools", ...registration });
	}
	for (const registration of coordinatorTools) transport.registerDynamicDispatcher(registration);
	transport.registerDynamicDispatcher({
		owner: TELL_COORDINATOR_OWNER,
		namespace: tools.coordinator.namespace.name,
		manifestHash: tools.coordinator.sha256,
	});
}

/**
 * One component the next one is built on, refused when the graph reached it
 * out of order.
 * @param created What the graph has built so far.
 * @param name The component.
 * @returns The component.
 */
function requireComponent<Name extends ComponentName>(
	created: Readonly<Partial<CodexWorkbenchComponents>>,
	name: Name,
): CodexWorkbenchComponents[Name] {
	const value = created[name];
	if (value === undefined) {
		throw new CodexWorkbenchCompositionError(
			"startup_failed",
			`The Codex workbench tried to create ${name} before its dependency was ready.`,
		);
	}
	return value;
}

/**
 * The ledger a generation names itself from: the kernel's when a kernel
 * outlives this child, so a restarted child rejoins the names it left, and a
 * fresh one otherwise.
 * @param kernel The kernel this generation runs over, or null when it has none.
 * @returns The ledger.
 */
function ledgerFor(kernel: CodexWorkbenchStableKernel | null): IdentityLedger {
	if (kernel === null) {
		return createIdentityLedger();
	}
	return kernel.identityLedger;
}

/**
 * One factory per component of the production graph, each built from the
 * bindings the caller supplied and the components built before it.
 * @param bindings What each component is configured with.
 * @param kernel The kernel outliving this child, or null when this generation
 * owns its own transport and ledger.
 * @param adoptedSession A readiness this generation adopts instead of waiting
 * for its own, or null.
 * @param identityLedger The ledger names are minted from.
 * @param initialIdentity Authorities the owner already made over that ledger,
 * or null to make them here.
 * @returns The factories.
 */
function createProductionCodexWorkbenchFactories(
	bindings: ProductionCodexWorkbenchBindings,
	kernel: CodexWorkbenchStableKernel | null = null,
	adoptedSession: CodexWorkbenchGenerationInput["adoptedSession"] = null,
	identityLedger: IdentityLedger = ledgerFor(kernel),
	initialIdentity: IdentityAuthorities | null = null,
): CodexWorkbenchComponentFactories {
	return Object.freeze({
		/**
		 * The authorities every other component names itself through.
		 * @returns The authorities.
		 */
		identity: () => initialIdentity ?? createIdentityAuthorities(identityLedger),
		/**
		 * The store that says which child epoch a message belongs to.
		 * @param created What the graph has built so far.
		 * @returns The epoch store.
		 */
		epoch: (created) => createCodexEpochStore(bindings.epoch(created)),
		/**
		 * The stdio transport to the app-server child. A kernel's transport
		 * outlives the child, so it is re-identified rather than replaced.
		 * @param created What the graph has built so far.
		 * @returns The transport.
		 */
		transport: (created) => {
			const identity = requireComponent(created, "identity").identity;
			if (kernel !== null) {
				kernel.transport.replaceIdentity(identity);
				return kernel.transport;
			}
			const transport = createCodexTransport({
				...bindings.transport(created),
				identity,
			});
			installDynamicRegistrations(transport, bindings.tools, bindings.dynamicRegistrations);
			return transport;
		},
		/**
		 * The session that carries requests over the transport, adopting an
		 * existing readiness when the owner handed one down.
		 * @param created What the graph has built so far.
		 * @returns The session.
		 */
		session: (created) =>
			createCodexSession({
				...bindings.session(created),
				transport: requireComponent(created, "transport"),
				identity: requireComponent(created, "identity").identity,
				listenerOwnership: "composition",
				...(adoptedSession === null ? {} : { adoptedReadiness: adoptedSession }),
			}),
		/**
		 * The thread links, one per browser tab session: each names the workhorse
		 * thread that tab's conversation runs on. The port keys a link by its
		 * `paneId`, which holds the tab session's id.
		 * @param created What the graph has built so far.
		 * @returns The link port.
		 */
		threadLink: (created) =>
			createCodexThreadLink({
				...bindings.threadLink(created),
				session: requireComponent(created, "session"),
				epoch: requireComponent(created, "epoch"),
			}),
		/**
		 * What holds an approval request until somebody answers it.
		 * @param created What the graph has built so far.
		 * @returns The broker.
		 */
		approvals: (created) =>
			createCodexApprovalBroker({
				...bindings.approvals(created),
				transport: requireComponent(created, "transport"),
				identity: requireComponent(created, "identity").identity,
				listenerOwnership: "composition",
			}),
		/**
		 * The tools this app registers with the child, wired to the ports the
		 * bindings named for approval, authority, context and lifecycle.
		 * @param created What the graph has built so far.
		 * @returns The dynamic tools.
		 */
		dynamicTools: (created) => bindings.dynamicTools(created),
		/**
		 * The tab sessions of this generation, each opened when a browser tab's
		 * pane first connects to it.
		 * @param created What the graph has built so far.
		 * @returns The sessions.
		 */
		sessions: (created) => {
			const shared = {
				identity: requireComponent(created, "identity"),
				epoch: requireComponent(created, "epoch"),
				transport: requireComponent(created, "transport"),
				session: requireComponent(created, "session"),
				threadLink: requireComponent(created, "threadLink"),
				approvals: requireComponent(created, "approvals"),
				dynamicTools: created.dynamicTools ?? null,
			};
			return createCodexWorkbenchSessions({
				...bindings.sessions(created),
				identity: shared.identity.identity,
				transport: shared.transport,
				session: shared.session,
				threadLink: shared.threadLink,
				/**
				 * Build one tab session's coordinator and voice over this generation's shared
				 * components.
				 * @param scope The session's id, state, workhorses and thread claim.
				 * @returns Its owners and actions.
				 */
				build: (scope) => buildProductionTabSession(bindings.tabSession, shared, scope),
				/**
				 * Build one workhorse of a tab session over this generation's shared components.
				 * @param scope The workhorse's session, checkout, link key and thread claim.
				 * @returns Its owners and actions.
				 */
				buildWorkhorse: (scope) => buildProductionWorkhorse(bindings.workhorse, shared, scope),
			});
		},
		/**
		 * The gateway the browser talks to, built last because it is given every
		 * component before it.
		 * @param created What the graph has built so far.
		 * @returns The gateway.
		 */
		gateway: (created) => {
			const dependencies = {
				identity: requireComponent(created, "identity"),
				epoch: requireComponent(created, "epoch"),
				transport: requireComponent(created, "transport"),
				session: requireComponent(created, "session"),
				threadLink: requireComponent(created, "threadLink"),
				approvals: requireComponent(created, "approvals"),
				dynamicTools: created.dynamicTools ?? null,
				sessions: requireComponent(created, "sessions"),
			};
			return createCodexWorkbenchGateway({
				...bindings.gateway(dependencies),
				identity: requireComponent(created, "identity"),
				threadLink: requireComponent(created, "threadLink"),
			});
		},
	});
}

export { createProductionCodexWorkbenchFactories, installDynamicRegistrations, requireComponent };
