import { createCoordinatorCallbackRealtimePort } from "@/runtime/codex-coordinator-callbacks";
import type { createCodexWaitGraph } from "@/runtime/codex-wait-graph";
import type {
	CodexWorkbenchComponents,
	CodexWorkbenchGenerationInput,
	ProductionCodexWorkbenchBindings,
} from "@/server/canvas/lib/codex-workbench";
import { createCanvasDynamicOperationIdAdapter } from "@/server/canvas/lib/codex-workbench-operation-lifecycle";
import {
	allNamed,
	currentOperationBinding,
	currentRealtimeGeneration,
	requireCreated,
	type GenerationOwners,
} from "@/server/canvas/lib/codex-workbench-generation-owners";
import {
	requireDynamicOwners,
	type DynamicOwnerContext,
} from "@/server/canvas/lib/codex-workbench-dynamic-owners";
import { createGatewayBinding } from "@/server/canvas/lib/codex-workbench-gateway-binding";
import type {
	CanvasCodexWorkbenchHost,
	CodexWorkbenchStorage,
} from "@/server/canvas/lib/codex-workbench-host";

/** What building one generation's bindings needs from around it. */
interface BindingContext {
	readonly host: CanvasCodexWorkbenchHost;
	readonly storage: CodexWorkbenchStorage;
	readonly waitGraph: ReturnType<typeof createCodexWaitGraph>;
	readonly input: CodexWorkbenchGenerationInput;
	readonly owners: GenerationOwners;
}

/**
 * Tell every browser projection listener that something it shows has changed,
 * while a projection is installed.
 * @param owners The generation's record.
 */
function publishProjection(owners: GenerationOwners): void {
	if (!owners.approvalProjectionInstalled) return;
	for (const listener of owners.projectionListeners) listener();
}

/**
 * The thread the coordinator is ready on.
 * @param created What the graph has built so far.
 * @returns The thread, or null while it is not ready.
 */
function readyCoordinatorThread(
	created: Readonly<Partial<CodexWorkbenchComponents>>,
): NonNullable<ReturnType<CodexWorkbenchComponents["coordinator"]["snapshot"]>["threadId"]> | null {
	const coordinator = created.coordinator?.snapshot();
	return coordinator?.state === "ready" ? coordinator.threadId : null;
}

/**
 * The child epoch and the two threads a voice or queue binding is stated
 * against, which exists only while both threads are ready.
 * @param created What the graph has built so far.
 * @returns The threads, or null.
 */
function readyThreadPair(created: Readonly<Partial<CodexWorkbenchComponents>>): {
	childId: NonNullable<ReturnType<CodexWorkbenchComponents["workhorse"]["snapshot"]>["childId"]>;
	epoch: NonNullable<ReturnType<CodexWorkbenchComponents["workhorse"]["snapshot"]>["epoch"]>;
	workhorseThreadId: NonNullable<
		ReturnType<CodexWorkbenchComponents["workhorse"]["snapshot"]>["threadId"]
	>;
	coordinatorThreadId: NonNullable<
		ReturnType<CodexWorkbenchComponents["coordinator"]["snapshot"]>["threadId"]
	>;
} | null {
	const workhorse = created.workhorse?.snapshot();
	const coordinatorThreadId = readyCoordinatorThread(created);
	if (workhorse?.state !== "ready" || coordinatorThreadId === null) {
		return null;
	}
	const { childId, epoch, threadId } = workhorse;
	const named = { childId, epoch, threadId };
	if (!allNamed(named)) {
		return null;
	}
	return {
		childId: named.childId,
		epoch: named.epoch,
		workhorseThreadId: named.threadId,
		coordinatorThreadId,
	};
}

/**
 * The bindings the storage-shaped owners are built from: where Codex writes,
 * which child this generation runs against, and which checkout it works in.
 * @param context What the generation provides.
 * @returns Those bindings.
 */
function storageBindings(
	context: BindingContext,
): Pick<
	ProductionCodexWorkbenchBindings,
	| "epoch"
	| "transport"
	| "session"
	| "threadLink"
	| "workhorse"
	| "semanticPublisher"
	| "dynamicTools"
	| "coordinator"
