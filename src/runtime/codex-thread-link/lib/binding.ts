import { CodexEpochError } from "../../codex-epoch/index.js";
import { ADDITIONAL_CONTEXT_POLICY } from "../../codex-instructions/index.js";
import {
	deepEqual,
	cloneAndFreeze,
	isEpochExecutionProof,
	proofMatchesManifest,
} from "./provenance.js";
import {
	isAllowedThreadLinkSource,
	isExecutableThreadLinkStatus,
	isThreadLinkStatus,
} from "./classifier.js";
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
	type ThreadLinkSource,
	type ThreadLinkBindingStore,
	type UnboundThreadLink,
} from "./contract.js";

const REASON_VALUES = new Set<string>(
	ADDITIONAL_CONTEXT_POLICY.threadLink.reasonPrecedence.map(({ reason }) => reason),
);

const EMPTY_LINK: UnboundThreadLink = Object.freeze({
	kind: "thread_link",
	state: "unbound",
	childId: null,
	epoch: null,
	threadId: null,
	source: null,
	status: "notLoaded",
	loaded: false,
	canAcceptDirectInput: false,
	reason: null,
});

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

interface ThreadLinkBindingAuthorityOptions {
	readonly epoch: ThreadLinkEpochAuthority;
}

function invalidInput(message: string): CodexThreadLinkError {
	return new CodexThreadLinkError("invalid_input", message);
}

function assertPaneId(paneId: string): void {
	if (typeof paneId !== "string" || paneId.length === 0) {
		throw invalidInput("A thread-link binding requires one non-empty pane identity.");
	}
}

function isThreadLinkSource(value: unknown): value is ThreadLinkSource {
	if (typeof value === "string") {
		return isAllowedThreadLinkSource(value) || value === "unknown";
	}
	if (!isRecord(value)) {
		return false;
	}
	return Object.hasOwn(value, "custom") || Object.hasOwn(value, "subAgent");
}

function isReason(value: unknown): boolean {
	return typeof value === "string" && REASON_VALUES.has(value);
}

function assertLink(link: ThreadLinkSnapshot, allowExecutable: boolean): void {
	if (!isRecord(link) || link.kind !== "thread_link") {
		throw invalidInput("A thread-link binding requires a thread_link snapshot.");
	}
	if (link.state === "unbound") {
		if (
			link.childId !== null ||
			link.epoch !== null ||
			link.threadId !== null ||
			link.source !== null ||
			link.status !== "notLoaded" ||
			link.loaded ||
			link.canAcceptDirectInput ||
			link.reason !== null
		) {
			throw invalidInput("An unbound thread link has non-canonical fields.");
		}
		return;
	}
	if (link.state !== "executable" && link.state !== "inspect_only") {
		throw invalidInput("A bound thread link has an unknown state.");
	}
	if (typeof link.threadId !== "string" || link.threadId.length === 0) {
		throw invalidInput("A bound thread link requires a non-empty ThreadId.");
	}
	if (!isThreadLinkSource(link.source)) {
		throw invalidInput("A bound thread link requires a recognized Codex thread source.");
	}
	const status: unknown = link.status;
	if (!isThreadLinkStatus(status)) {
		throw invalidInput("A bound thread link requires a recognized Codex thread status.");
	}
	if (typeof link.loaded !== "boolean" || typeof link.canAcceptDirectInput !== "boolean") {
		throw invalidInput("A bound thread link must publish boolean loaded and direct-input state.");
	}
	if (link.state === "executable") {
		if (!allowExecutable) {
			throw invalidInput(
				"Executable thread links can only be adopted by classifyAndBind through a live epoch proof.",
			);
		}
		if (
			typeof link.childId !== "string" ||
			link.childId.length === 0 ||
			typeof link.epoch !== "string" ||
			link.epoch.length === 0 ||
			!link.loaded ||
			!link.canAcceptDirectInput ||
			link.reason !== null ||
			!isAllowedThreadLinkSource(link.source) ||
			!isExecutableThreadLinkStatus(status)
		) {
			throw invalidInput(
				"An executable thread link must be current, loaded, directly writable, and top-level.",
			);
		}
		return;
	}
	if (
		link.childId !== null ||
		link.epoch !== null ||
		link.canAcceptDirectInput ||
		!isReason(link.reason)
	) {
		throw invalidInput(
			"An inspect-only thread link requires null provenance and one actionable reason.",
		);
	}
}

