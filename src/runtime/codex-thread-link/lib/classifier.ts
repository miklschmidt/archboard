import type { EpochOperationRecord } from "@/runtime/codex-epoch";
import type { SessionThread } from "@/runtime/codex-session";
import { CODEX_SESSION_THREAD_SOURCE } from "@/runtime/codex-session";
import type { ThreadId } from "@/shared/codex-workbench-identity";
import { cloneAndFreeze } from "@/runtime/codex-thread-link/lib/provenance";
import {
	CodexThreadLinkError,
	type CodexThreadLinkClassifier,
	type CodexThreadLinkClassifierOptions,
	type ThreadLinkClassification,
	type ThreadLinkCandidateDiscovery,
	type ThreadLinkCurrentEpoch,
	type ThreadLinkEpochAuthority,
	type ThreadLinkTarget,
} from "@/runtime/codex-thread-link/lib/contract";
import { discoverCodexThreadLinkCandidates as discoverCandidateInventory } from "@/runtime/codex-thread-link/lib/candidate-discovery";
import type { ThreadLinkCandidateInventory } from "@/runtime/codex-thread-link/lib/candidate-discovery";
import { durableEvidence } from "@/runtime/codex-thread-link/lib/durable-evidence";
import {
	classifyReason,
	linkFor,
	observationFor,
	ownershipReason,
} from "@/runtime/codex-thread-link/lib/refusal-precedence";
import { exhaustLoadedList, exhaustThreadList } from "@/runtime/codex-thread-link/lib/thread-lists";
import {
	observedDirectInput,
	sourceOf,
	statusOf,
	allowedThreadLinkSources,
	isAllowedThreadLinkSource,
	isCurrentEpoch,
	isExecutableThreadLinkStatus,
	isRecord,
	isThreadLinkStatus,
} from "@/runtime/codex-thread-link/lib/thread-vocabulary";

/**
 * The epoch a caller-supplied source reports.
 * @param source The live epoch, or a function returning it.
 * @returns The epoch, or null when no child is active.
 */
function epochFromSource(
	source: NonNullable<CodexThreadLinkClassifierOptions["currentEpoch"]>,
): ThreadLinkCurrentEpoch | null {
	const value = typeof source === "function" ? source() : source;
	if (value === null) {
		return null;
	}
	if (!isCurrentEpoch(value)) {
		throw new Error("the current epoch source returned an invalid child/epoch pair");
	}
	return Object.freeze({ childId: value.childId, epoch: value.epoch });
}

/**
 * The epoch the durable authority reports as active.
 * @param epoch The authority.
 * @returns The epoch, or null when no child is active.
 */
function epochFromAuthority(epoch: ThreadLinkEpochAuthority): ThreadLinkCurrentEpoch | null {
	const active = epoch.snapshot().manifest.activeEpoch;
	if (active === null) {
		return null;
	}
	if (!isCurrentEpoch(active)) {
		throw new Error("the epoch store returned an invalid active child/epoch pair");
	}
	return Object.freeze({ childId: active.childId, epoch: active.epoch });
}

/**
 * The current child epoch, preferring the live source a caller supplied over the durable store.
 * @param options The classifier options.
 * @returns The epoch, or null when no child is active.
 */
function currentEpochOf(options: CodexThreadLinkClassifierOptions): ThreadLinkCurrentEpoch | null {
	const source = options.currentEpoch;
	const authority = options.epoch;
	try {
		if (source !== undefined) {
			return epochFromSource(source);
		}
		if (authority !== undefined) {
			return epochFromAuthority(authority);
		}
	} catch (error) {
		throw new CodexThreadLinkError(
			"current_epoch_unavailable",
			"The current Codex child epoch could not be read; the thread link was not classified.",
			error,
		);
	}
	throw new CodexThreadLinkError(
		"current_epoch_unavailable",
		"Thread-link classification requires a live current epoch or an epoch store.",
	);
}

/**
 * The invalid-input error for a malformed target field.
 * @param message What was wrong.
 * @returns The error.
 */
function invalidTarget(message: string): CodexThreadLinkError {
	return new CodexThreadLinkError("invalid_input", message);
}

/**
 * Whether a value is a non-empty identity string.
 * @param value The value.
 * @returns True for a non-empty string.
 */
function isIdentity(value: unknown): boolean {
	return typeof value === "string" && value.length > 0;
}

/**
 * Whether a value is an identity string or null.
 * @param value The value.
 * @returns True for null or a non-empty string.
 */
function isNullableIdentity(value: unknown): boolean {
	return value === null || isIdentity(value);
}

/**
 * Whether a value is an identity string or absent.
 * @param value The value.
 * @returns True for undefined or a non-empty string.
 */
function isOptionalIdentity(value: unknown): boolean {
	return value === undefined || isIdentity(value);
}

/**
 * Refuses a target that does not name one issued thread with identity-or-null provenance.
 * @param target The target.
 */
