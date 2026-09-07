import { randomUUID } from "node:crypto";
import { resolveThreadOwnershipProvenance, type EpochOperationRecord } from "@/runtime/codex-epoch";
import type { SessionThread } from "@/runtime/codex-session";
import type { ThreadId } from "@/shared/codex-workbench-identity";
import { cloneAndFreeze } from "@/runtime/codex-thread-link/lib/provenance";
import {
	CodexThreadLinkError,
	type CodexThreadLinkClassifierOptions,
	type ThreadLinkCandidate,
	type ThreadLinkCandidateDiscovery,
	type ThreadLinkCandidateSource,
	type ThreadLinkClassification,
	type ThreadLinkCurrentEpoch,
	type ThreadLinkEpochAuthority,
	type ThreadLinkSource,
	type ThreadLinkTarget,
} from "@/runtime/codex-thread-link/lib/contract";
import { exhaustLoadedList, exhaustThreadList } from "@/runtime/codex-thread-link/lib/thread-lists";

type EpochSnapshot = ReturnType<ThreadLinkEpochAuthority["snapshot"]>;

/** What one candidate needs before it can later be adopted: its target and the epoch it was read under. */
interface RetainedCandidateTarget {
	readonly target: ThreadLinkTarget;
	readonly epochRevision: number;
	readonly epochBytesHash: string | null;
}

/** One complete candidate listing with the private targets its selection ids resolve to. */
interface ThreadLinkCandidateInventory {
	readonly result: ThreadLinkCandidateDiscovery;
	readonly targets: Map<string, RetainedCandidateTarget>;
}

/** Classifies one target against an already exhausted pair of lists. */
type ClassifyFromExhausted = (
	options: CodexThreadLinkClassifierOptions,
	target: ThreadLinkTarget,
	persisted: readonly SessionThread[],
	loaded: readonly ThreadId[],
	started: ThreadLinkCurrentEpoch | null,
	ended: ThreadLinkCurrentEpoch | null,
) => ThreadLinkClassification;

/**
 * Whether two epoch readings name the same child and epoch.
 * @param left One reading.
 * @param right The other.
 * @returns True when both are absent or both name the same epoch.
 */
function sameEpoch(
	left: ThreadLinkCurrentEpoch | null,
	right: ThreadLinkCurrentEpoch | null,
): boolean {
	if (left === null || right === null) {
		return left === null && right === null;
	}
	return left.childId === right.childId && left.epoch === right.epoch;
}

/**
 * The active epoch a durable snapshot names.
 * @param snapshot The snapshot.
 * @returns The epoch, or null when no child is active.
 */
function epochFromSnapshot(snapshot: EpochSnapshot): ThreadLinkCurrentEpoch | null {
	const active = snapshot.manifest.activeEpoch;
	return active === null ? null : { childId: active.childId, epoch: active.epoch };
}

/**
 * The browser-safe source label for a candidate.
 * @param source The observed source.
 * @returns The label, collapsing the custom and sub-agent object forms to a word.
 */
function candidateSource(source: ThreadLinkSource): ThreadLinkCandidateSource {
	if (typeof source === "string") {
		return source;
	}
	if (Object.hasOwn(source, "custom")) {
		return "custom";
	}
	if (Object.hasOwn(source, "subAgent")) {
		return "subAgent";
	}
	return "unknown";
}

/**
 * Refuses the inventory when the durable authority moved between two readings, so no listing
 * ever mixes generations.
 * @param started The snapshot the phase began with.
 * @param current The snapshot it ended with.
 * @param startedEpoch The epoch read at the start.
 * @param currentEpoch The epoch read at the end.
 * @param phase Which phase moved, for the refusal message.
 */
function assertSameDiscoveryGeneration(
	started: EpochSnapshot,
	current: EpochSnapshot,
	startedEpoch: ThreadLinkCurrentEpoch | null,
	currentEpoch: ThreadLinkCurrentEpoch | null,
	phase: "exhausted" | "classified",
): void {
	if (
		!sameEpoch(startedEpoch, currentEpoch) ||
		!sameEpoch(startedEpoch, epochFromSnapshot(started)) ||
		!sameEpoch(currentEpoch, epochFromSnapshot(current)) ||
		started.cas.revision !== current.cas.revision ||
		started.cas.bytesHash !== current.cas.bytesHash
	) {
		throw new CodexThreadLinkError(
			"conflict",
			`The current Codex authority changed while thread candidates were being ${phase}; refresh the candidate list.`,
		);
	}
}

/**
 * The child epoch a candidate is attributed to: the one its ownership record names, or the
 * epoch the listing itself was read under.
 * @param record The ownership record, if any.
 * @param currentEpoch The epoch the listing was read under.
 * @returns The child and epoch, either of which may be null.
 */