function assertExpected(expected: ThreadLinkCasToken): void {
	if (
		!isRecord(expected) ||
		typeof expected.revision !== "number" ||
		!Number.isSafeInteger(expected.revision) ||
		expected.revision < 0 ||
		typeof expected.paneId !== "string" ||
		expected.paneId.length === 0 ||
		(expected.childId !== null && typeof expected.childId !== "string") ||
		(expected.epoch !== null && typeof expected.epoch !== "string") ||
		(expected.threadId !== null && typeof expected.threadId !== "string")
	) {
		throw invalidInput("A thread-link CAS token is malformed; re-read the pane binding.");
	}
}

function casFor(paneId: string, revision: number, link: ThreadLinkSnapshot): ThreadLinkCasToken {
	return Object.freeze({
		revision,
		paneId,
		childId: link.childId,
		epoch: link.epoch,
		threadId: link.threadId,
	});
}

function initialSnapshot(paneId: string): ThreadLinkBindingSnapshot {
	const cas = casFor(paneId, 0, EMPTY_LINK);
	return Object.freeze({ paneId, revision: 0, link: EMPTY_LINK, cas });
}

function sameCas(left: ThreadLinkCasToken, right: ThreadLinkCasToken): boolean {
	return (
		left.revision === right.revision &&
		left.paneId === right.paneId &&
		left.childId === right.childId &&
		left.epoch === right.epoch &&
		left.threadId === right.threadId
	);
}

function conflict(paneId: string, revision: number): CodexThreadLinkConflictError {
	return new CodexThreadLinkConflictError(
		`The thread link for pane ${JSON.stringify(paneId)} changed at revision ${revision}; re-read its snapshot and retry with the returned CAS token.`,
	);
}

function isCurrentEpoch(value: unknown): value is ThreadLinkCurrentEpoch {
	return (
		isRecord(value) &&
		typeof value["childId"] === "string" &&
		value["childId"].length > 0 &&
		typeof value["epoch"] === "string" &&
		value["epoch"].length > 0
	);
}

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
			"The current Codex child epoch could not be read; the pane binding was not changed.",
			error,
		);
	}
}

function assertLiveEpoch(
	options: ThreadLinkBindingAuthorityOptions | null,
	paneId: string,
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
			`The executable thread link for pane ${JSON.stringify(paneId)} is stale at binding revision ${revision}; re-read the current child epoch and classify again.`,
		);
	}
}

function copyLink(link: ThreadLinkNonExecutableSnapshot | ThreadLink): ThreadLinkSnapshot {
	if (link.state === "unbound") {
		return EMPTY_LINK;
	}
	if (link.state === "executable") {
		return Object.freeze({ ...link, source: cloneAndFreeze(link.source) });
	}
	return Object.freeze({ ...link, source: cloneAndFreeze(link.source) });
}

