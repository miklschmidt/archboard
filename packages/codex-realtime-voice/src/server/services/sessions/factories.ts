// How one tab session's owners, and those of each of its workhorses, are built over the
// generation they run on.
//
// The same factory pattern as the generation's own (`services/generation/factories.ts`): one factory per
// component, each built from its bindings, the generation's shared components and the components
// built before it, in dependency order. A component that fails to build unwinds the ones built
// before it, so a half-built session or workhorse leaves nothing running.

import { createCodexCoordinatorCallbacks } from "#runtime/services/coordinator-callbacks/callbacks.ts";
import { createCodexCoordinatorTools } from "#runtime/services/coordinator-tools/dispatcher.ts";
import { type CoordinatorToolDispatcher } from "#runtime/protocol/coordinator-tools/contract.ts";
import { createCodexCoordinator } from "#runtime/services/coordinator/coordinator.ts";
import { createCodexSpokenApprovalGate } from "#runtime/services/spoken-approval/gate.ts";
import { createCodexRealtimeAdapter } from "#runtime/services/realtime/adapter.ts";
import { createCodexThreadContextController } from "#runtime/services/thread-context/controller.ts";
import type { TransportServerRequest } from "@archboard/codex-app-server/transport";
import { createCodexWorkhorseOperations } from "#runtime/services/workhorse-operations/operations.ts";
import { createCodexWorkhorseStart } from "#runtime/services/workhorse-start/start.ts";
import { createCodexWorkhorseQueue } from "#runtime/services/workhorse-queue/queue.ts";
import type { CodexWorkbenchSharedComponents } from "#server/services/generation/lifecycle.ts";
import type {
	CodexWorkbenchSessionBindings,
	CodexWorkbenchWorkhorseBindings,
	ProductionCodexWorkbenchBindings,
	SessionComponentName,
	WorkhorseComponentName,
} from "#server/protocol/generation/contract.ts";
import { CodexWorkbenchCompositionError } from "#server/rules/generation/error.ts";
import { recordDelegations } from "#server/services/sessions/delegations.ts";
import { appendFailure } from "#server/rules/generation/failures.ts";
import { createServerRealtimeActions } from "#server/services/voice/realtime-actions.ts";
import type {
	BuiltTabSession,
	BuiltWorkhorse,
	CodexWorkbenchSessionComponents,
	CodexWorkbenchTabSessionScope,
	CodexWorkbenchWorkhorseComponents,
	CodexWorkbenchWorkhorseScope,
} from "#server/services/sessions/sessions.ts";
import { createServerThreadLinkActions } from "#server/services/actions/thread-links.ts";

/** The session components built so far, each filled in as it is made. */
type CreatedSessionComponents = {
	-readonly [Name in SessionComponentName]?: CodexWorkbenchSessionComponents[Name];
};

/** The workhorse components built so far, each filled in as it is made. */
type CreatedWorkhorseComponents = {
	-readonly [Name in WorkhorseComponentName]?: CodexWorkbenchWorkhorseComponents[Name];
};

/** One factory per session component, each reading the ones built before it. */
type SessionComponentFactories = {
	readonly [Name in SessionComponentName]: (
		created: Readonly<CreatedSessionComponents>,
	) => CodexWorkbenchSessionComponents[Name];
};

/** One factory per workhorse component, each reading the ones built before it. */
type WorkhorseComponentFactories = {
	readonly [Name in WorkhorseComponentName]: (
		created: Readonly<CreatedWorkhorseComponents>,
	) => CodexWorkbenchWorkhorseComponents[Name];
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
 * One component the next one is built on, refused when it was reached out of order.
 * @param created What has been built so far.
 * @param name The component.
 * @returns The component.
 */
function requireBuilt<Created extends object, Name extends keyof Created & string>(
	created: Readonly<Created>,
	name: Name,
): NonNullable<Created[Name]> {
	const value = created[name];
	if (value === undefined || value === null) {
		throw new CodexWorkbenchCompositionError(
			"startup_failed",
			`A Codex tab session tried to create ${name} before its dependency was ready.`,
		);
	}
	return value;
}

/**
 * One factory per component of one tab session's coordinator and voice.
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
		 * The coordinator, which voice speaks for and which gives each checkout's work to that
		 * checkout's workhorse.
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
		 * The gate that lets an approval be answered out loud.
		 * @param created What the session has built so far.
		 * @returns The gate.
		 */
		spokenApproval: (created) =>
			createCodexSpokenApprovalGate({
				...bindings.spokenApproval(created),
				approvalBroker: shared.approvals,
				coordinator: requireBuilt(created, "coordinator"),
				realtime: requireBuilt(created, "realtime"),
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
				spokenApproval: requireBuilt(created, "spokenApproval"),
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
		 * The callbacks that tell the coordinator what became of every workhorse's turns.
		 * @param created What the session has built so far.
		 * @returns The callbacks.
		 */
		callbacks: (created) =>
			createCodexCoordinatorCallbacks({
				...bindings.callbacks(created),
				identity: identity.identity,
				threadLink,
				transport,
			}),
	});
}

/**
 * One factory per component of one workhorse.
 * @param bindings What each component is configured with.
 * @param shared The generation's components the workhorse runs over.
 * @returns The factories.
 */
