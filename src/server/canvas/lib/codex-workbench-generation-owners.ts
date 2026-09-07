import type { CodexRealtimeGeneration } from "@/runtime/codex-realtime";
import type { TransportServerNotification } from "@/runtime/codex-transport";
import type { LogicalToolCallCorrelation } from "@/shared/codex-workbench-identity";
import type { WorkhorseOperationBinding } from "@/runtime/codex-workhorse-operations";
import type {
	CodexWorkbenchComponents,
	CodexWorkbenchGenerationInput,
} from "@/server/canvas/lib/codex-workbench";
import type { CanvasBrowserBindingState } from "@/server/canvas/lib/codex-workbench-browser-gateway";
import type { CanvasDynamicApprovalOwner } from "@/server/canvas/lib/codex-workbench-approvals";
import type { CanvasDynamicAuthorityAdapters } from "@/server/canvas/lib/codex-workbench-authority";
import type { CanvasDynamicLifecycleOwner } from "@/server/canvas/lib/codex-workbench-operation-lifecycle";
import type { CanvasTimelineOwner } from "@/server/canvas/lib/codex-workbench-timeline";

/** Everything one generation owns beyond the component graph itself. */
interface GenerationOwners {
	approval: CanvasDynamicApprovalOwner | null;
	authority: CanvasDynamicAuthorityAdapters | null;
	lifecycle: CanvasDynamicLifecycleOwner | null;
	currentCoordinatorCall: LogicalToolCallCorrelation | null;
	browserState: CanvasBrowserBindingState;
	approvalProjectionInstalled: boolean;
	projectionListeners: Set<() => void>;
	accountListeners: Set<(event: TransportServerNotification) => void>;
	dynamicProjectionUnsubscribe: (() => void) | null;
	timeline: CanvasTimelineOwner | null;
	retired: boolean;
}

/** Keeps one owner record per live generation, and retires the ones replaced. */
interface GenerationOwnerStore {
	readonly for: (input: CodexWorkbenchGenerationInput) => GenerationOwners;
}

/**
 * One component the production wiring cannot proceed without.
 * @param created What the graph has built so far.
 * @param name The component.
 * @returns The component.
 */
function requireCreated<Name extends keyof CodexWorkbenchComponents>(
	created: Readonly<Partial<CodexWorkbenchComponents>>,
	name: Name,
): CodexWorkbenchComponents[Name] {
	const component = created[name];
	if (component === undefined)
		throw new Error(`The production Codex ${name} dependency is not ready.`);
	return component;
}

/**
 * Whether every field a binding needs is named. A snapshot that leaves any of
 * them open names no binding at all, and the narrowing this proves is what
 * lets a caller read them without checking each one again.
 * @param values The fields, keyed by the names the caller reads them under.
 * @returns True when each is present.
 */
function allNamed<Fields extends Record<string, unknown>>(
	values: Fields,
): values is { [Key in keyof Fields]: NonNullable<Fields[Key]> } {
	return Object.values(values).every((value) => value !== null && value !== undefined);
}

/** One snapshot the operation binding is read from. */
type BindingSnapshot =
	| ReturnType<CodexWorkbenchComponents["workhorse"]["snapshot"]>
	| ReturnType<CodexWorkbenchComponents["coordinator"]["snapshot"]>;

/**
 * Whether a snapshot is ready and names every part of its own identity, which
 * is what an operation binding is built from.
 * @param snapshot The workhorse or coordinator snapshot, when there is one.
 * @returns True when it names a complete ready thread.
 */
function namesReadyThread(snapshot: BindingSnapshot | undefined): boolean {
	if (snapshot?.state !== "ready") {
		return false;
	}
	const parts = [snapshot.threadId, snapshot.childId, snapshot.epoch, snapshot.operationId];
	return parts.every((part) => part !== null);
}

/**
 * Whether both snapshots name a complete ready thread on one child epoch.
 * @param workhorse The workhorse snapshot.
 * @param coordinator The coordinator snapshot.
 * @returns True when a binding can be built from them.
 */
function sharesReadyEpoch(workhorse: BindingSnapshot, coordinator: BindingSnapshot): boolean {
	if (!namesReadyThread(workhorse) || !namesReadyThread(coordinator)) {
		return false;
	}
	return coordinator.childId === workhorse.childId && coordinator.epoch === workhorse.epoch;
}

/**
 * The operation binding the coordinator and workhorse currently share, which
 * exists only while both are ready on the same child epoch and each names its
 * own thread and operation.
 *
 * The non-null reads below are the ones `namesReadyThread` has just proved;
 * TypeScript cannot carry that narrowing across the call.
 * @param created What the graph has built so far.
 * @returns The binding, or null when they do not share one.
 */
function currentOperationBinding(
	created: Readonly<Partial<CodexWorkbenchComponents>>,
): WorkhorseOperationBinding | null {
	const workhorse = created.workhorse?.snapshot();
	const coordinator = created.coordinator?.snapshot();
	if (workhorse === undefined || coordinator === undefined) {
		return null;
	}
	if (!sharesReadyEpoch(workhorse, coordinator)) {
		return null;
	}
	return {
		childId: workhorse.childId!,
		epoch: workhorse.epoch!,
		coordinator: {
			threadId: coordinator.threadId!,
			childId: coordinator.childId!,
			epoch: coordinator.epoch!,
			operationId: coordinator.operationId!,
		},
		workhorse: {
			threadId: workhorse.threadId!,
			childId: workhorse.childId!,
			epoch: workhorse.epoch!,
			operationId: workhorse.operationId!,
		},
	};
}