function assertAuthoritativeProof(
	options: ThreadLinkBindingAuthorityOptions | null,
	paneId: string,
	revision: number,
	link: ThreadLink,
	classification: ThreadLinkClassification,
): void {
	if (link.state !== "executable") {
		return;
	}
	if (options === null || classification.proof === null) {
		throw invalidInput(
			"An executable thread link requires a classifier result with a live durable epoch proof.",
		);
	}
	const proof = classification.proof;
	if (!isEpochExecutionProof(proof)) {
		throw invalidInput("The executable thread-link proof is malformed; classify the target again.");
	}
	let liveProof;
	try {
		liveProof = options.epoch.assertCurrent({
			childId: link.childId,
			epoch: link.epoch,
			operationId: proof.record.correlation.operationId,
			threadId: link.threadId,
		});
		const manifest = options.epoch.snapshot().manifest;
		if (
			!proofMatchesManifest(liveProof, manifest) ||
			!deepEqual(liveProof, proof) ||
			liveProof.record.correlation.childId !== link.childId ||
			liveProof.record.correlation.epoch !== link.epoch ||
			liveProof.record.provenance.threadId !== link.threadId
		) {
			throw new CodexThreadLinkConflictError(
				`The executable thread link for pane ${JSON.stringify(paneId)} changed before adoption at binding revision ${revision}; classify again with the current epoch proof.`,
			);
		}
	} catch (error) {
		if (error instanceof CodexThreadLinkConflictError) {
			throw error;
		}
		if (error instanceof CodexEpochError) {
			throw new CodexThreadLinkConflictError(
				`The executable thread link for pane ${JSON.stringify(paneId)} is no longer current (${error.code}); classify again before adopting it.`,
			);
		}
		throw new CodexThreadLinkError(
			"current_epoch_unavailable",
			"The live epoch proof could not be revalidated; the pane binding was not changed.",
			error,
		);
	}
}

interface ThreadLinkBindingController extends ThreadLinkBindingStore {
	readonly commitClassified: (
		paneId: string,
		expected: ThreadLinkCasToken | null,
		classification: ThreadLinkClassification,
	) => ThreadLinkBindingSnapshot;
}

function createBindingController(
	options: ThreadLinkBindingAuthorityOptions | null,
): ThreadLinkBindingController {
	const bindings = new Map<string, ThreadLinkBindingSnapshot>();

	const snapshot = (paneId: string): ThreadLinkBindingSnapshot => {
		assertPaneId(paneId);
		const existing = bindings.get(paneId);
		if (existing !== undefined) {
			return existing;
		}
		const initial = initialSnapshot(paneId);
		bindings.set(paneId, initial);
		return initial;
	};

	const compareAndSwapInternal = (
		paneId: string,
		expected: ThreadLinkCasToken | null,
		next: ThreadLinkSnapshot,
		allowExecutable: boolean,
		classification?: ThreadLinkClassification,
	): ThreadLinkBindingSnapshot => {
		assertPaneId(paneId);
		assertLink(next, allowExecutable);
		const current = snapshot(paneId);
		if (expected === null) {
			if (current.revision !== 0 || current.link.state !== "unbound") {
				throw conflict(paneId, current.revision);
			}
		} else {
			assertExpected(expected);
			if (!sameCas(expected, current.cas)) {
				throw conflict(paneId, current.revision);
			}
		}
		assertLiveEpoch(options, paneId, current.revision, next);
		if (classification !== undefined) {
			if (next.state === "executable") {
				assertAuthoritativeProof(options, paneId, current.revision, next, classification);
			}
		}
		const revision = current.revision + 1;
		const link = copyLink(next);
		const cas = casFor(paneId, revision, link);
		const updated = Object.freeze({ paneId, revision, link, cas });
		bindings.set(paneId, updated);
		return updated;
	};

	const compareAndSwap = (input: ThreadLinkCompareAndSwapInput): ThreadLinkBindingSnapshot =>
		compareAndSwapInternal(input.paneId, input.expected, input.next, false);

	const clear = (paneId: string, expected: ThreadLinkCasToken | null) =>
		compareAndSwapInternal(paneId, expected, EMPTY_LINK, false);

	const commitClassified = (
		paneId: string,
		expected: ThreadLinkCasToken | null,
		classification: ThreadLinkClassification,
	) => compareAndSwapInternal(paneId, expected, classification.link, true, classification);

	return Object.freeze({
		snapshot,
		read: snapshot,
		compareAndSwap,
		clear,
		commitClassified,
	});
}

export function createCodexThreadLinkBindingController(
	options: ThreadLinkBindingAuthorityOptions,
): ThreadLinkBindingController {
	return createBindingController(options);
}

export function createCodexThreadLinkBinding(): ThreadLinkBindingStore {
	const controller = createBindingController(null);
	return Object.freeze({
		snapshot: controller.snapshot,
		read: controller.read,
		compareAndSwap: controller.compareAndSwap,
		clear: controller.clear,
	});
}
