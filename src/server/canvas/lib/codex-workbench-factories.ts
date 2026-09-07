import { createCodexApprovalBroker } from "@/runtime/codex-approvals";
import { createCodexCoordinatorCallbacks } from "@/runtime/codex-coordinator-callbacks";
import {
	COORDINATOR_DYNAMIC_DISPATCHERS,
	createCodexCoordinatorTools,
	type CoordinatorToolDispatcher,
} from "@/runtime/codex-coordinator-tools";
import { createCodexCoordinator } from "@/runtime/codex-coordinator";
import { createCodexDynamicTools } from "@/runtime/codex-dynamic-tools";
import { createCodexEpochStore } from "@/runtime/codex-epoch";
import { createCodexSession } from "@/runtime/codex-session";
import { createCodexRealtimeAdapter } from "@/runtime/codex-realtime";
import { createSemanticContextPublisher } from "@/runtime/codex-semantic-context";
import { createCodexSpokenApprovalGate } from "@/runtime/codex-spoken-approval";
import { createCodexThreadContextController } from "@/runtime/codex-thread-context";
import { createCodexThreadLink } from "@/runtime/codex-thread-link";
import {
	ARCHBOARD_APP_MANIFEST_SHA256,
	ARCHBOARD_APP_NAMESPACE,
} from "@/runtime/codex-thread-tools";
import { createCodexTransport, type CodexTransport } from "@/runtime/codex-transport";
import type { TransportServerRequest } from "@/runtime/codex-transport/server-requests";
import { createCodexWorkhorseOperations } from "@/runtime/codex-workhorse-operations";
import { createCodexWorkhorseQueue } from "@/runtime/codex-workhorse-queue";
import { createCodexWorkhorseStart } from "@/runtime/codex-workhorse-start";
import {
	createIdentityAuthorities,
	createIdentityLedger,
	type IdentityAuthorities,
	type IdentityLedger,
} from "@/shared/codex-workbench-identity";
import { createCodexWorkbenchGateway } from "@/server/codex-workbench";
import { CodexWorkbenchCompositionError } from "@/server/canvas/lib/codex-workbench-error";
import type {
	CodexWorkbenchComponents,
	CodexWorkbenchGenerationInput,
	CodexWorkbenchStableKernel,
} from "@/server/canvas/lib/codex-workbench-lifecycle";
import type {
	CodexWorkbenchComponentFactories,
	ComponentName,
	ProductionCodexWorkbenchBindings,
} from "@/server/canvas/lib/codex-workbench-contract";

/**
 * Whether one server request is a coordinator tool call, which is the only
 * request this dispatcher answers.
 * @param request The request.
 * @returns True when the coordinator tools own it.
 */
function isCoordinatorToolRequest(
	request: TransportServerRequest,
): request is Parameters<CoordinatorToolDispatcher["dispatch"]>[0] {
	return request.method === "item/tool/call" && request.owner === "codex-coordinator-tools";
}

/**
 * Register every dynamic dispatcher this workbench serves, so the transport
 * can route a tool call to the owner that answers it.
 * @param transport The transport.
 */