/**
 * Whether the transport has lost its child. A transport that refuses
 * inspection has already lost it.
 * @param transport The transport.
 * @returns True when it is not open.
 */
function closedTransport(transport: CodexWorkbenchComponents["transport"]): boolean {
	try {
		return transport.inspect().state !== "open";
	} catch {
		return true;
	}
}

/** The realtime generation, in the shape every callback owner correlates against. */
interface RealtimeGenerationCorrelation {
	readonly childId: CodexRealtimeGeneration["child"];
	readonly epoch: CodexRealtimeGeneration["epoch"];
	readonly coordinatorThreadId: CodexRealtimeGeneration["coordinatorThreadId"];
	readonly wireSessionId: CodexRealtimeGeneration["wireSessionId"];
	readonly browserSessionId: CodexRealtimeGeneration["browserSessionId"];
	readonly browserCorrelationId: CodexRealtimeGeneration["browserCorrelationId"];
}

/**
 * The realtime generation now running, in the shape every callback owner
 * correlates against.
 * @param created What the graph has built so far.
 * @returns The generation, or null when no voice session is running.
 */
function currentRealtimeGeneration(
	created: Readonly<Partial<CodexWorkbenchComponents>>,
): RealtimeGenerationCorrelation | null {
	const generation = created.realtime?.generation();
	if (generation === null || generation === undefined) {
		return null;
	}
	return {
		childId: generation.child,
		epoch: generation.epoch,
		coordinatorThreadId: generation.coordinatorThreadId,
		wireSessionId: generation.wireSessionId,
		browserSessionId: generation.browserSessionId,
		browserCorrelationId: generation.browserCorrelationId,
	};
}

/**
 * Retire one generation record. It stays in its map as an owner-free tombstone
 * so a late caller is refused instead of rebuilding a dead generation; what is
 * left is inert data, and the next generation prunes it.
 * @param owners The record.
 */
function retire(owners: GenerationOwners): void {
	owners.retired = true;
	owners.approval = null;
	owners.authority = null;
	owners.lifecycle = null;
	owners.timeline = null;
	owners.currentCoordinatorCall = null;
	owners.dynamicProjectionUnsubscribe = null;
	owners.projectionListeners.clear();
	owners.accountListeners.clear();
}

/**
 * A generation's record as it begins: no owners, and a browser state that has
 * read nothing yet.
 * @returns The record.
 */
function freshOwners(): GenerationOwners {
	return {
		approval: null,
		authority: null,
		lifecycle: null,
		currentCoordinatorCall: null,
		approvalProjectionInstalled: false,
		projectionListeners: new Set(),
		accountListeners: new Set(),
		dynamicProjectionUnsubscribe: null,
		timeline: null,
		retired: false,
		browserState: {
			account: { kind: "account", state: "unknown", reason: "Account state has not been read." },
			login: { kind: "login", state: "idle" },
			queue: { kind: "codex_queue", submissions: null },
			queueThreadId: null,
		},
	};
}

/**
 * The store of generation records: one per live generation, shared by the
 * kernel and generation calls that carry the same generation number. Every
 * caller captures its record once, so retiring an entry cannot strand a
 * cleanup that is still running.
 * @returns The store.
 */
function createGenerationOwnerStore(): GenerationOwnerStore {
	const byGeneration = new Map<number, GenerationOwners>();
	// The highest generation number this installation has ever built a record
	// for. Nothing below it can be current, so a request for one is a caller
	// mistake rather than a reason to build owners nobody will dispose.
	let highestGeneration = 0;

	/**
	 * Drop every record below this generation. Generation numbers only
	 * increase, and one child owns one generation, so every lower entry belongs
	 * to a replaced child: dropping them bounds the map when a crash
	 * replacement outruns its own cleanup.
	 * @param generation The generation now current.
	 */
	const pruneReplaced = (generation: number): void => {
		for (const [replaced, record] of byGeneration) {
			if (replaced < generation) {
				record.retired = true;
				byGeneration.delete(replaced);
			}
		}
	};

	return {
		/**
		 * The record one generation owns, built the first time it is asked for.
		 * @param input The generation's input.
		 * @returns The record.
		 */
		for: (input) => {
			const owners = byGeneration.get(input.generation);
			if (owners !== undefined) {
				// Retirement is terminal. Rebuilding here would hand a dead generation a
				// fresh approval owner with a live expiry timer and a fresh effect
				// authority that nothing will ever dispose.
				if (owners.retired) {
					throw new Error(
						`The Codex workbench generation ${input.generation} is retired and cannot own more work.`,
					);
				}
				return owners;
			}
			if (input.generation < highestGeneration) {
				throw new Error(
					`The Codex workbench generation ${input.generation} was replaced by ${highestGeneration} and cannot own more work.`,
				);
			}
			pruneReplaced(input.generation);
			highestGeneration = input.generation;
			const created = freshOwners();
			byGeneration.set(input.generation, created);
			return created;
		},
	};
}

export {
	allNamed,
	closedTransport,
	createGenerationOwnerStore,
	currentOperationBinding,
	currentRealtimeGeneration,
	requireCreated,
	retire,
};
export type { GenerationOwners, GenerationOwnerStore, RealtimeGenerationCorrelation };