function validateTarget(target: ThreadLinkTarget): void {
	if (!isRecord(target) || !isIdentity(target.threadId)) {
		throw invalidTarget("A thread-link target requires one non-empty issued ThreadId.");
	}
	if (!isNullableIdentity(target.childId)) {
		throw invalidTarget("A thread-link childId must be an identity or null.");
	}
	if (!isNullableIdentity(target.epoch)) {
		throw invalidTarget("A thread-link epoch must be an identity or null.");
	}
	if (!isOptionalIdentity(target.operationId)) {
		throw invalidTarget("A thread-link operationId must be a string.");
	}
}

/**
 * Whether a durable record proves this pane started the thread and Codex delivered it.
 * @param record The record, if any.
 * @returns True for a committed, delivered thread/start recorded for an Archboard thread.
 */
function provesOwnedThreadStart(
	record: EpochOperationRecord | null,
): record is EpochOperationRecord {
	return (
		record?.operation.rpc === "thread/start" &&
		record.status === "committed" &&
		record.outcome === "delivered" &&
		record.provenance.threadSource === CODEX_SESSION_THREAD_SOURCE
	);
}

/**
 * Whether a thread is the one the owning record describes: the same thread, opened by
 * Archboard, in the workspace the record recorded.
 * @param thread The thread as read.
 * @param target The target.
 * @param record The durable record that claims to own it.
 * @returns True when identity, source and workspace all agree.
 */
function matchesOwningRecord(
	thread: SessionThread,
	target: ThreadLinkTarget,
	record: EpochOperationRecord,
): boolean {
	return (
		thread.id === target.threadId &&
		thread.source === CODEX_SESSION_THREAD_SOURCE &&
		thread.threadSource === "archboard" &&
		thread.cwd === record.provenance.workspaceRoot
	);
}

/**
 * Whether a thread is a top-level durable root rather than a fork, a child, or an ephemeral
 * thread that will not persist.
 * @param thread The thread as read.
 * @returns True for an independent persisted root.
 */
function isDurableRoot(thread: SessionThread): boolean {
	return (
		thread.modelProvider.length > 0 &&
		thread.historyMode === "paginated" &&
		!thread.ephemeral &&
		thread.parentThreadId === null &&
		thread.forkedFromId === null
	);
}

/**
 * Whether a directly read thread is the untouched root this pane created, rather than a fork,
 * a child, or a thread whose workspace has moved.
 * @param thread The thread as read.
 * @param target The target.
 * @param record The durable record that claims to own it.
 * @returns True when every field matches the record's provenance.
 */
function isOwnedCreatedRoot(
	thread: SessionThread,
	target: ThreadLinkTarget,
	record: EpochOperationRecord,
): boolean {
	return matchesOwningRecord(thread, target, record) && isDurableRoot(thread);
}

/**
 * Whether the loaded root needs a direct read: history omits either the root itself or
 * its direct-input capability, and the loaded list names it exactly once.
 * @param target The target.
 * @param persisted The exhausted persisted list.
 * @param loaded The exhausted loaded list.
 * @returns True when a direct read is worth making.
 */
function mayBeHiddenRoot(
	target: ThreadLinkTarget,
	persisted: readonly SessionThread[],
	loaded: readonly ThreadId[],
): boolean {
	const matching = persisted.filter((row) => row.id === target.threadId);
	if (matching.length > 1 || loaded.filter((id) => id === target.threadId).length !== 1) {
		return false;
	}
	const listed = matching[0];
	return (
		listed === undefined ||
		(observedDirectInput(listed) === null &&
			sourceOf(listed) === CODEX_SESSION_THREAD_SOURCE &&
			isExecutableThreadLinkStatus(statusOf(listed)))
	);
}

/**
 * The durable record that proves this pane started the target thread in the current epoch.
 * @param options The classifier options.
 * @param target The target.
 * @returns The record, or null when nothing proves ownership.
 */
function owningThreadStartRecord(
	options: CodexThreadLinkClassifierOptions,
	target: ThreadLinkTarget,
): EpochOperationRecord | null {
	const evidence = durableEvidence(options, target);
	const record = evidence.record;
	if (evidence.reason !== null || evidence.proof === null || !provesOwnedThreadStart(record)) {
		return null;
	}
	const current = currentEpochOf(options);
	const refusal = ownershipReason(target, current, current, record, evidence.reason);
	return refusal === null ? record : null;
}

/**
 * Reads the thread a durable record says this pane created, when Codex's preview-filtered
 * history list hides it because it has no turns yet.
 * @param options The classifier options.
 * @param target The target.
 * @param persisted The exhausted persisted list.
 * @param loaded The exhausted loaded list.
 * @returns The thread when it is provably the owned root, otherwise null.
 */
