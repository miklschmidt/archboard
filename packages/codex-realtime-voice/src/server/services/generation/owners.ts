import type { CodexRealtimeGeneration } from "#runtime/services/realtime/contract.ts";
import type { TransportServerNotification } from "@archboard/codex-app-server/transport";
import type { WorkhorseOperationBinding } from "#runtime/protocol/workhorse-operations/contract.ts";
import type {
	CodexWorkbenchComponents,
	CodexWorkbenchGenerationInput,
} from "#server/services/generation/workbench.ts";
import type {
	CodexWorkbenchSessionComponents,
	CodexWorkbenchWorkhorseComponents,
} from "#server/services/sessions/sessions.ts";
import type { ServerBrowserBindingState } from "#server/services/actions/browser-gateway.ts";
import type { CodexWorkbenchDomain } from "#server/protocol/generation/domain.ts";
import type { ServerTimelineOwner } from "#server/projections/timeline/timeline.ts";

/** Everything one generation owns beyond the component graph itself. */
interface GenerationOwners {
	domain: CodexWorkbenchDomain | null;
	browserState: ServerBrowserBindingState;
	approvalProjectionInstalled: boolean;
	projectionListeners: Set<() => void>;
	accountListeners: Set<(event: TransportServerNotification) => void>;
	dynamicProjectionUnsubscribe: (() => void) | null;
	timeline: ServerTimelineOwner | null;
	/** The voice coordinators' threads, read the way the workhorse's is. */
	coordinatorTimeline: ServerTimelineOwner | null;
	retired: boolean;
}

/** Keeps one owner record per live generation, and retires the ones replaced. */
interface GenerationOwnerStore {
	readonly for: (input: CodexWorkbenchGenerationInput) => GenerationOwners;
}

/**
 * One component the production wiring cannot proceed without, from a
 * generation's or a tab session's components built so far.
 * @param created What the graph has built so far.
 * @param name The component.
 * @returns The component.
 */
function requireCreated<Created extends object, Name extends keyof Created & string>(
	created: Created,
	name: Name,
): NonNullable<Created[Name]> {
	const component = created[name];
	if (component === undefined || component === null)
		throw new Error(`The Codex ${name} dependency is not ready.`);
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
	| ReturnType<CodexWorkbenchWorkhorseComponents["workhorse"]["snapshot"]>
	| ReturnType<CodexWorkbenchSessionComponents["coordinator"]["snapshot"]>;

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
 * The operation binding the coordinator and one workhorse currently share, which
 * exists only while both are ready on the same child epoch and each names its
 * own thread and operation.
 *
 * The non-null reads below are the ones `namesReadyThread` has just proved;
 * TypeScript cannot carry that narrowing across the call.
 * @param owners The workhorse and the tab's coordinator, each once it is built.
 * @param owners.workhorse The workhorse.
 * @param owners.coordinator The coordinator.
 * @param epoch What proves the workhorse's thread belongs to this child epoch.
 * @returns The binding, or null when they do not share one.
 */
function currentOperationBinding(
	owners: {
		readonly workhorse: CodexWorkbenchWorkhorseComponents["workhorse"] | undefined;
		readonly coordinator: CodexWorkbenchSessionComponents["coordinator"] | undefined;
	},
	epoch: Pick<CodexWorkbenchComponents["epoch"], "assertCurrent">,
): WorkhorseOperationBinding | null {
	const workhorse = owners.workhorse?.snapshot();
	const coordinator = owners.coordinator?.snapshot();
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
			provenance: epoch.assertCurrent({
				childId: workhorse.childId!,
				epoch: workhorse.epoch!,
				operationId: workhorse.operationId!,
				threadId: workhorse.threadId!,
			}).record,
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
 * @param created What the tab session has built so far.
 * @returns The generation, or null when no voice session is running.
 */
function currentRealtimeGeneration(
	created: Readonly<Partial<CodexWorkbenchSessionComponents>>,
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
	owners.domain = null;
	owners.timeline = null;
	owners.coordinatorTimeline = null;
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
		domain: null,
		approvalProjectionInstalled: false,
		projectionListeners: new Set(),
		accountListeners: new Set(),
		dynamicProjectionUnsubscribe: null,
		timeline: null,
		coordinatorTimeline: null,
		retired: false,
		browserState: {
			account: { kind: "account", state: "unknown", reason: "Account state has not been read." },
			login: { kind: "login", state: "idle" },
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

/**
 * Tell every browser projection listener that something it shows has changed,
 * while a projection is installed.
 * @param owners The generation's record.
 */
function publishProjection(owners: GenerationOwners): void {
	if (!owners.approvalProjectionInstalled) return;
	for (const listener of owners.projectionListeners) listener();
}

export {
	allNamed,
	closedTransport,
	createGenerationOwnerStore,
	currentOperationBinding,
	currentRealtimeGeneration,
	requireCreated,
	publishProjection,
	retire,
};
export type { GenerationOwners, GenerationOwnerStore, RealtimeGenerationCorrelation };
