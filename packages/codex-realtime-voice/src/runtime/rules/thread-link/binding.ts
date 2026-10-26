import { CodexEpochError } from "#runtime/store/epoch/contract.ts";
import {
	deepEqual,
	cloneAndFreeze,
	isEpochExecutionProof,
	proofMatchesManifest,
} from "#runtime/rules/thread-link/provenance.ts";
import {
	EMPTY_LINK,
	assertExpected,
	assertLink,
	assertLinkKey,
	invalidInput,
} from "#runtime/rules/thread-link/link-shape.ts";
import { isCurrentEpoch } from "#runtime/rules/thread-link/thread-vocabulary.ts";
import {
	CodexThreadLinkConflictError,
	CodexThreadLinkError,
	type ThreadLink,
	type ThreadLinkBindingSnapshot,
	type ThreadLinkClassification,
	type ThreadLinkCasToken,
	type ThreadLinkCompareAndSwapInput,
	type ThreadLinkCurrentEpoch,
	type ThreadLinkEpochAuthority,
	type ThreadLinkNonExecutableSnapshot,
	type ThreadLinkSnapshot,
	type ThreadLinkBindingStore,
} from "#runtime/rules/thread-link/contract.ts";

interface ThreadLinkBindingAuthorityOptions {
	readonly epoch: ThreadLinkEpochAuthority;
}

interface ThreadLinkBindingController extends ThreadLinkBindingStore {
	readonly commitClassified: (
		linkKey: string,
		expected: ThreadLinkCasToken | null,
		classification: ThreadLinkClassification,
	) => ThreadLinkBindingSnapshot;
}

/**
 * The CAS token for one binding revision, which names the identities a caller must still hold.
 * @param linkKey The link key.
 * @param revision The binding revision.
 * @param link The link at that revision.
 * @returns The token.
 */
function casFor(linkKey: string, revision: number, link: ThreadLinkSnapshot): ThreadLinkCasToken {
	return Object.freeze({
		revision,
		linkKey,
		childId: link.childId,
		epoch: link.epoch,
		threadId: link.threadId,
	});
}

/**
 * Whether two links name the same thread in the same child epoch: the link
 * fields a CAS token carries, and so the state they imply. What was observed
 * of the thread — its status, whether it is loaded — is not its identity: a
 * running turn makes an idle thread active without making it another link.
 * @param left One link.
 * @param right The other.
 * @returns True when state, thread, child and epoch all agree.
 */
function sameThreadLinkIdentity(left: ThreadLinkSnapshot, right: ThreadLinkSnapshot): boolean {
	return (
		left.state === right.state &&
		left.threadId === right.threadId &&
		left.childId === right.childId &&
		left.epoch === right.epoch
	);
}

/**
 * The binding a link key starts with: unbound at revision zero.
 * @param linkKey The link key.
 * @returns The initial snapshot.
 */
function initialSnapshot(linkKey: string): ThreadLinkBindingSnapshot {
	const cas = casFor(linkKey, 0, EMPTY_LINK);
	return Object.freeze({ linkKey, revision: 0, link: EMPTY_LINK, cas });
}

/**
 * Whether two CAS tokens describe the same binding revision.
 * @param left One token.
 * @param right The other.
 * @returns True when every field matches.
 */
function sameCas(left: ThreadLinkCasToken, right: ThreadLinkCasToken): boolean {
	return (
		left.revision === right.revision &&
		left.linkKey === right.linkKey &&
		left.childId === right.childId &&
		left.epoch === right.epoch &&
		left.threadId === right.threadId
	);
}

/**
 * The conflict error for a binding that moved under the caller.
 * @param linkKey The link key.
 * @param revision The revision the binding is actually at.
 * @returns The error.
 */
function conflict(linkKey: string, revision: number): CodexThreadLinkConflictError {
	return new CodexThreadLinkConflictError(
		`The thread link ${JSON.stringify(linkKey)} changed at revision ${revision}; re-read its snapshot and retry with the returned CAS token.`,
	);
}

/**
 * The child epoch the durable authority currently reports as active.
 * @param options The authority.
 * @returns The epoch, or null when no child is active.
 */
function liveEpochOf(options: ThreadLinkBindingAuthorityOptions): ThreadLinkCurrentEpoch | null {
	try {
		const active = options.epoch.snapshot().manifest.activeEpoch;
		if (active === null) {
			return null;
		}
		if (!isCurrentEpoch(active)) {
			throw new Error("the epoch store returned an invalid active child/epoch pair");
		}
		return Object.freeze({ childId: active.childId, epoch: active.epoch });
	} catch (error) {
		throw new CodexThreadLinkError(
			"current_epoch_unavailable",
			"The current Codex child epoch could not be read; the link binding was not changed.",
			error,
		);
	}
}

/**
 * Refuses to adopt an executable link whose child epoch is no longer the live one.
 * @param options The authority, or null for a binding store with no epoch authority.
 * @param linkKey The link key.
 * @param revision The binding revision being replaced.
 * @param next The link offered.
 */