async function readOwnedCreatedRoot(
	options: CodexThreadLinkClassifierOptions,
	target: ThreadLinkTarget,
	persisted: readonly SessionThread[],
	loaded: readonly ThreadId[],
): Promise<SessionThread | null> {
	if (!mayBeHiddenRoot(target, persisted, loaded)) {
		return null;
	}
	const record = owningThreadStartRecord(options, target);
	if (record === null) {
		return null;
	}
	let thread: SessionThread;
	try {
		({ thread } = await options.session.threadRead({
			threadId: target.threadId,
			includeTurns: false,
		}));
	} catch (error) {
		throw new CodexThreadLinkError(
			"transport_failure",
			"The owned thread could not be read; the thread link was not classified.",
			error,
		);
	}
	return isOwnedCreatedRoot(thread, target, record) ? cloneAndFreeze(thread) : null;
}

/**
 * Classifies a target against two already exhausted lists, so a partial page can never decide
 * a link state.
 * @param options The classifier options.
 * @param target The target.
 * @param persisted The exhausted persisted list.
 * @param loaded The exhausted loaded list.
 * @param started The epoch read before the lists.
 * @param ended The epoch read after them.
 * @param ownedRoot The directly read owned root, when the lists hid it.
 * @returns The classification.
 */
function classifyFromExhausted(
	options: CodexThreadLinkClassifierOptions,
	target: ThreadLinkTarget,
	persisted: readonly SessionThread[],
	loaded: readonly ThreadId[],
	started: ThreadLinkCurrentEpoch | null,
	ended: ThreadLinkCurrentEpoch | null,
	ownedRoot: SessionThread | null = null,
): ThreadLinkClassification {
	validateTarget(target);
	const evidence = durableEvidence(options, target);
	const matchingThreads = persisted.filter((thread) => thread.id === target.threadId);
	const matchingLoaded = loaded.filter((threadId) => threadId === target.threadId);
	const thread =
		ownedRoot ?? (matchingThreads.length === 1 ? cloneAndFreeze(matchingThreads[0]!) : null);
	const observation = observationFor(thread, matchingLoaded.length, matchingThreads.length);
	const refusal = classifyReason({
		target,
		started,
		ended,
		record: evidence.record,
		durableReason: evidence.reason,
		persistedRows: matchingThreads.length,
		loadedOccurrences: matchingLoaded.length,
		thread,
		ownedCreatedRoot: ownedRoot !== null,
	});
	return Object.freeze({
		link: linkFor(target, ended, observation, refusal),
		thread,
		observation,
		currentEpoch: ended,
		proof: evidence.proof,
	});
}

/**
 * Creates the deterministic classifier: it exhausts both thread lists and reads the current
 * epoch on either side of them, so no partial page or epoch change can decide a link.
 * @param options The session and the epoch source or store.
 * @returns The classifier.
 */
function createCodexThreadLinkClassifier(
	options: CodexThreadLinkClassifierOptions,
): CodexThreadLinkClassifier {
	if (options.currentEpoch === undefined && options.epoch === undefined) {
		throw invalidTarget("Thread-link classification needs a current epoch source.");
	}
	const session = options.session;

	/**
	 * Classifies one target against freshly exhausted lists.
	 * @param target The target.
	 * @returns The classification.
	 */
	const classify = async (target: ThreadLinkTarget): Promise<ThreadLinkClassification> => {
		validateTarget(target);
		const started = currentEpochOf(options);
		// Both result sets are exhausted before precedence is evaluated. A partial
		// page can never decide a stable link state.
		const persisted = await exhaustThreadList(session);
		let loaded = await exhaustLoadedList(session);
		const ownedRoot = await readOwnedCreatedRoot(options, target, persisted, loaded);
		// A direct read is another await: prove loaded membership again before binding.
		if (ownedRoot !== null) {
			loaded = await exhaustLoadedList(session);
		}
		const ended = currentEpochOf(options);
		return classifyFromExhausted(options, target, persisted, loaded, started, ended, ownedRoot);
	};
	return Object.freeze({ classify });
}

/**
 * Publishes one complete candidate listing owned by a single durable epoch generation.
 * @param options The classifier options, whose epoch authority owns the generation.
 * @returns The listing with the private targets its selection ids resolve to.
 */
async function discoverCodexThreadLinkCandidates(
	options: CodexThreadLinkClassifierOptions & { readonly epoch: ThreadLinkEpochAuthority },
): Promise<ThreadLinkCandidateInventory> {
	return discoverCandidateInventory(options, classifyFromExhausted);
}

/**
 * Classifies one target through a one-shot classifier.
 * @param options The session and the epoch source or store.
 * @param target The target.
 * @returns The classification.
 */
async function classifyCodexThreadLink(
	options: CodexThreadLinkClassifierOptions,
	target: ThreadLinkTarget,
): Promise<ThreadLinkClassification> {
	return createCodexThreadLinkClassifier(options).classify(target);
}

export {
	isAllowedThreadLinkSource,
	allowedThreadLinkSources,
	isThreadLinkStatus,
	isExecutableThreadLinkStatus,
	createCodexThreadLinkClassifier,
	discoverCodexThreadLinkCandidates,
	classifyCodexThreadLink,
};
export type { ThreadLinkCandidateDiscovery };
