import { ADDITIONAL_CONTEXT_POLICY } from "../../codex-instructions/index.js";
import {
	CodexThreadLinkConflictError,
	CodexThreadLinkError,
	type ThreadLink,
	type ThreadLinkBindingSnapshot,
	type CodexThreadLinkBindingOptions,
	type ThreadLinkBindingStore,
	type ThreadLinkCasToken,
	type ThreadLinkCompareAndSwapInput,
	type ThreadLinkAllowedSource,
	type ThreadLinkCurrentEpoch,
	type ThreadLinkSnapshot,
	type ThreadLinkSource,
	type ThreadLinkStatus,
	type UnboundThreadLink,
} from "./contract.js";

const ALLOWED_SOURCES = new Set(["cli", "vscode", "exec", "appServer"]);
const STATUS_VALUES = new Set<ThreadLinkStatus>(["notLoaded", "idle", "systemError", "active"]);
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

function invalidInput(message: string): CodexThreadLinkError {
	return new CodexThreadLinkError("invalid_input", message);
}

function assertPaneId(paneId: string): void {
	if (typeof paneId !== "string" || paneId.length === 0) {
		throw invalidInput("A thread-link binding requires one non-empty pane identity.");
	}
}

function cloneAndFreeze(value: unknown): unknown {
	if (Array.isArray(value)) return Object.freeze(value.map(cloneAndFreeze));
	if (!isRecord(value)) return value;
	const copy = Object.fromEntries(
		Object.entries(value).map(([key, child]) => [key, cloneAndFreeze(child)]),
	);
	return Object.freeze(copy);
}

function copyLink(link: ThreadLinkSnapshot): ThreadLinkSnapshot {
	if (link.state === "unbound") return EMPTY_LINK;
	if (link.state === "executable") {
		return Object.freeze({
			...link,
			source: cloneAndFreeze(link.source) as ThreadLinkAllowedSource,
		});
	}
	return Object.freeze({
		...link,
		source: cloneAndFreeze(link.source) as ThreadLinkSource,
	});
}

function isThreadLinkSource(value: unknown): value is ThreadLinkSource {
	if (typeof value === "string") return ALLOWED_SOURCES.has(value) || value === "unknown";
	if (!isRecord(value)) return false;
	if (Object.hasOwn(value, "custom")) return typeof value.custom === "string";
	return Object.hasOwn(value, "subAgent");
}

function isReason(value: unknown): boolean {
	return typeof value === "string" && REASON_VALUES.has(value);
}

function assertLink(link: ThreadLinkSnapshot): void {
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
	if (!STATUS_VALUES.has(link.status as ThreadLinkStatus)) {
		throw invalidInput("A bound thread link requires a recognized Codex thread status.");
	}
	const status = link.status as ThreadLinkStatus;
	if (typeof link.loaded !== "boolean" || typeof link.canAcceptDirectInput !== "boolean") {
		throw invalidInput("A bound thread link must publish boolean loaded and direct-input state.");
	}
	if (link.state === "executable") {
		if (
			typeof link.childId !== "string" ||
			link.childId.length === 0 ||
			typeof link.epoch !== "string" ||
			link.epoch.length === 0 ||
			!link.loaded ||
			!link.canAcceptDirectInput ||
			link.reason !== null ||
			typeof link.source !== "string" ||
			!ALLOWED_SOURCES.has(link.source) ||
			status === "notLoaded" ||
			status === "systemError"
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

function liveEpochOf(options: CodexThreadLinkBindingOptions): ThreadLinkCurrentEpoch | null {
	try {
		if (options.currentEpoch !== undefined) {
			const value =
				typeof options.currentEpoch === "function" ? options.currentEpoch() : options.currentEpoch;
			if (value === null) return null;
			if (
				!isRecord(value) ||
				typeof value.childId !== "string" ||
				value.childId.length === 0 ||
				typeof value.epoch !== "string" ||
				value.epoch.length === 0
			) {
				throw new Error("the current epoch source returned an invalid child/epoch pair");
			}
			return value as ThreadLinkCurrentEpoch;
		}
		if (options.epoch !== undefined) {
			const active = options.epoch.snapshot().manifest.activeEpoch;
			return active === null ? null : active;
		}
	} catch (error) {
		throw new CodexThreadLinkError(
			"current_epoch_unavailable",
			"The current Codex child epoch could not be read; the pane binding was not changed.",
			error,
		);
	}
	return null;
}

function assertLiveEpoch(
	options: CodexThreadLinkBindingOptions,
	paneId: string,
	revision: number,
	next: ThreadLinkSnapshot,
): void {
	if (next.state !== "executable") return;
	if (options.currentEpoch === undefined && options.epoch === undefined) return;
	const current = liveEpochOf(options);
	if (current === null || next.childId !== current.childId || next.epoch !== current.epoch) {
		throw new CodexThreadLinkConflictError(
			`The executable thread link for pane ${JSON.stringify(paneId)} is stale at binding revision ${revision}; re-read the current child epoch and classify again.`,
		);
	}
}

export function createCodexThreadLinkBinding(
	options: CodexThreadLinkBindingOptions = {},
): ThreadLinkBindingStore {
	const bindings = new Map<string, ThreadLinkBindingSnapshot>();

	const snapshot = (paneId: string): ThreadLinkBindingSnapshot => {
		assertPaneId(paneId);
		const existing = bindings.get(paneId);
		if (existing !== undefined) return existing;
		const initial = initialSnapshot(paneId);
		bindings.set(paneId, initial);
		return initial;
	};

	const compareAndSwap = ({ paneId, expected, next }: ThreadLinkCompareAndSwapInput) => {
		assertPaneId(paneId);
		assertLink(next);
		const current = snapshot(paneId);
		if (expected === null) {
			if (current.revision !== 0 || current.link.state !== "unbound") {
				throw conflict(paneId, current.revision);
			}
		} else {
			assertExpected(expected);
			if (!sameCas(expected, current.cas)) throw conflict(paneId, current.revision);
		}
		assertLiveEpoch(options, paneId, current.revision, next);
		const revision = current.revision + 1;
		const link = copyLink(next);
		const cas = casFor(paneId, revision, link);
		const updated = Object.freeze({ paneId, revision, link, cas });
		bindings.set(paneId, updated);
		return updated;
	};

	const bind = (paneId: string, expected: ThreadLinkCasToken | null, next: ThreadLink) =>
		compareAndSwap({ paneId, expected, next });

	const clear = (paneId: string, expected: ThreadLinkCasToken | null) =>
		compareAndSwap({ paneId, expected, next: EMPTY_LINK });

	return Object.freeze({ snapshot, read: snapshot, compareAndSwap, bind, clear });
}