function assertLiveEpoch(
	options: ThreadLinkBindingAuthorityOptions | null,
	linkKey: string,
	revision: number,
	next: ThreadLinkSnapshot,
): void {
	if (next.state !== "executable") {
		return;
	}
	if (options === null) {
		throw invalidInput(
			"An executable thread link requires a live epoch authority; use createCodexThreadLink.",
		);
	}
	const current = liveEpochOf(options);
	if (current === null || next.childId !== current.childId || next.epoch !== current.epoch) {
		throw new CodexThreadLinkConflictError(
			`The executable thread link ${JSON.stringify(linkKey)} is stale at binding revision ${revision}; re-read the current child epoch and classify again.`,
		);
	}
}

/**
 * Copies a link into the binding, freezing its source so a caller cannot mutate what is held.
 * @param link The link.
 * @returns The retained copy; an unbound link is always the one canonical value.
 */
function copyLink(link: ThreadLinkNonExecutableSnapshot | ThreadLink): ThreadLinkSnapshot {
	if (link.state === "unbound") {
		return EMPTY_LINK;
	}
	// The two bound branches are written out so each keeps its own member's source type; a
	// single branch would widen the source across the union and stop matching either member.
	if (link.state === "executable") {
		return Object.freeze({ ...link, source: cloneAndFreeze(link.source) });
	}
	return Object.freeze({ ...link, source: cloneAndFreeze(link.source) });
}

/**
 * Whether a freshly read proof still describes the link being adopted.
 * @param live The proof read back from the authority.
 * @param supplied The proof the classification carried.
 * @param link The executable link.
 * @param manifest The manifest the live proof was read from.
 * @returns True when both proofs and the manifest agree with the link.
 */
function proofStillMatches(
	live: ReturnType<ThreadLinkEpochAuthority["assertCurrent"]>,
	supplied: ReturnType<ThreadLinkEpochAuthority["assertCurrent"]>,
	link: Extract<ThreadLink, { readonly state: "executable" }>,
	manifest: ReturnType<ThreadLinkEpochAuthority["snapshot"]>["manifest"],
): boolean {
	return (
		proofMatchesManifest(live, manifest) &&
		deepEqual(live, supplied) &&
		live.record.correlation.childId === link.childId &&
		live.record.correlation.epoch === link.epoch &&
		live.record.provenance.threadId === link.threadId
	);
}

/**
 * The proof a classification must carry before an executable link may be adopted.
 * @param classification The classification the link came from.
 * @returns The proof.
 */
function authoritativeProofOf(
	classification: ThreadLinkClassification,
): NonNullable<ThreadLinkClassification["proof"]> {
	const proof = classification.proof;
	if (proof === null) {
		throw invalidInput(
			"An executable thread link requires a classifier result with a live durable epoch proof.",
		);
	}
	if (!isEpochExecutionProof(proof)) {
		throw invalidInput("The executable thread-link proof is malformed; classify the target again.");
	}
	return proof;
}

/**
 * Re-proves an executable link against the live durable authority at the moment of adoption,
 * so a proof that was valid when classified cannot be adopted after the epoch moved.
 * @param options The authority, or null for a binding store with no epoch authority.
 * @param linkKey The link key.
 * @param revision The binding revision being replaced.
 * @param link The executable link.
 * @param classification The classification the link came from.
 */
function assertAuthoritativeProof(
	options: ThreadLinkBindingAuthorityOptions | null,
	linkKey: string,
	revision: number,
	link: ThreadLink,
	classification: ThreadLinkClassification,
): void {
	if (link.state !== "executable") {
		return;
	}
	if (options === null) {
		throw invalidInput(
			"An executable thread link requires a classifier result with a live durable epoch proof.",
		);
	}
	const proof = authoritativeProofOf(classification);
	try {
		const liveProof = options.epoch.assertCurrent({
			childId: link.childId,
			epoch: link.epoch,
			operationId: proof.record.correlation.operationId,
			threadId: link.threadId,
		});
		if (!proofStillMatches(liveProof, proof, link, options.epoch.snapshot().manifest)) {
			throw new CodexThreadLinkConflictError(
				`The executable thread link ${JSON.stringify(linkKey)} changed before adoption at binding revision ${revision}; classify again with the current epoch proof.`,
			);
		}
	} catch (error) {
		throw adoptionFailure(error, linkKey);
	}
}

/**
 * The error a failed re-proof becomes: a conflict when the epoch moved, and an unavailable
 * authority otherwise.
 * @param error What the re-proof threw.
 * @param linkKey The link key.
 * @returns The error to raise.
 */
function adoptionFailure(error: unknown, linkKey: string): Error {
	if (error instanceof CodexThreadLinkConflictError) {
		return error;
	}
	if (error instanceof CodexEpochError) {
		return new CodexThreadLinkConflictError(
			`The executable thread link ${JSON.stringify(linkKey)} is no longer current (${error.code}); classify again before adopting it.`,
		);
	}
	return new CodexThreadLinkError(
		"current_epoch_unavailable",
		"The live epoch proof could not be revalidated; the link binding was not changed.",
		error,
	);
}

