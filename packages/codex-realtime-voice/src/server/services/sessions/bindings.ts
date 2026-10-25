import { createVoiceToolset, type VoiceToolset } from "#runtime/rules/host/toolset.ts";
// What each owner of one tab session, and of each of its workhorses, is configured with: where it
// works, what it is bound to, read at the moment it asks, and the context its operations run
// under.

import {
	createCoordinatorCallbackContextPort,
	createCoordinatorCallbackRealtimePort,
} from "#runtime/services/coordinator-callbacks/realtime.ts";
import type { CodexWorkbenchSharedComponents } from "#server/services/generation/lifecycle.ts";
import type {
	CodexWorkbenchSessionBindings,
	CodexWorkbenchWorkhorseBindings,
} from "#server/protocol/generation/contract.ts";
import {
	allNamed,
	currentOperationBinding,
	currentRealtimeGeneration,
	requireCreated,
} from "#server/services/generation/owners.ts";
import { createOutcomeReportPort } from "#server/services/voice/outcome-report.ts";
import {
	readyCoordinatorThread,
	readyThreadPair,
	workhorseLink,
} from "#server/services/generation/binding-readers.ts";
import type {
	CodexWorkbenchTabSessionScope,
	CodexWorkbenchWorkhorseComponents,
	CodexWorkbenchWorkhorseScope,
} from "#server/services/sessions/sessions.ts";
import type { CodexWorkbenchServer } from "#server/protocol/generation/host.ts";
import { isUnattended } from "#server/services/voice/narrative.ts";
import {
	readyDelegatedWorkhorse,
	workhorseOfCheckout,
} from "#server/services/sessions/checkouts.ts";

/** What building one tab session's bindings needs from around it. */
interface SessionBindingContext {
	readonly scope: CodexWorkbenchTabSessionScope;
	readonly server: CodexWorkbenchServer;
	readonly shared: CodexWorkbenchSharedComponents;
	/** The directory of its own the coordinator works in, which is no checkout (ADR 0050). */
	readonly coordinatorDirectory: string;
	/** Tell every browser projection listener that something it shows has changed. */
	readonly publishProjection: () => void;
}

/** What building one workhorse's bindings needs from around it. */
interface WorkhorseBindingContext {
	readonly scope: CodexWorkbenchWorkhorseScope;
	readonly server: CodexWorkbenchServer;
	readonly shared: CodexWorkbenchSharedComponents;
}

/** Which workhorse an operation belongs to: its tab session, its checkout and its link key. */
interface WorkhorseOwner {
	readonly tabSessionId: CodexWorkbenchTabSessionScope["id"];
	readonly checkout: string;
	readonly key: string;
}

/**
 * The tab session, checkout, child epoch and thread a workhorse operation is proven to be
 * running against, refused when any of them is unnamed.
 *
 * No browser command started it, so it names no exact pane: it presents
 * through a pane of the session that started it.
 * @param owner The workhorse's tab session, checkout and link key.
 * @param workhorse What starts the workhorse's thread, which says where it is.
 * @returns The target.
 */
function provenWorkhorseTarget(
	owner: WorkhorseOwner,
	workhorse: CodexWorkbenchWorkhorseComponents["workhorse"],
): Parameters<CodexWorkbenchServer["host"]["contextForOperation"]>[0] {
	const snapshot = workhorse.snapshot();
	const { childId, epoch, threadId } = snapshot;
	const target = { childId, epoch, threadId };
	if (snapshot.state !== "ready" || snapshot.linkKey !== owner.key || !allNamed(target)) {
		throw new Error("A workhorse operation has no exact proven workhorse target.");
	}
	return {
		...target,
		tabSessionId: owner.tabSessionId,
		checkout: owner.checkout,
		clientId: null,
		...(snapshot.binding ? { linkRevision: snapshot.binding.revision } : {}),
	};
}