function createWorkhorseFactories(
	bindings: CodexWorkbenchWorkhorseBindings,
	shared: CodexWorkbenchSharedComponents,
): WorkhorseComponentFactories {
	const { identity, epoch, session, threadLink } = shared;
	return Object.freeze({
		/**
		 * What starts this workhorse's thread, in its checkout.
		 * @param created What the workhorse has built so far.
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
		 * What delivers an announced context change into this workhorse.
		 * @param created What the workhorse has built so far.
		 * @returns The controller.
		 */
		contextDelivery: (created) =>
			createCodexThreadContextController({
				...bindings.contextDelivery(created),
				session,
				threadLink,
				identity: identity.identity,
				epoch,
			}),
		/**
		 * The queue that runs one turn of this workhorse at a time, keyed by operation.
		 * @param created What the workhorse has built so far.
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
		 * The operations the coordinator can ask this workhorse to run.
		 * @param created What the workhorse has built so far.
		 * @returns The operations.
		 */
		operations: (created) =>
			createCodexWorkhorseOperations({
				...bindings.operations(created),
				session,
				threadLink,
				queue: requireBuilt(created, "queue"),
				epoch,
				identity: identity.identity,
				operation: identity.operation,
			}),
	});
}

/**
 * Undo a half-built session or workhorse: dispose what was built, newest first, and say what to
 * throw.
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
 * Build every component of one tab session's coordinator and voice in dependency order: the order
 * here is the session's graph, and each factory reads the components built before it.
 * @param factories One factory per component.
 * @returns Every component, frozen.
 */
function constructSessionComponents(
	factories: SessionComponentFactories,
): CodexWorkbenchSessionComponents {
	const created: CreatedSessionComponents = {};
	const cleanups: (() => unknown)[] = [];
	try {
		const realtime = (created.realtime = factories.realtime(created));
		cleanups.push(() => realtime.dispose());
		const coordinator = (created.coordinator = factories.coordinator(created));
		const spokenApproval = (created.spokenApproval = factories.spokenApproval(created));
		cleanups.push(() => spokenApproval.dispose());
		const coordinatorTools = (created.coordinatorTools = factories.coordinatorTools(created));
		cleanups.push(() => coordinatorTools.dispose());
		const callbacks = factories.callbacks(created);
		return Object.freeze({
			realtime,
			coordinator,
			spokenApproval,
			coordinatorTools,
			callbacks,
		} satisfies CodexWorkbenchSessionComponents);
	} catch (error) {
		throw unwound(cleanups, error);
	}
}

/**
 * Build every component of one workhorse in dependency order.
 * @param factories One factory per component.
 * @returns Every component, frozen.
 */
function constructWorkhorseComponents(
	factories: WorkhorseComponentFactories,
): CodexWorkbenchWorkhorseComponents {
	const created: CreatedWorkhorseComponents = {};
	const cleanups: (() => unknown)[] = [];
	try {
		const workhorse = (created.workhorse = factories.workhorse(created));
		const contextDelivery = (created.contextDelivery = factories.contextDelivery(created));
		cleanups.push(() => contextDelivery.dispose());
		const queue = (created.queue = factories.queue(created));
		const operations = factories.operations(created);
		return Object.freeze({
			workhorse,
			contextDelivery,
			queue,
			operations,
		} satisfies CodexWorkbenchWorkhorseComponents);
	} catch (error) {
		throw unwound(cleanups, error);
	}
}

/**
 * Build one production tab session: its coordinator and voice over the generation's shared
 * components, and the browser actions that start its voice.
 * @param bindingsFor What each of a session's components is configured with.
 * @param shared The generation's components.
 * @param scope The session's id, its state, its workhorses and how it claims the threads it starts.
 * @returns The session's owners and actions.
 */
function buildProductionTabSession(
	bindingsFor: ProductionCodexWorkbenchBindings["tabSession"],
	shared: CodexWorkbenchSharedComponents,
	scope: CodexWorkbenchTabSessionScope,
): BuiltTabSession {
	const bindings = bindingsFor(scope, shared);
	const components = constructSessionComponents(createSessionFactories(bindings, shared));
	scope.workhorseOperations.subscribe(recordDelegations(scope.state.delegations));
	return {
		components,
		actions: {
			realtime: createServerRealtimeActions(
				{
					coordinator: components.coordinator,
					identity: shared.identity,
					realtime: components.realtime,
				},
				scope,
				scope.state.voiceTrace,
				bindings.presentation,
			),
		},
	};
}

/**
 * Build one production workhorse: its owners over the generation's shared components, and the
 * actions that start its conversation.
 * @param bindingsFor What each of a workhorse's components is configured with.
 * @param shared The generation's components.
 * @param scope The workhorse's session, checkout, link key and how it claims its threads.
 * @returns The workhorse's owners and actions.
 */
function buildProductionWorkhorse(
	bindingsFor: ProductionCodexWorkbenchBindings["workhorse"],
	shared: CodexWorkbenchSharedComponents,
	scope: CodexWorkbenchWorkhorseScope,
): BuiltWorkhorse {
	const components = constructWorkhorseComponents(
		createWorkhorseFactories(bindingsFor(scope, shared), shared),
	);
	return {
		components,
		actions: createServerThreadLinkActions({
			coordinator: scope.session.components.coordinator,
			identity: shared.identity,
			workhorse: components.workhorse,
			threadLink: shared.threadLink,
			contextDelivery: components.contextDelivery,
			key: scope.key,
			claimThread: scope.claimThread,
			claimCoordinatorThread: scope.claimCoordinatorThread,
			retireThread: scope.retireThread,
		}),
	};
}

export { buildProductionTabSession, buildProductionWorkhorse };