/**
 * Refuses the swap unless the caller's expectation still describes the link: a null
 * expectation means the link must still be untouched.
 * @param expected The caller's token, or null.
 * @param current The link's binding.
 */
function assertExpectationHolds(
	expected: ThreadLinkCasToken | null,
	current: ThreadLinkBindingSnapshot,
): void {
	if (expected === null) {
		if (current.revision !== 0 || current.link.state !== "unbound") {
			throw conflict(current.linkKey, current.revision);
		}
		return;
	}
	assertExpected(expected);
	if (!sameCas(expected, current.cas)) {
		throw conflict(current.linkKey, current.revision);
	}
}

/**
 * Creates the binding store, one binding per link key: one compare-and-swap boundary through which every link
 * change passes, with executable links additionally re-proved against the live epoch.
 * @param options The epoch authority, or null for a store that refuses executable links.
 * @returns The controller.
 */
function createBindingController(
	options: ThreadLinkBindingAuthorityOptions | null,
): ThreadLinkBindingController {
	const bindings = new Map<string, ThreadLinkBindingSnapshot>();

	/**
	 * The current binding of a link key, creating the unbound initial one on first use.
	 * @param linkKey The link key.
	 * @returns The snapshot.
	 */
	const snapshot = (linkKey: string): ThreadLinkBindingSnapshot => {
		assertLinkKey(linkKey);
		const existing = bindings.get(linkKey);
		if (existing !== undefined) {
			return existing;
		}
		const initial = initialSnapshot(linkKey);
		bindings.set(linkKey, initial);
		return initial;
	};

	/**
	 * Replaces the link of a key under compare-and-swap.
	 * @param linkKey The link key.
	 * @param expected The caller's token, or null for a first binding.
	 * @param next The link to adopt.
	 * @param allowExecutable Whether an executable link may be adopted here.
	 * @param classification The classification the link came from, when there is one.
	 * @returns The new snapshot.
	 */
	const compareAndSwapInternal = (
		linkKey: string,
		expected: ThreadLinkCasToken | null,
		next: ThreadLinkSnapshot,
		allowExecutable: boolean,
		classification?: ThreadLinkClassification,
	): ThreadLinkBindingSnapshot => {
		assertLinkKey(linkKey);
		assertLink(next, allowExecutable);
		const current = snapshot(linkKey);
		assertExpectationHolds(expected, current);
		assertLiveEpoch(options, linkKey, current.revision, next);
		if (classification !== undefined && next.state === "executable") {
			assertAuthoritativeProof(options, linkKey, current.revision, next, classification);
		}
		const revision = current.revision + 1;
		const link = copyLink(next);
		const updated = Object.freeze({
			linkKey,
			revision,
			link,
			cas: casFor(linkKey, revision, link),
		});
		bindings.set(linkKey, updated);
		return updated;
	};

	/**
	 * Adopts a non-executable link offered by a public caller.
	 * @param input The link key, expectation and link.
	 * @returns The new snapshot.
	 */
	const compareAndSwap = (input: ThreadLinkCompareAndSwapInput): ThreadLinkBindingSnapshot =>
		compareAndSwapInternal(input.linkKey, input.expected, input.next, false);

	/**
	 * Returns a link key to the unbound link.
	 * @param linkKey The link key.
	 * @param expected The caller's token, or null.
	 * @returns The new snapshot.
	 */
	const clear = (linkKey: string, expected: ThreadLinkCasToken | null): ThreadLinkBindingSnapshot =>
		compareAndSwapInternal(linkKey, expected, EMPTY_LINK, false);

	/**
	 * Adopts a freshly classified link, which is the only path an executable link may take.
	 * @param linkKey The link key.
	 * @param expected The caller's token, or null.
	 * @param classification The classification to adopt.
	 * @returns The new snapshot.
	 */
	const commitClassified = (
		linkKey: string,
		expected: ThreadLinkCasToken | null,
		classification: ThreadLinkClassification,
	): ThreadLinkBindingSnapshot =>
		compareAndSwapInternal(linkKey, expected, classification.link, true, classification);

	return Object.freeze({
		snapshot,
		read: snapshot,
		compareAndSwap,
		clear,
		commitClassified,
	});
}

/**
 * Creates the binding controller used with a live epoch authority, which can adopt executable
 * links through classification.
 * @param options The epoch authority.
 * @returns The controller.
 */
function createCodexThreadLinkBindingController(
	options: ThreadLinkBindingAuthorityOptions,
): ThreadLinkBindingController {
	return createBindingController(options);
}

/**
 * Creates a standalone binding store with no epoch authority, which therefore refuses every
 * executable link.
 * @returns The store.
 */
function createCodexThreadLinkBinding(): ThreadLinkBindingStore {
	const controller = createBindingController(null);
	return Object.freeze({
		snapshot: controller.snapshot,
		read: controller.read,
		compareAndSwap: controller.compareAndSwap,
		clear: controller.clear,
	});
}

export {
	createCodexThreadLinkBindingController,
	createCodexThreadLinkBinding,
	sameThreadLinkIdentity,
};