/**
 * The bindings of a tab session's voice: what it is bound to, reads fresh and follows.
 * @param context What the session provides.
 * @returns Those bindings.
 */
function voiceBindings(
	context: SessionBindingContext,
): Pick<CodexWorkbenchSessionBindings, "realtime" | "coordinator"> {
	const { server, scope } = context;
	return {
		/**
		 * What the voice session is bound to, and how it reads a fresh brief.
		 * @param created What the session has built so far.
		 * @returns The realtime binding.
		 */
		realtime: (created) => ({
			coordinatorContext: server.host.coordinatorContextFor(scope.id),
			voice: server.host.voiceFor(scope.id),
			trace: scope.state.voiceTrace.note,
			/**
			 * The child epoch and threads a voice session may be opened against: the coordinator's,
			 * and that of the workhorse of the checkout voice starts from.
			 * @returns The binding, or null while nothing is ready.
			 */
			currentBinding: () => {
				const pair = readyThreadPair(
					scope.voiceWorkhorse()?.components.workhorse,
					created.coordinator,
				);
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
		 * The directory the coordinator runs in. It is its own and holds no vault, so a command
		 * the coordinator runs without `-C` is refused rather than reading some checkout's boards.
		 * It inherits nothing: every child epoch starts its coordinators afresh (ADR 0019).
		 * @returns The coordinator binding.
		 */
		coordinator: () => ({
			workingDirectory: context.coordinatorDirectory,
			profile: server.host.instructions.coordinator,
		}),
	};
}

/**
 * The bindings of what a coordinator tool call and a spoken approval are answered through.
 * @param context What the session provides.
 * @returns Those bindings.
 */
function coordinatorBindings(
	context: SessionBindingContext,
): Pick<CodexWorkbenchSessionBindings, "spokenApproval" | "coordinatorTools" | "coordinatorCall"> {
	const { shared, scope, server } = context;
	const { state } = scope;
	let toolset: VoiceToolset | null = null;
	/**
	 * The host's built-in namespaces, filled once on first use.
	 * @returns The toolset.
	 */
	const tools = (): VoiceToolset =>
		(toolset ??= createVoiceToolset(server.host.instructions.coordinator.identity));
	return {
		/**
		 * What a spoken approval is answered through.
		 * @param created What the session has built so far.
		 * @returns The spoken approval binding.
		 */
		spokenApproval: (created) => ({
			tools: tools(),
			productName: server.host.instructions.coordinator.identity.productName,
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
		 * What a coordinator tool call may act as, and the workhorse of each checkout it names.
		 * @param created What the session has built so far.
		 * @returns The coordinator tools binding.
		 */
		coordinatorTools: (created) => ({
			tools: tools(),
			authority: {
				/**
				 * The coordinator as it stands now.
				 * @returns Its snapshot, or null before one exists.
				 */
				currentCoordinator: () => created.coordinator?.snapshot() ?? null,
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
			/**
			 * The workhorse of the checkout a call names, and the binding it shares with the
			 * coordinator. A checkout this tab has no workhorse in has none.
			 * @param checkout The checkout as the call names it.
			 * @returns The workhorse, or null.
			 */
			workhorseFor: (checkout) => {
				const workhorse = workhorseOfCheckout(
					scope.workhorses(),
					checkout,
					server.host.resolveCheckout,
				);
				if (workhorse === null) {
					return null;
				}
				return {
					/**
					 * The operation binding the coordinator and this workhorse share now.
					 * @returns The binding, or null while they share none.
					 */
					binding: () =>
						currentOperationBinding(
							{ workhorse: workhorse.components.workhorse, coordinator: created.coordinator },
							shared.epoch,
						),
					operations: workhorse.components.operations,
				};
			},
			/**
			 * Stop every workhorse of this tab session: a spoken stop speaks for the whole app.
			 * @returns What each one did.
			 */
			stopWork: () => scope.stopWork(null),
		}),
		coordinatorCall: {
			/**
			 * Run one coordinator call, publishing it as the call in flight for as long as it runs
			 * so every owner that asks sees the same one. A delegation to a checkout that has no
			 * workhorse that can run turns starts it first, so the work has somewhere to go.
			 * @param request The call.
			 * @param operation What it does.
			 * @returns Whatever the operation produced.
			 */
			run: async (request, operation) => {
				await readyDelegatedWorkhorse(
					request,
					tools(),
					scope.workhorse,
					context.server.host.resolveCheckout,
				);
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
 * The bindings the session's callbacks are built from.
 * @param context What the session provides.
 * @returns Those bindings.
 */
function callbackBindings(
	context: SessionBindingContext,
): Pick<CodexWorkbenchSessionBindings, "callbacks"> {
	const { server, shared, scope } = context;
	const { identity, epoch, session } = shared;
	return {
		/**
		 * What the coordinator's callbacks are correlated against.
		 * @param created What the session has built so far.
		 * @returns The callbacks binding.
		 */
		callbacks: (created) => ({
			operations: scope.workhorseOperations,
			realtime: createCoordinatorCallbackRealtimePort({
				session,
				/**
				 * The voice generation a callback is delivered under.
				 * @returns The generation, or null.
				 */
				currentGeneration: () => currentRealtimeGeneration(created),
			}),
			/**
			 * The child epoch this generation runs under.
			 * @returns The child and epoch.
			 */
			currentChild: () => ({
				childId: identity.identity.validator.childId,
				epoch: identity.identity.validator.epoch,
			}),
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
			 * The link of every workhorse of the tab a callback can report against: each one that is
			 * ready and bound, with the checkout it works in.
			 * @returns The links.
			 */
			workhorseLinks: () =>
				scope.workhorses().flatMap((workhorse) => {
					const link = workhorseLink(workhorse, epoch.assertCurrent);
					return link === null ? [] : [link];
				}),
			/**
			 * The voice generation a callback is correlated against.
			 * @returns The generation, or null.
			 */
			currentRealtimeGeneration: () => currentRealtimeGeneration(created),
			coordinatorContext: createCoordinatorCallbackContextPort(session),
			coordinatorTurn: createOutcomeReportPort({
				contextCodec: server.host.contextCodec,
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
				 * The canonical context of an outcome report, through an open pane of the tab and the
				 * workhorse voice is bound to.
				 * @param operationId The minted operation identity.
				 * @returns The context.
				 */
				contextFor: (operationId) => {
					const voiced = scope.voiceWorkhorse();
					if (voiced === null) {
						throw new Error("An outcome report has no workhorse voice is bound to.");
					}
					return server.host.contextForOperation(
						provenWorkhorseTarget(
							{ tabSessionId: scope.id, checkout: voiced.checkout, key: voiced.key },
							voiced.components.workhorse,
						),
						{ id: operationId, kind: "workhorse_outcome_report", rpc: "turn/start" },
					);
				},
				/**
				 * Whether nobody listens live to the voice, which then hears no outcome.
				 * @returns True while the live session is unattended.
				 */
				unattended: () =>
					isUnattended(server.host.narrative, created.realtime?.narrative() ?? null),
			}),
			/** Publish what a settled callback changed. */
			onSettled: () => {
				context.publishProjection();
			},
		}),
	};
}

/**
 * Compose one tab session's bindings: where its coordinator works, what its voice reads as bound,
 * and how its callbacks deliver.
 * @param context What the session provides.
 * @returns The bindings.
 */
function createSessionBindings(context: SessionBindingContext): CodexWorkbenchSessionBindings {
	return {
		...voiceBindings(context),
		...coordinatorBindings(context),
		...callbackBindings(context),
		...(context.server.host.narrative === undefined
			? {}
			: { narrative: context.server.host.narrative }),
	};
}

/**
 * Compose one workhorse's bindings: the checkout it works in, how it is told a context change,
 * and the binding its queue and operations run under.
 * @param context What the workhorse provides.
 * @returns The bindings.
 */
function createWorkhorseBindings(
	context: WorkhorseBindingContext,
): CodexWorkbenchWorkhorseBindings {
	const { server, shared, scope } = context;
	const { identity, epoch } = shared;
	const tab = scope.session;
	/**
	 * The child epoch and threads this workhorse and the tab's coordinator run on together.
	 * @param created What the workhorse has built so far.
	 * @returns The pair, or null while either is not ready.
	 */
	const pair = (created: Parameters<CodexWorkbenchWorkhorseBindings["queue"]>[0]) =>
		readyThreadPair(created.workhorse, tab.components.coordinator);
	return {
		/**
		 * The checkout a turn of this workhorse runs in (ADR 0050).
		 * @returns The workhorse binding.
		 */
		workhorse: () => ({
			checkoutRoot: scope.checkout,
			profile: server.host.instructions.workhorse,
		}),
		/**
		 * How a context change is delivered into this workhorse.
		 * @returns The delivery binding.
		 */
		contextDelivery: () => ({
			contextCodec: server.host.contextCodec,
			/**
			 * The coordinator paired with this workhorse.
			 * @returns Its thread, or null when none is ready.
			 */
			pairedThreadId: () => readyCoordinatorThread(tab.components.coordinator),
			/**
			 * The clock delivery freshness is measured against.
			 * @returns Now, in milliseconds.
			 */
			now: () => Date.now(),
			/**
			 * The child epoch this generation runs under.
			 * @returns The child and epoch.
			 */
			currentExecution: () => ({
				childId: identity.identity.validator.childId,
				epoch: identity.identity.validator.epoch,
			}),
			/**
			 * Close the epoch store, which retires the epoch itself.
			 * @returns Whatever closing it returns.
			 */
			retireEpoch: () => epoch.close(),
		}),
		/**
		 * What this workhorse's queue is bound to.
		 * @param created What the workhorse has built so far.
		 * @returns The queue binding.
		 */
		queue: (created) => ({
			/**
			 * The child epoch and threads the queue runs turns against.
			 * @returns The binding, or null while nothing is ready.
			 */
			currentBinding: () => {
				const ready = pair(created);
				if (ready === null) {
					return null;
				}
				return {
					childId: ready.childId,
					epoch: ready.epoch,
					coordinatorThreadId: ready.coordinatorThreadId,
					workhorseThreadId: ready.workhorseThreadId,
				};
			},
		}),
		/**
		 * What an operation of this workhorse is bound to, and the context it runs under.
		 * @param created What the workhorse has built so far.
		 * @returns The operations binding.
		 */
		operations: (created) => ({
			tools: createVoiceToolset(server.host.instructions.workhorse.identity),
			contextCodec: server.host.contextCodec,
			/**
			 * The operation binding the coordinator and this workhorse share.
			 * @returns The binding, or null while they share none.
			 */
			currentBinding: () =>
				currentOperationBinding(
					{ workhorse: created.workhorse, coordinator: tab.components.coordinator },
					epoch,
				),
			/**
			 * The coordinator call in flight, when one is.
			 * @returns The call, or null.
			 */
			currentCoordinatorCall: () => tab.state.currentCoordinatorCall,
			/**
			 * The canonical context one operation runs under, captured against the thread it is
			 * proven to run on, through an open pane of the tab.
			 * @param operation The operation.
			 * @returns The context.
			 */
			contextFor: (operation) =>
				server.host.contextForOperation(
					provenWorkhorseTarget(
						{ tabSessionId: tab.id, checkout: scope.checkout, key: scope.key },
						requireCreated(created, "workhorse"),
					),
					{ id: operation.operationId, kind: operation.kind, rpc: operation.rpc },
				),
		}),
	};
}

export {
	createSessionBindings,
	createWorkhorseBindings,
	type SessionBindingContext,
	type WorkhorseBindingContext,
};