> {
	const { storage, host, input } = context;
	return {
		/**
		 * Where this installation keeps its epoch manifest and Codex storage.
		 * @returns The epoch binding.
		 */
		epoch: () => ({
			rootDirectory: storage.epochRoot,
			codexHome: storage.codexHome,
			sqliteHome: storage.sqliteHome,
		}),
		/**
		 * The child this generation's transport speaks to.
		 * @returns The transport binding.
		 */
		transport: () => ({ child: input.child }),
		/**
		 * Where the session's own storage and configuration live.
		 * @returns The session binding.
		 */
		session: () => ({
			storage: {
				codexHome: storage.codexHome,
				sqliteHome: storage.sqliteHome,
				configPath: storage.configPath,
			},
			checkoutRoot: host.checkoutRoot,
			lifecycle: input.child.lifecycle,
		}),
		/**
		 * How the thread-link owner reads the epoch a link must belong to.
		 * @param created What the graph has built so far.
		 * @returns The thread-link binding.
		 */
		threadLink: (created) => ({
			/**
			 * The epoch now active, which a link is only valid within.
			 * @returns The epoch, or null before one is started.
			 */
			currentEpoch: () => created.epoch?.snapshot().manifest.activeEpoch ?? null,
		}),
		/**
		 * The checkout a workhorse turn runs in.
		 * @returns The workhorse binding.
		 */
		workhorse: () => ({ checkoutRoot: host.checkoutRoot }),
		/**
		 * Where semantic context is published from, which is the canvas itself.
		 * @returns The publisher options.
		 */
		semanticPublisher: () => host.semanticPublisher,
		/**
		 * What the dynamic tools may wait on and work in.
		 * @returns The dynamic tools binding.
		 */
		dynamicTools: () => ({ waitGraph: context.waitGraph, checkoutRoot: host.checkoutRoot }),
		/**
		 * The checkout the coordinator runs in, and whatever state it inherits.
		 * @returns The coordinator binding.
		 */
		coordinator: () => ({
			checkoutRoot: host.checkoutRoot,
			persisted: input.adoptedCoordinator,
		}),
	};
}

/**
 * The pane, child epoch and thread a workhorse operation is proven to be
 * running against, refused when any of them is open.
 * @param workhorse The workhorse snapshot.
 * @returns The target.
 */
function provenWorkhorseTarget(
	workhorse: ReturnType<CodexWorkbenchComponents["workhorse"]["snapshot"]>,
): Parameters<CanvasCodexWorkbenchHost["contextForOperation"]>[0] {
	const { paneId, childId, epoch, threadId } = workhorse;
	const target = { paneId, childId, epoch, threadId };
	if (workhorse.state !== "ready" || !allNamed(target)) {
		throw new Error("A workhorse operation has no exact proven pane target.");
	}
	return {
		...target,
		...(workhorse.binding ? { linkRevision: workhorse.binding.revision } : {}),
	};
}

/**
 * The bindings that report what is currently bound: the voice session's
 * target, the queue's target, the operation the workhorse is running, and the
 * coordinator call in flight.
 * @param context What the generation provides.
 * @returns Those bindings.
 */
function currentBindingReaders(
	context: BindingContext,
): Pick<
	ProductionCodexWorkbenchBindings,
	"realtime" | "queue" | "operations" | "spokenApproval" | "coordinatorTools" | "coordinatorCall"
