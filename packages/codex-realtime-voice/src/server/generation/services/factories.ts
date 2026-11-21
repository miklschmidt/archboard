import { createCodexApprovalBroker } from "#runtime/approvals/services/broker.ts";
import { TELL_COORDINATOR_OWNER } from "#runtime/voice/coordinator-callbacks/services/tell-coordinator.ts";
import { coordinatorDynamicDispatchers } from "#runtime/voice/coordinator/tools-and-work/coordinator-tools/protocol/contract.ts";
import type { VoiceToolset } from "#runtime/host/toolset/rules/toolset.ts";
import { createCodexEpochStore } from "#runtime/epoch/store/epoch.ts";
import { createCodexThreadLink } from "#runtime/workhorses/thread-link/rules/thread-link.ts";
import type { CodexTransport } from "@archboard/codex-app-server/transport";
import { openCodexSession, type CodexConnection } from "@archboard/codex-app-server/connection";
import { createCodexWorkbenchGateway } from "#server/chat-conversations/gateway/connections/services/gateway.ts";
import { CodexWorkbenchCompositionError } from "#server/generation/rules/error.ts";
import {
	buildProductionTabSession,
	buildProductionWorkhorse,
} from "#server/sessions/services/factories.ts";
import { createCodexWorkbenchSessions } from "#server/sessions/services/sessions.ts";
import type {
	CodexWorkbenchComponents,
	CodexWorkbenchGenerationInput,
} from "#server/owner/services/lifecycle.ts";
import type {
	CodexWorkbenchComponentFactories,
	ComponentName,
	ProductionCodexWorkbenchBindings,
} from "#server/generation/protocol/contract.ts";

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
 * One factory per component of the production graph, each built from the
 * bindings the caller supplied, the connection to the child, and the
 * components built before it.
 * @param bindings What each component is configured with.
 * @param connection The connection to the child this generation runs over.
 * @param adoptedSession A readiness this generation adopts instead of waiting
 * for its own, or null.
 * @returns The factories.
 */
function createProductionCodexWorkbenchFactories(
	bindings: ProductionCodexWorkbenchBindings,
	connection: CodexConnection,
	adoptedSession: CodexWorkbenchGenerationInput["adoptedSession"] = null,
): CodexWorkbenchComponentFactories {
	return Object.freeze({
		/**
		 * The authorities every other component names itself through.
		 * @returns The connection's authorities.
		 */
		identity: () => connection.identity,
		/**
		 * The store that says which child epoch a message belongs to.
		 * @param created What the graph has built so far.
		 * @returns The epoch store.
		 */
		epoch: (created) => createCodexEpochStore(bindings.epoch(created)),
		/**
		 * The stdio transport to the app-server child.
		 * @returns The connection's transport.
		 */
		transport: () => connection.transport,
		/**
		 * The session that carries requests over the connection, adopting an
		 * existing readiness when the owner handed one down.
		 * @param created What the graph has built so far.
		 * @returns The session and its control.
		 */
		session: (created) =>
			openCodexSession(connection, {
				...bindings.session(created),
				...(adoptedSession === null ? {} : { adoptedReadiness: adoptedSession }),
			}),
		/**
		 * The thread links, one per workhorse of a tab session: each names the
		 * thread that workhorse runs on. The port keys a link by its `linkKey`,
		 * which names the tab session and the checkout.
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
		 * chat first connects to it.
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

export { createProductionCodexWorkbenchFactories, installDynamicRegistrations };
