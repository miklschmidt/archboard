// How one tab session's owners are built over the generation they run on.
//
// The same factory pattern as the generation's own (codex-workbench-factories.ts): one factory per
// component, each built from the session's bindings, the generation's shared components and the
// session components built before it, in dependency order. A component that fails to build unwinds
// the ones built before it, so a half-built session leaves nothing running.

import { createCodexCoordinatorCallbacks } from "@/runtime/codex-coordinator-callbacks";
import {
	createCodexCoordinatorTools,
	type CoordinatorToolDispatcher,
} from "@/runtime/codex-coordinator-tools";
import { createCodexCoordinator } from "@/runtime/codex-coordinator";
import { createCodexRealtimeAdapter } from "@/runtime/codex-realtime";
import { createSemanticContextPublisher } from "@/runtime/codex-semantic-context";
import { createCodexSpokenApprovalGate } from "@/runtime/codex-spoken-approval";
import { createCodexThreadContextController } from "@/runtime/codex-thread-context";
import type { TransportServerRequest } from "@/runtime/codex-transport/server-requests";
import { createCodexWorkhorseOperations } from "@/runtime/codex-workhorse-operations";
import { createCodexWorkhorseQueue } from "@/runtime/codex-workhorse-queue";
import { createCodexWorkhorseStart } from "@/runtime/codex-workhorse-start";
import type { CodexWorkbenchSharedComponents } from "@/server/archboard/lib/codex-workbench-generation-lifecycle";
import type {
	CodexWorkbenchSessionBindings,
	ProductionCodexWorkbenchBindings,
	SessionComponentName,
} from "@/server/archboard/lib/codex-workbench-contract";
import { CodexWorkbenchCompositionError } from "@/server/archboard/lib/codex-workbench-error";
import { appendFailure } from "@/server/archboard/lib/codex-workbench-failures";
import { createServerRealtimeActions } from "@/server/archboard/lib/codex-workbench-realtime-actions";
import type {
	BuiltTabSession,
	CodexWorkbenchSessionComponents,
	CodexWorkbenchTabSessionScope,
} from "@/server/archboard/lib/codex-workbench-sessions";
import { createServerThreadLinkActions } from "@/server/archboard/lib/codex-workbench-thread-links";

/** The session components built so far, each filled in as it is made. */
type CreatedSessionComponents = {
	-readonly [Name in SessionComponentName]?: CodexWorkbenchSessionComponents[Name];
};

/** One factory per session component, each reading the ones built before it. */
type SessionComponentFactories = {
	readonly [Name in SessionComponentName]: (
		created: Readonly<CreatedSessionComponents>,
	) => CodexWorkbenchSessionComponents[Name];
};

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
 * One session component the next one is built on, refused when the session reached it out of
 * order.
 * @param created What the session has built so far.
 * @param name The component.
 * @returns The component.
 */
function requireSessionComponent<Name extends SessionComponentName>(
	created: Readonly<CreatedSessionComponents>,
	name: Name,
): CodexWorkbenchSessionComponents[Name] {
	const value = created[name];
	if (value === undefined) {
		throw new CodexWorkbenchCompositionError(
			"startup_failed",
			`A Codex tab session tried to create ${name} before its dependency was ready.`,
		);
	}
	return value;
}

/**
 * One factory per component of one tab session.
 * @param bindings What each component is configured with.
 * @param shared The generation's components the session runs over.
 * @returns The factories.
 */