function targetIdentity(
	record: EpochOperationRecord | null,
	currentEpoch: ThreadLinkCurrentEpoch | null,
): Pick<ThreadLinkTarget, "childId" | "epoch"> {
	if (record !== null) {
		return { childId: record.correlation.childId, epoch: record.correlation.epoch };
	}
	if (currentEpoch === null) {
		return { childId: null, epoch: null };
	}
	return { childId: currentEpoch.childId, epoch: currentEpoch.epoch };
}

/**
 * The target for one candidate thread, carrying its durable ownership record when the manifest
 * has one and the current epoch otherwise.
 * @param threadId The thread.
 * @param record The ownership record, if any.
 * @param currentEpoch The epoch the listing was read under.
 * @returns The target.
 */
function candidateTarget(
	threadId: ThreadId,
	record: EpochOperationRecord | null,
	currentEpoch: ThreadLinkCurrentEpoch | null,
): ThreadLinkTarget {
	return Object.freeze({
		threadId,
		...targetIdentity(record, currentEpoch),
		...(record === null
			? {}
			: {
					operationId: record.correlation.operationId,
					provenance: cloneAndFreeze(record),
				}),
	});
}

/**
 * A selection id no other candidate in this inventory holds.
 * @param taken The ids already issued.
 * @returns The fresh id.
 */
function freshSelectionId(taken: ReadonlyMap<string, RetainedCandidateTarget>): string {
	let selectionId = randomUUID();
	while (taken.has(selectionId)) {
		selectionId = randomUUID();
	}
	return selectionId;
}

/**
 * The browser-safe projection of one classified candidate.
 * @param selectionId The opaque id the browser hands back to bind it.
 * @param threadId The thread.
 * @param classification How the thread classified.
 * @returns The candidate.
 */
function candidateFor(
	selectionId: string,
	threadId: ThreadId,
	classification: ThreadLinkClassification,
): ThreadLinkCandidate {
	return Object.freeze({
		selectionId,
		threadId,
		state: classification.link.state,
		reason: classification.link.reason,
		source: candidateSource(classification.observation.source),
		status: classification.observation.status,
		loaded: classification.observation.loaded,
		canAcceptDirectInput: classification.observation.canAcceptDirectInput,
	});
}

/**
 * Publishes one complete persisted-and-loaded join owned by a single durable epoch generation:
 * every distinct persisted thread, classified against the same two exhausted lists.
 * @param options The classifier options, whose epoch authority owns the generation.
 * @param classifyFromExhausted Classifies one target against the exhausted lists.
 * @returns The listing with the private targets its selection ids resolve to.
 */
async function discoverCodexThreadLinkCandidates(
	options: CodexThreadLinkClassifierOptions & { readonly epoch: ThreadLinkEpochAuthority },
	classifyFromExhausted: ClassifyFromExhausted,
): Promise<ThreadLinkCandidateInventory> {
	const startedSnapshot = options.epoch.snapshot();
	const startedEpoch = epochFromSnapshot(startedSnapshot);
	const persisted = await exhaustThreadList(options.session);
	const loaded = await exhaustLoadedList(options.session);
	const exhaustedSnapshot = options.epoch.snapshot();
	const exhaustedEpoch = epochFromSnapshot(exhaustedSnapshot);
	assertSameDiscoveryGeneration(
		startedSnapshot,
		exhaustedSnapshot,
		startedEpoch,
		exhaustedEpoch,
		"exhausted",
	);

	const targets = new Map<string, RetainedCandidateTarget>();
	const candidates = [...new Set(persisted.map(({ id }) => id))].map((threadId) => {
		const record =
			resolveThreadOwnershipProvenance(exhaustedSnapshot.manifest, threadId)?.record ?? null;
		const target = candidateTarget(threadId, record, exhaustedEpoch);
		const classification = classifyFromExhausted(
			options,
			target,
			persisted,
			loaded,
			startedEpoch,
			exhaustedEpoch,
		);
		const selectionId = freshSelectionId(targets);
		targets.set(
			selectionId,
			Object.freeze({
				target,
				epochRevision: exhaustedSnapshot.cas.revision,
				epochBytesHash: exhaustedSnapshot.cas.bytesHash,
			}),
		);
		return candidateFor(selectionId, threadId, classification);
	});

	const finishedSnapshot = options.epoch.snapshot();
	assertSameDiscoveryGeneration(
		exhaustedSnapshot,
		finishedSnapshot,
		exhaustedEpoch,
		epochFromSnapshot(finishedSnapshot),
		"classified",
	);
	return Object.freeze({
		result: Object.freeze({ candidates: Object.freeze(candidates) }),
		targets,
	});
}

export { discoverCodexThreadLinkCandidates };
export type { RetainedCandidateTarget, ThreadLinkCandidateInventory };