> {
	const { host, owners } = context;
	return {
		/**
		 * What the voice session is bound to, and how it reads a fresh brief.
		 * @param created What the graph has built so far.
		 * @returns The realtime binding.
		 */
		realtime: (created) => ({
			/**
			 * The semantic brief one voice session opens with, read fresh and
			 * stated against that session rather than whatever is current.
			 * @param wireSessionId The session it is for.
			 * @returns The brief.
			 */
			freshSemanticBrief: (wireSessionId) => {
				const freshInput = host.semanticPublisher.fresh.read();
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
		 * @param created What the graph has built so far.
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
		 * @param created What the graph has built so far.
		 * @returns The operations binding.
		 */
		operations: (created) => ({
			/**
			 * The operation binding the coordinator and workhorse share.
			 * @returns The binding, or null while they share none.
			 */
			currentBinding: () => currentOperationBinding(created),
			/**
			 * The coordinator call in flight, when one is.
			 * @returns The call, or null.
			 */
			currentCoordinatorCall: () => owners.currentCoordinatorCall,
			/**
			 * The canonical context one workhorse operation runs under, captured
			 * against the pane its thread is proven to be linked to.
			 * @param operation The operation.
			 * @returns The context.
			 */
			contextFor: (operation) => {
				const workhorse = requireCreated(created, "workhorse").snapshot();
				const target = provenWorkhorseTarget(workhorse);
				return host.contextForOperation(target, {
					id: operation.operationId,
					kind: operation.kind,
					rpc: operation.rpc,
				});
			},
		}),
		/**
		 * What a spoken approval is answered through.
		 * @param created What the graph has built so far.
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
				publishProjection(owners);
			},
		}),
		/**
		 * What a coordinator tool call may act as.
		 * @param created What the graph has built so far.
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
				currentWorkhorseBinding: () => currentOperationBinding(created),
				/**
				 * The coordinator call in flight.
				 * @returns The call, or null.
				 */
				currentCall: () => owners.currentCoordinatorCall,
				/**
				 * The turn that call is expected to be running.
				 * @returns The turn, or null.
				 */
				expectedTurnId: () => owners.currentCoordinatorCall?.turnId ?? null,
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
				owners.currentCoordinatorCall = request.logicalCall;
				try {
					return await operation();
				} finally {
					if (owners.currentCoordinatorCall === request.logicalCall) {
						owners.currentCoordinatorCall = null;
					}
				}
			},
		},
	};
}

/**
 * The link a callback reports the workhorse against: its binding, and the
 * thread, child epoch and operation it is running.
 * @param created What the graph has built so far.
 * @returns The link, or null while the workhorse is not ready and bound.
 */
function workhorseLink(created: Readonly<Partial<CodexWorkbenchComponents>>): {
	binding: NonNullable<ReturnType<CodexWorkbenchComponents["workhorse"]["snapshot"]>["binding"]>;
	target: {
		threadId: NonNullable<
			ReturnType<CodexWorkbenchComponents["workhorse"]["snapshot"]>["threadId"]
		>;
		childId: NonNullable<ReturnType<CodexWorkbenchComponents["workhorse"]["snapshot"]>["childId"]>;
		epoch: NonNullable<ReturnType<CodexWorkbenchComponents["workhorse"]["snapshot"]>["epoch"]>;
		operationId: NonNullable<
			ReturnType<CodexWorkbenchComponents["workhorse"]["snapshot"]>["operationId"]
		>;
	};
} | null {
	const workhorse = created.workhorse?.snapshot();
	if (workhorse?.state !== "ready" || workhorse.binding === null) {
		return null;
	}
	const { threadId, childId, epoch, operationId } = workhorse;
	const target = { threadId, childId, epoch, operationId };
	return allNamed(target) ? { binding: workhorse.binding, target } : null;
}

/**
 * The bindings the approval, delivery and callback owners are built from.
 * @param context What the generation provides.
 * @returns Those bindings.
 */
function deliveryBindings(
	context: BindingContext,
): Pick<
	ProductionCodexWorkbenchBindings,
	"approvals" | "semanticDelivery" | "callbacks" | "dynamicAdapters"
> {
	const { host, owners } = context;
	const dynamicContext: DynamicOwnerContext = {
		host,
		waitGraph: context.waitGraph,
		input: context.input,
		owners,
	};
	return {
		/**
		 * How ordinary approvals are linked to the pane that must answer them.
		 * @param created What the graph has built so far.
		 * @returns The approvals binding.
		 */
		approvals: (created) => ({
			onError: host.onFatal,
			/**
			 * The pane one approval belongs to, which is the pane the semantic
			 * delivery is bound to when that binding names the same thread.
			 * @param request The approval request.
			 * @returns The link, or none.
			 */
			getCurrentBinding: (request) => {
				const binding = created.semanticDelivery?.snapshot().binding ?? null;
				return binding?.target.threadId === request.threadId
					? { link: `pane:${binding.paneId}` }
					: { link: null };
			},
			/** Publish what an approval changed. */
			onChange: () => {
				publishProjection(owners);
			},
		}),
		/**
		 * How semantic context is delivered into this generation's threads.
		 * @param created What the graph has built so far.
		 * @returns The delivery binding.
		 */
		semanticDelivery: (created) => ({
			feedId: host.semanticPublisher.feedId,
			/**
			 * The clock delivery freshness is measured against.
			 * @returns Now, in milliseconds.
			 */
			now: () => Date.now(),
			publisher: requireCreated(created, "semanticPublisher"),
			/**
			 * The child epoch delivery is running under.
			 * @returns The child and epoch.
			 */
			currentExecution: () => ({
				childId: requireCreated(created, "identity").identity.validator.childId,
				epoch: requireCreated(created, "identity").identity.validator.epoch,
			}),
			hooks: {
				/**
				 * The canonical context one settled change is delivered as.
				 * @param event The settled change.
				 * @param binding The pane it is delivered to.
				 * @returns The context.
				 */
				contextForEvent: (event, binding) => host.contextForEvent(event, binding.paneId),
			},
			/**
			 * Close the epoch store, which retires the epoch itself.
			 * @returns Whatever closing it returns.
			 */
			retireEpoch: () => requireCreated(created, "epoch").close(),
		}),
		/**
		 * What the coordinator's callbacks are correlated against.
		 * @param created What the graph has built so far.
		 * @returns The callbacks binding.
		 */
		callbacks: (created) => ({
			semantic: requireCreated(created, "semanticPublisher"),
			realtime: createCoordinatorCallbackRealtimePort({
				session: requireCreated(created, "session"),
				/**
				 * The voice generation a callback is delivered under.
				 * @returns The generation, or null.
				 */
				currentGeneration: () => currentRealtimeGeneration(created),
			}),
			/**
			 * The child epoch a callback belongs to.
			 * @returns The child and epoch.
			 */
			currentChild: () => ({
				childId: requireCreated(created, "identity").identity.validator.childId,
				epoch: requireCreated(created, "identity").identity.validator.epoch,
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
				const { threadId, childId, epoch } = snapshot;
				const named = { threadId, childId, epoch };
				return allNamed(named) ? { ...snapshot, state: "ready" as const, ...named } : null;
			},
			/**
			 * The workhorse link a callback reports against, once the workhorse is
			 * ready and bound.
			 * @returns The link, or null.
			 */
			currentWorkhorseLink: () => workhorseLink(created),
			/**
			 * The voice generation a callback is correlated against.
			 * @returns The generation, or null.
			 */
			currentRealtimeGeneration: () => currentRealtimeGeneration(created),
			/** Publish what a settled callback changed. */
			onSettled: () => {
				publishProjection(owners);
			},
		}),
		dynamicAdapters: {
			/**
			 * The coordination approval port dynamic effects ask through.
			 * @param created What the graph has built so far.
			 * @returns The port.
			 */
			approval: (created) => requireDynamicOwners(dynamicContext, created).approval.port,
			/**
			 * The thread authority a dynamic effect runs under.
			 * @param created What the graph has built so far.
			 * @returns The authority.
			 */
			threadAuthority: (created) => requireDynamicOwners(dynamicContext, created).authority.thread,
			/**
			 * The context authority a dynamic effect captures through.
			 * @param created What the graph has built so far.
			 * @returns The authority.
			 */
			context: (created) => requireDynamicOwners(dynamicContext, created).authority.context,
			/**
			 * How a dynamic effect mints its operation id.
			 * @param created What the graph has built so far.
			 * @returns The adapter.
			 */
			operationId: (created) => {
				if (created.identity === undefined) {
					throw new Error("Operation authority is not ready.");
				}
				return createCanvasDynamicOperationIdAdapter(created.identity.operation);
			},
			/**
			 * The wait and quarantine port a dynamic effect uses.
			 * @param created What the graph has built so far.
			 * @returns The port.
			 */
			lifecycle: (created) => requireDynamicOwners(dynamicContext, created).lifecycle.port,
		},
	};
}

/**
 * Everything one production generation is built from: where it stores things,
 * what it is currently bound to, how it delivers and approves, and how it
 * serves browsers.
 * @param context What the generation provides.
 * @returns The bindings.
 */
function createProductionBindings(context: BindingContext): ProductionCodexWorkbenchBindings {
	return {
		...storageBindings(context),
		...currentBindingReaders(context),
		...deliveryBindings(context),
		gateway: createGatewayBinding(context),
	};
}

export { createProductionBindings, publishProjection };
export type { BindingContext };
