// What each owner of one tab session is configured with: where it works, what it is bound to,
// read at the moment it asks, and the context its operations run under.

import { readBoardCatalogue, watchBoardCatalogue } from "@/runtime/engine/board-catalogue";
import { createCoordinatorCallbackRealtimePort } from "@/runtime/codex-coordinator-callbacks";
import type { CodexWorkbenchSharedComponents } from "@/server/archboard/lib/codex-workbench-generation-lifecycle";
import type { CodexWorkbenchSessionBindings } from "@/server/archboard/lib/codex-workbench-contract";
import {
	allNamed,
	currentOperationBinding,
	currentRealtimeGeneration,
	requireCreated,
} from "@/server/archboard/lib/codex-workbench-generation-owners";
import { createOutcomeReportPort } from "@/server/archboard/lib/codex-workbench-outcome-report";
import { voiceStartTrace } from "@/server/archboard/lib/voice-start-trace";
import {
	readyCoordinatorThread,
	readyThreadPair,
	workhorseLink,
} from "@/server/archboard/lib/codex-workbench-binding-readers";
import type {
	CodexWorkbenchSessionComponents,
	CodexWorkbenchTabSessionState,
} from "@/server/archboard/lib/codex-workbench-sessions";
import type { CodexWorkbenchServer } from "@/server/archboard/lib/codex-workbench-server";

/** What building one tab session's bindings needs from around it. */
interface SessionBindingContext {
	readonly server: CodexWorkbenchServer;
	readonly shared: CodexWorkbenchSharedComponents;
	readonly state: CodexWorkbenchTabSessionState;
	/** Tell every browser projection listener that something it shows has changed. */
	readonly publishProjection: () => void;
}

/**
 * The child epoch and thread a workhorse operation is proven to be running
 * against, refused when any of them is unnamed.
 *
 * No browser command started it, so it names no exact pane: it presents
 * through the pane that created the link while that pane is open, and through
 * another once it closes, since the conversation belongs to the server.
 * @param workhorse The workhorse snapshot.
 * @returns The target.
 */
function provenWorkhorseTarget(
	workhorse: ReturnType<CodexWorkbenchSessionComponents["workhorse"]["snapshot"]>,
): Parameters<CodexWorkbenchServer["contextForOperation"]>[0] {
	const { paneId, childId, epoch, threadId } = workhorse;
	const target = { paneId, childId, epoch, threadId };
	if (workhorse.state !== "ready" || !allNamed(target)) {
		throw new Error("A workhorse operation has no exact proven pane target.");
	}
	return {
		...target,
		clientId: null,
		...(workhorse.binding ? { linkRevision: workhorse.binding.revision } : {}),
	};
}

/**
 * The bindings that say where the session's workhorse, publisher and coordinator work.
 * @param context What the session provides.
 * @returns Those bindings.
 */
function placeBindings(
	context: SessionBindingContext,
): Pick<CodexWorkbenchSessionBindings, "workhorse" | "semanticPublisher" | "coordinator"> {
	const { server } = context;
	return {
		/**
		 * The checkout a workhorse turn runs in.
		 * @returns The workhorse binding.
		 */
		workhorse: () => ({ checkoutRoot: server.checkoutRoot }),
		/**
		 * Where semantic context is published from, which is the server itself.
		 * @returns The publisher options.
		 */
		semanticPublisher: () => server.semanticPublisher,
		/**
		 * The checkout the coordinator runs in. It inherits nothing: every child
		 * epoch starts its coordinators afresh (ADR 0019).
		 * @returns The coordinator binding.
		 */
		coordinator: () => ({ checkoutRoot: server.checkoutRoot }),
	};
}

/**
 * The bindings that report what the session is currently bound to: the voice
 * session's target, the queue's target, the operation the workhorse is running,
 * and the coordinator call in flight.
 * @param context What the session provides.
 * @returns Those bindings.
 */
function currentBindingReaders(
	context: SessionBindingContext,
): Pick<
	CodexWorkbenchSessionBindings,
	"realtime" | "queue" | "operations" | "spokenApproval" | "coordinatorTools" | "coordinatorCall"