function installDynamicRegistrations(transport: CodexTransport): void {
	transport.registerDynamicDispatcher({
		owner: "codex-dynamic-tools",
		namespace: ARCHBOARD_APP_NAMESPACE.name,
		manifestHash: ARCHBOARD_APP_MANIFEST_SHA256,
	});
	for (const registration of COORDINATOR_DYNAMIC_DISPATCHERS) {
		transport.registerDynamicDispatcher(registration);
	}
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
			installDynamicRegistrations(transport);
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
		 * The link binding a pane to the one workhorse thread it speaks to.
		 * @param created What the graph has built so far.
		 * @returns The link.
		 */
		threadLink: (created) =>
			createCodexThreadLink({
				...bindings.threadLink(created),
				session: requireComponent(created, "session"),
				epoch: requireComponent(created, "epoch"),
			}),
		/**
		 * What starts a workhorse thread on demand.
		 * @param created What the graph has built so far.
		 * @returns The starter.
		 */
		workhorse: (created) =>
			createCodexWorkhorseStart({
				...bindings.workhorse(created),
				session: requireComponent(created, "session"),
				threadLink: requireComponent(created, "threadLink"),
				epoch: requireComponent(created, "epoch"),
				identity: requireComponent(created, "identity").identity,
				operation: requireComponent(created, "identity").operation,
			}),
		/**
		 * What publishes the board's semantic context for a thread to read.
		 * @param created What the graph has built so far.
		 * @returns The publisher.
		 */
		semanticPublisher: (created) =>
			createSemanticContextPublisher(bindings.semanticPublisher(created)),
		/**
		 * The voice side of the session, which the coordinator speaks through.
		 * @param created What the graph has built so far.
		 * @returns The realtime adapter.
		 */
		realtime: (created) =>
			createCodexRealtimeAdapter({
				...bindings.realtime(created),
				session: requireComponent(created, "session"),
				identity: requireComponent(created, "identity").identity,
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
		dynamicTools: (created) =>
			createCodexDynamicTools({
				...bindings.dynamicTools(created),
				session: requireComponent(created, "session"),
				transport: requireComponent(created, "transport"),
				threadLink: requireComponent(created, "threadLink"),
				epoch: requireComponent(created, "epoch"),
				approval: bindings.dynamicAdapters.approval(created),
				threadAuthority: bindings.dynamicAdapters.threadAuthority(created),
				context: bindings.dynamicAdapters.context(created),
				operationId: bindings.dynamicAdapters.operationId(created),
				lifecycle: bindings.dynamicAdapters.lifecycle(created),
			}),
		/**
		 * What delivers the published context into a thread.
		 * @param created What the graph has built so far.
		 * @returns The controller.
		 */
		semanticDelivery: (created) =>
			createCodexThreadContextController({
				...bindings.semanticDelivery(created),
				session: requireComponent(created, "session"),
				threadLink: requireComponent(created, "threadLink"),
				identity: requireComponent(created, "identity").identity,
				epoch: requireComponent(created, "epoch"),
			}),
		/**
		 * The coordinator, the voice half of a pane's thread link.
		 * @param created What the graph has built so far.
		 * @returns The coordinator.
		 */
		coordinator: (created) =>
			createCodexCoordinator({
				...bindings.coordinator(created),
				session: requireComponent(created, "session"),
				threadLink: requireComponent(created, "threadLink"),
				epoch: requireComponent(created, "epoch"),
				identity: requireComponent(created, "identity").identity,
			}),
		/**
		 * The queue that runs one workhorse turn at a time, keyed by operation.
		 * @param created What the graph has built so far.
		 * @returns The queue.
		 */
		queue: (created) => {
			const operation = requireComponent(created, "identity").operation;
			return createCodexWorkhorseQueue({
				...bindings.queue(created),
				session: requireComponent(created, "session"),
				identity: requireComponent(created, "identity").identity,
				operationIds: {
					assertCurrent: operation.validator.assertCurrentOperationId,
					serialize: operation.decoder.serializeOperationId,
				},
			});
		},
		/**
		 * The operations a pane can ask the workhorse to run.
		 * @param created What the graph has built so far.
		 * @returns The operations.
		 */
		operations: (created) =>
			createCodexWorkhorseOperations({
				...bindings.operations(created),
				session: requireComponent(created, "session"),
				threadLink: requireComponent(created, "threadLink"),
				queue: requireComponent(created, "queue"),
				epoch: requireComponent(created, "epoch"),
				identity: requireComponent(created, "identity").identity,
				operation: requireComponent(created, "identity").operation,
			}),
		/**
		 * The gate that lets an approval be answered out loud.
		 * @param created What the graph has built so far.
		 * @returns The gate.
		 */
		spokenApproval: (created) =>
			createCodexSpokenApprovalGate({
				...bindings.spokenApproval(created),
				approvalBroker: requireComponent(created, "approvals"),
				coordinator: requireComponent(created, "coordinator"),
				realtime: requireComponent(created, "realtime"),
				session: requireComponent(created, "session"),
				identity: requireComponent(created, "identity").identity,
			}),
		/**
		 * The tools the coordinator calls, wrapped so every call runs through
		 * the call owner the bindings named.
		 * @param created What the graph has built so far.
		 * @returns The dispatcher.
		 */
		coordinatorTools: (created) => {
			const dispatcher = createCodexCoordinatorTools({
				...bindings.coordinatorTools(created),
				identity: requireComponent(created, "identity").identity,
				operation: requireComponent(created, "identity").operation,
				operations: requireComponent(created, "operations"),
				spokenApproval: requireComponent(created, "spokenApproval"),
				transport: requireComponent(created, "transport"),
			});
			/**
			 * Run one coordinator tool call through the call owner, so the owner
			 * sees the call whichever way it arrived.
			 * @param request The call.
			 * @returns What the tool answered.
			 */
			const dispatch: CoordinatorToolDispatcher["dispatch"] = (request) =>
				bindings.coordinatorCall.run(request, () => dispatcher.dispatch(request));
			return Object.freeze({
				...dispatcher,
				dispatch,
				/**
				 * Answer a coordinator tool call the child pushed at us, and ignore
				 * every other server request.
				 * @param request The server request.
				 */
				onServerRequest: (request: TransportServerRequest) => {
					if (!isCoordinatorToolRequest(request)) {
						return;
					}
					void dispatch(request).catch(() => undefined);
				},
			});
		},
		/**
		 * The callbacks the coordinator hands the child for turn outcomes.
		 * @param created What the graph has built so far.
		 * @returns The callbacks.
		 */
		callbacks: (created) =>
			createCodexCoordinatorCallbacks({
				...bindings.callbacks(created),
				operations: requireComponent(created, "operations"),
				session: requireComponent(created, "session"),
				threadLink: requireComponent(created, "threadLink"),
			}),
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
				workhorse: requireComponent(created, "workhorse"),
				semanticPublisher: requireComponent(created, "semanticPublisher"),
				realtime: requireComponent(created, "realtime"),
				approvals: requireComponent(created, "approvals"),
				dynamicTools: requireComponent(created, "dynamicTools"),
				semanticDelivery: requireComponent(created, "semanticDelivery"),
				coordinator: requireComponent(created, "coordinator"),
				queue: requireComponent(created, "queue"),
				operations: requireComponent(created, "operations"),
				spokenApproval: requireComponent(created, "spokenApproval"),
				coordinatorTools: requireComponent(created, "coordinatorTools"),
				callbacks: requireComponent(created, "callbacks"),
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