function createSessionFactories(
	bindings: CodexWorkbenchSessionBindings,
	shared: CodexWorkbenchSharedComponents,
): SessionComponentFactories {
	const { identity, epoch, session, threadLink, transport } = shared;
	return Object.freeze({
		/**
		 * What starts this conversation's workhorse thread.
		 * @param created What the session has built so far.
		 * @returns The starter.
		 */
		workhorse: (created) =>
			createCodexWorkhorseStart({
				...bindings.workhorse(created),
				session,
				threadLink,
				epoch,
				identity: identity.identity,
				operation: identity.operation,
			}),
		/**
		 * What publishes the board's semantic context for this conversation's threads to read.
		 * @param created What the session has built so far.
		 * @returns The publisher.
		 */
		semanticPublisher: (created) =>
			createSemanticContextPublisher(bindings.semanticPublisher(created)),
		/**
		 * The voice side of the conversation, which its coordinator speaks through.
		 * @param created What the session has built so far.
		 * @returns The realtime adapter.
		 */
		realtime: (created) =>
			createCodexRealtimeAdapter({
				...bindings.realtime(created),
				session,
				identity: identity.identity,
			}),
		/**
		 * What delivers the published context into this conversation's workhorse.
		 * @param created What the session has built so far.
		 * @returns The controller.
		 */
		semanticDelivery: (created) =>
			createCodexThreadContextController({
				...bindings.semanticDelivery(created),
				session,
				threadLink,
				identity: identity.identity,
				epoch,
			}),
		/**
		 * The coordinator, the voice half of the conversation.
		 * @param created What the session has built so far.
		 * @returns The coordinator.
		 */
		coordinator: (created) =>
			createCodexCoordinator({
				...bindings.coordinator(created),
				session,
				threadLink,
				epoch,
				identity: identity.identity,
			}),
		/**
		 * The queue that runs one workhorse turn at a time, keyed by operation.
		 * @param created What the session has built so far.
		 * @returns The queue.
		 */
		queue: (created) =>
			createCodexWorkhorseQueue({
				...bindings.queue(created),
				session,
				identity: identity.identity,
				operationIds: {
					assertCurrent: identity.operation.validator.assertCurrentOperationId,
					serialize: identity.operation.decoder.serializeOperationId,
				},
			}),
		/**
		 * The operations the coordinator can ask the workhorse to run.
		 * @param created What the session has built so far.
		 * @returns The operations.
		 */
		operations: (created) =>
			createCodexWorkhorseOperations({
				...bindings.operations(created),
				session,
				threadLink,
				queue: requireSessionComponent(created, "queue"),
				epoch,
				identity: identity.identity,
				operation: identity.operation,
			}),
		/**
		 * The gate that lets an approval be answered out loud.
		 * @param created What the session has built so far.
		 * @returns The gate.
		 */
		spokenApproval: (created) =>
			createCodexSpokenApprovalGate({
				...bindings.spokenApproval(created),
				approvalBroker: shared.approvals,
				coordinator: requireSessionComponent(created, "coordinator"),
				realtime: requireSessionComponent(created, "realtime"),
				session,
				identity: identity.identity,
			}),
		/**
		 * The tools the coordinator calls, wrapped so every call runs through the call owner the
		 * bindings named.
		 * @param created What the session has built so far.
		 * @returns The dispatcher.
		 */
		coordinatorTools: (created) => {
			const dispatcher = createCodexCoordinatorTools({
				...bindings.coordinatorTools(created),
				identity: identity.identity,
				operation: identity.operation,
				operations: requireSessionComponent(created, "operations"),
				spokenApproval: requireSessionComponent(created, "spokenApproval"),
				transport,
			});
			/**
			 * Run one coordinator tool call through the call owner, so the owner sees the call
			 * whichever way it arrived.
			 * @param request The call.
			 * @returns What the tool answered.
			 */
			const dispatch: CoordinatorToolDispatcher["dispatch"] = (request) =>
				bindings.coordinatorCall.run(request, () => dispatcher.dispatch(request));
			return Object.freeze({
				...dispatcher,
				dispatch,
				/**
				 * Answer a coordinator tool call the child pushed at us, and ignore every other server
				 * request.
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
		 * The callbacks that tell the coordinator what became of the workhorse's turns.
		 * @param created What the session has built so far.
		 * @returns The callbacks.
		 */
		callbacks: (created) =>
			createCodexCoordinatorCallbacks({
				...bindings.callbacks(created),
				operations: requireSessionComponent(created, "operations"),
				identity: identity.identity,
				threadLink,
				transport,
			}),
	});
}

/**
 * Undo a half-built session: dispose what was built, newest first, and say what to throw.
 * @param cleanups What each built component needs undone, in build order.
 * @param error What construction failed with.
 * @returns The error to throw.
 */
function unwound(cleanups: readonly (() => unknown)[], error: unknown): Error {
	let failure = error instanceof Error ? error : new Error(String(error));
	for (const cleanup of cleanups.toReversed()) {
		try {
			cleanup();
		} catch (cleanupError) {
			failure = appendFailure(failure, cleanupError, "Codex tab session cleanup failed.");
		}
	}
	return failure;
}

/**
 * Build every component of one tab session in dependency order: the order here is the session's
 * graph, and each factory reads the components built before it.
 * @param factories One factory per component.
 * @returns Every component, frozen.
 */
function constructSessionComponents(
	factories: SessionComponentFactories,
): CodexWorkbenchSessionComponents {
	const created: CreatedSessionComponents = {};
	const cleanups: (() => unknown)[] = [];
	try {
		const workhorse = (created.workhorse = factories.workhorse(created));
		const semanticPublisher = (created.semanticPublisher = factories.semanticPublisher(created));
		cleanups.push(() => semanticPublisher.dispose());
		const realtime = (created.realtime = factories.realtime(created));
		cleanups.push(() => realtime.dispose());
		const semanticDelivery = (created.semanticDelivery = factories.semanticDelivery(created));
		cleanups.push(() => semanticDelivery.dispose());
		const coordinator = (created.coordinator = factories.coordinator(created));
		const queue = (created.queue = factories.queue(created));
		const operations = (created.operations = factories.operations(created));
		const spokenApproval = (created.spokenApproval = factories.spokenApproval(created));
		cleanups.push(() => spokenApproval.dispose());
		const coordinatorTools = (created.coordinatorTools = factories.coordinatorTools(created));
		cleanups.push(() => coordinatorTools.dispose());
		const callbacks = factories.callbacks(created);
		return Object.freeze({
			workhorse,
			semanticPublisher,
			realtime,
			semanticDelivery,
			coordinator,
			queue,
			operations,
			spokenApproval,
			coordinatorTools,
			callbacks,
		} satisfies CodexWorkbenchSessionComponents);
	} catch (error) {
		throw unwound(cleanups, error);
	}
}

/**
 * Build one production tab session: its owners over the generation's shared components, and the
 * browser actions that start its conversation and its voice.
 * @param bindingsFor What each of a session's components is configured with.
 * @param shared The generation's components.
 * @param scope The session's id, its state, and how it claims the threads it starts.
 * @returns The session's owners and actions.
 */
function buildProductionTabSession(
	bindingsFor: ProductionCodexWorkbenchBindings["tabSession"],
	shared: CodexWorkbenchSharedComponents,
	scope: CodexWorkbenchTabSessionScope,
): BuiltTabSession {
	const components = constructSessionComponents(
		createSessionFactories(bindingsFor(scope.id, shared, scope.state), shared),
	);
	return {
		components,
		actions: {
			threadLinks: createServerThreadLinkActions({
				coordinator: components.coordinator,
				identity: shared.identity,
				workhorse: components.workhorse,
				threadLink: shared.threadLink,
				semanticDelivery: components.semanticDelivery,
				claimThread: scope.claimThread,
			}),
			realtime: createServerRealtimeActions(
				{
					coordinator: components.coordinator,
					identity: shared.identity,
					realtime: components.realtime,
					workhorse: components.workhorse,
				},
				scope.claimThread,
			),
		},
	};
}

export { buildProductionTabSession };