> {
	const { server, shared, state } = context;
	return {
		/**
		 * What the voice session is bound to, and how it reads a fresh brief.
		 * @param created What the session has built so far.
		 * @returns The realtime binding.
		 */
		realtime: (created) => ({
			boardCatalogue: { read: readBoardCatalogue, subscribe: watchBoardCatalogue },
			presentationChanges: { subscribe: server.narrationChanges },
			trace: voiceStartTrace.note,
			/**
			 * The semantic brief one voice session opens with, read fresh and
			 * stated against that session rather than whatever is current.
			 * @param wireSessionId The session it is for.
			 * @returns The brief.
			 */
			freshSemanticBrief: (wireSessionId) => {
				const freshInput = server.semanticPublisher.fresh.read();
				return requireCreated(created, "semanticPublisher").freshBriefFor({
					...freshInput,
					coordinator: {
						threadId: freshInput.coordinator?.threadId ?? null,
						realtimeSessionId: wireSessionId,
					},
				}).brief;
			},
			/**
			 * The child epoch and threads a voice session may be opened against.
			 * @returns The binding, or null while nothing is ready.
			 */
			currentBinding: () => {
				const pair = readyThreadPair(created);
				if (pair === null) {
					return null;
				}
				return {
					child: pair.childId,
					epoch: pair.epoch,
					linkedThreadId: pair.workhorseThreadId,
					coordinatorThreadId: pair.coordinatorThreadId,
				};
			},
		}),
		/**
		 * What the workhorse queue is bound to.
		 * @param created What the session has built so far.
		 * @returns The queue binding.
		 */
		queue: (created) => ({
			/**
			 * The child epoch and threads the queue runs turns against.
			 * @returns The binding, or null while nothing is ready.
			 */
			currentBinding: () => {
				const pair = readyThreadPair(created);
				if (pair === null) {
					return null;
				}
				return {
					childId: pair.childId,
					epoch: pair.epoch,
					coordinatorThreadId: pair.coordinatorThreadId,
					workhorseThreadId: pair.workhorseThreadId,
				};
			},
		}),
		/**
		 * What a workhorse operation is bound to, and the context it runs under.
		 * @param created What the session has built so far.
		 * @returns The operations binding.
		 */
		operations: (created) => ({
			/**
			 * The operation binding the coordinator and workhorse share.
			 * @returns The binding, or null while they share none.
			 */
			currentBinding: () => currentOperationBinding(created, shared.epoch),
			/**
			 * The coordinator call in flight, when one is.
			 * @returns The call, or null.
			 */
			currentCoordinatorCall: () => state.currentCoordinatorCall,
			/**
			 * The canonical context one workhorse operation runs under, captured
			 * against the thread it is proven to run on, through an open pane.
			 * @param operation The operation.
			 * @returns The context.
			 */
			contextFor: (operation) => {
				const workhorse = requireCreated(created, "workhorse").snapshot();
				const target = provenWorkhorseTarget(workhorse);
				return server.contextForOperation(target, {
					id: operation.operationId,
					kind: operation.kind,
					rpc: operation.rpc,
				});
			},
		}),
		/**
		 * What a spoken approval is answered through.
		 * @param created What the session has built so far.
		 * @returns The spoken approval binding.
		 */
		spokenApproval: (created) => ({
			/**
			 * The voice session a spoken approval may be answered on.
			 * @returns The session, or null while none is running.
			 */
			currentRealtime: () => {
				const generation = currentRealtimeGeneration(created);
				if (generation === null) {
					return null;
				}
				return {
					sessionId: generation.browserSessionId,
					correlationId: generation.browserCorrelationId,
				};
			},
			/** Publish what a spoken approval changed. */
			onChange: () => {
				context.publishProjection();
			},
		}),
		/**
		 * What a coordinator tool call may act as.
		 * @param created What the session has built so far.
		 * @returns The coordinator tools binding.
		 */
		coordinatorTools: (created) => ({
			authority: {
				/**
				 * The coordinator as it stands now.
				 * @returns Its snapshot, or null before one exists.
				 */
				currentCoordinator: () => created.coordinator?.snapshot() ?? null,
				/**
				 * The operation binding a coordinator tool call may act within.
				 * @returns The binding, or null.
				 */
				currentWorkhorseBinding: () => currentOperationBinding(created, shared.epoch),
				/**
				 * The coordinator call in flight.
				 * @returns The call, or null.
				 */
				currentCall: () => state.currentCoordinatorCall,
				/**
				 * The turn that call is expected to be running.
				 * @returns The turn, or null.
				 */
				expectedTurnId: () => state.currentCoordinatorCall?.turnId ?? null,
			},
		}),
		coordinatorCall: {
			/**
			 * Run one coordinator call, publishing it as the call in flight for as
			 * long as it runs so every owner that asks sees the same one.
			 * @param request The call.
			 * @param operation What it does.
			 * @returns Whatever the operation produced.
			 */
			run: async (request, operation) => {
				state.currentCoordinatorCall = request.logicalCall;
				try {
					return await operation();
				} finally {
					if (state.currentCoordinatorCall === request.logicalCall) {
						state.currentCoordinatorCall = null;
					}
				}
			},
		},
	};
}

/**
 * The bindings the session's delivery and callback owners are built from.
 * @param context What the session provides.
 * @returns Those bindings.
 */
function deliveryBindings(
	context: SessionBindingContext,
): Pick<CodexWorkbenchSessionBindings, "semanticDelivery" | "callbacks"> {
	const { server, shared } = context;
	const { identity, epoch, session } = shared;
	/**
	 * The child epoch this generation runs under.
	 * @returns The child and epoch.
	 */
	const currentChild = () => ({
		childId: identity.identity.validator.childId,
		epoch: identity.identity.validator.epoch,
	});
	return {
		/**
		 * How semantic context is delivered into this session's workhorse.
		 * @param created What the session has built so far.
		 * @returns The delivery binding.
		 */
		semanticDelivery: (created) => ({
			feedId: server.semanticPublisher.feedId,
			/**
			 * The coordinator paired with this delivery's workhorse.
			 * @returns Its thread, or null when none is ready.
			 */
			pairedThreadId: () => readyCoordinatorThread(created),
			/**
			 * The clock delivery freshness is measured against.
			 * @returns Now, in milliseconds.
			 */
			now: () => Date.now(),
			publisher: requireCreated(created, "semanticPublisher"),
			currentExecution: currentChild,
			hooks: {
				/**
				 * The canonical context one settled change is delivered as.
				 * @param event The settled change.
				 * @param binding The pane it is delivered to.
				 * @returns The context.
				 */
				contextForEvent: (event, binding) => server.contextForEvent(event, binding.paneId),
			},
			/**
			 * Close the epoch store, which retires the epoch itself.
			 * @returns Whatever closing it returns.
			 */
			retireEpoch: () => epoch.close(),
		}),
		/**
		 * What the coordinator's callbacks are correlated against.
		 * @param created What the session has built so far.
		 * @returns The callbacks binding.
		 */
		callbacks: (created) => ({
			semantic: requireCreated(created, "semanticPublisher"),
			realtime: createCoordinatorCallbackRealtimePort({
				session,
				/**
				 * The voice generation a callback is delivered under.
				 * @returns The generation, or null.
				 */
				currentGeneration: () => currentRealtimeGeneration(created),
			}),
			currentChild,
			/**
			 * The coordinator a callback is delivered to, once it is ready and
			 * names its own thread and child epoch.
			 * @returns The coordinator, or null.
			 */
			currentCoordinator: () => {
				const snapshot = created.coordinator?.snapshot();
				if (snapshot?.state !== "ready") {
					return null;
				}
				const { threadId, childId, epoch: coordinatorEpoch } = snapshot;
				const named = { threadId, childId, epoch: coordinatorEpoch };
				return allNamed(named) ? { ...snapshot, state: "ready" as const, ...named } : null;
			},
			/**
			 * The workhorse link a callback reports against, once the workhorse is
			 * ready and bound.
			 * @returns The link, or null.
			 */
			currentWorkhorseLink: () => workhorseLink(created, epoch.assertCurrent),
			/**
			 * The voice generation a callback is correlated against.
			 * @returns The generation, or null.
			 */
			currentRealtimeGeneration: () => currentRealtimeGeneration(created),
			coordinatorTurn: createOutcomeReportPort({
				session,
				/**
				 * Mint the operation identity an outcome report runs under.
				 * @returns Its wire spelling.
				 */
				issue: () =>
					identity.operation.decoder.serializeOperationId(
						identity.operation.issuer.mintOperationId(),
					),
				/**
				 * The canonical context of an outcome report, through an open pane.
				 * @param operationId The minted operation identity.
				 * @returns The context.
				 */
				contextFor: (operationId) =>
					server.contextForOperation(
						provenWorkhorseTarget(requireCreated(created, "workhorse").snapshot()),
						{ id: operationId, kind: "workhorse_outcome_report", rpc: "turn/start" },
					),
				/**
				 * Whether a recording holds the voice, which nobody hears an outcome through.
				 * @returns True while the live session is a recording's.
				 */
				recording: () => created.realtime?.presentation()?.recording === true,
			}),
			/** Publish what a settled callback changed. */
			onSettled: () => {
				context.publishProjection();
			},
		}),
	};
}

/**
 * Compose one tab session's bindings: where it works, what it reads as bound,
 * and how it delivers.
 * @param context What the session provides.
 * @returns The bindings.
 */
function createSessionBindings(context: SessionBindingContext): CodexWorkbenchSessionBindings {
	return {
		...placeBindings(context),
		...currentBindingReaders(context),
		...deliveryBindings(context),
	};
}

export { createSessionBindings, type SessionBindingContext };
