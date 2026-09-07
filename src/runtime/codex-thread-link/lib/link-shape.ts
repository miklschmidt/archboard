import { ADDITIONAL_CONTEXT_POLICY } from "@/runtime/codex-instructions";
import {
	CodexThreadLinkError,
	type ThreadLinkCasToken,
	type ThreadLinkSnapshot,
	type ThreadLinkSource,
	type UnboundThreadLink,
} from "@/runtime/codex-thread-link/lib/contract";
import {
	isAllowedThreadLinkSource,
	isExecutableThreadLinkStatus,
	isRecord,
	isThreadLinkStatus,
} from "@/runtime/codex-thread-link/lib/thread-vocabulary";

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

/** The exact field values an unbound link carries; anything else is a residue of a past binding. */
const UNBOUND_FIELDS: readonly (readonly [string, unknown])[] = Object.freeze([
	["childId", null],
	["epoch", null],
	["threadId", null],
	["source", null],
	["status", "notLoaded"],
	["loaded", false],
	["canAcceptDirectInput", false],
	["reason", null],
] as const);

/** The field values that make an executable link executable, independent of its identities. */
const EXECUTABLE_FIELDS: readonly (readonly [string, unknown])[] = Object.freeze([
	["loaded", true],
	["canAcceptDirectInput", true],
	["reason", null],
] as const);

/** The provenance an inspect-only link must not claim. */
const INSPECT_ONLY_NULL_FIELDS: readonly string[] = Object.freeze(["childId", "epoch"] as const);

/**
 * The invalid-input error for a malformed binding argument.
 * @param message What was wrong.
 * @returns The error.
 */
function invalidInput(message: string): CodexThreadLinkError {
	return new CodexThreadLinkError("invalid_input", message);
}

/**
 * Refuses a pane identity that is missing or empty.
 * @param paneId The pane identity.
 */
function assertPaneId(paneId: string): void {
	if (typeof paneId !== "string" || paneId.length === 0) {
		throw invalidInput("A thread-link binding requires one non-empty pane identity.");
	}
}

/**
 * Whether a value is a non-empty string.
 * @param value The value.
 * @returns True for a non-empty string.
 */
function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}

/**
 * Whether a value is any source the contract can describe.
 * @param value The value.
 * @returns True for a recognised source.
 */
function isBindableSource(value: unknown): value is ThreadLinkSource {
	if (typeof value === "string") {
		return isAllowedThreadLinkSource(value) || value === "unknown";
	}
	if (!isRecord(value)) {
		return false;
	}
	return Object.hasOwn(value, "custom") || Object.hasOwn(value, "subAgent");
}

/**
 * Whether a value is one of the authored refusal reasons.
 * @param value The value.
 * @returns True for a published reason code.
 */
function isReason(value: unknown): boolean {
	return typeof value === "string" && REASON_VALUES.has(value);
}

/**
 * Whether every listed field holds its required value.
 * @param link The link as supplied.
 * @param fields The field and value pairs.
 * @returns True when all of them match.
 */
function fieldsMatch(
	link: Record<string, unknown>,
	fields: readonly (readonly [string, unknown])[],
): boolean {
	return fields.every(([key, value]) => link[key] === value);
}

/**
 * Refuses an unbound link that carries any residual binding field, so "unbound" has exactly
 * one representation.
 * @param link The link as supplied.
 */
function assertCanonicalUnbound(link: Record<string, unknown>): void {
	if (!fieldsMatch(link, UNBOUND_FIELDS)) {
		throw invalidInput("An unbound thread link has non-canonical fields.");
	}
}

/**
 * Refuses a bound link whose thread, source, status or capability flags are not the shapes
 * the contract publishes.
 * @param link The link as supplied.
 */
function assertBoundFields(link: Record<string, unknown>): void {
	if (!isNonEmptyString(link["threadId"])) {
		throw invalidInput("A bound thread link requires a non-empty ThreadId.");
	}
	if (!isBindableSource(link["source"])) {
		throw invalidInput("A bound thread link requires a recognized Codex thread source.");
	}
	if (!isThreadLinkStatus(link["status"])) {
		throw invalidInput("A bound thread link requires a recognized Codex thread status.");
	}
	if (typeof link["loaded"] !== "boolean" || typeof link["canAcceptDirectInput"] !== "boolean") {
		throw invalidInput("A bound thread link must publish boolean loaded and direct-input state.");
	}
}

/**
 * Whether an executable link names the child epoch it claims to be current in.
 * @param link The link as supplied.
 * @returns True when both identities are present.
 */
function namesChildEpoch(link: Record<string, unknown>): boolean {
	return isNonEmptyString(link["childId"]) && isNonEmptyString(link["epoch"]);
}

/**
 * Whether an executable link's source and status are ones a pane may write to directly.
 * @param link The link as supplied.
 * @returns True for a top-level allowed source with an executable status.
 */
function isTopLevelWritable(link: Record<string, unknown>): boolean {
	return isAllowedThreadLinkSource(link["source"]) && isExecutableThreadLinkStatus(link["status"]);
}

/**
 * Refuses an executable link that is not what execution requires: a current child epoch, a
 * loaded and directly writable top-level thread, and no refusal reason.
 * @param link The link as supplied.
 * @param allowExecutable Whether this caller may adopt an executable link at all.
 */
function assertExecutable(link: Record<string, unknown>, allowExecutable: boolean): void {
	if (!allowExecutable) {
		throw invalidInput(
			"Executable thread links can only be adopted by classifyAndBind through a live epoch proof.",
		);
	}
	if (
		!namesChildEpoch(link) ||
		!fieldsMatch(link, EXECUTABLE_FIELDS) ||
		!isTopLevelWritable(link)
	) {
		throw invalidInput(
			"An executable thread link must be current, loaded, directly writable, and top-level.",
		);
	}
}

/**
 * Refuses an inspect-only link that claims provenance or omits its reason.
 * @param link The link as supplied.
 */
function assertInspectOnly(link: Record<string, unknown>): void {
	if (
		INSPECT_ONLY_NULL_FIELDS.some((key) => link[key] !== null) ||
		link["canAcceptDirectInput"] !== false ||
		!isReason(link["reason"])
	) {
		throw invalidInput(
			"An inspect-only thread link requires null provenance and one actionable reason.",
		);
	}
}

/**
 * Validates a bound link and then the extra invariants its state carries.
 * @param link The link as supplied.
 * @param allowExecutable Whether this caller may adopt an executable link.
 * @param executable Whether the link claims to be executable.
 */
function assertBoundLink(
	link: Record<string, unknown>,
	allowExecutable: boolean,
	executable: boolean,
): void {
	assertBoundFields(link);
	if (executable) {
		assertExecutable(link, allowExecutable);
		return;
	}
	assertInspectOnly(link);
}

/**
 * Validates a link a caller offers for adoption. The value is checked structurally rather than
 * trusted from its declared type, because it crosses the public CAS boundary.
 * @param link The link as supplied.
 * @param allowExecutable Whether this caller may adopt an executable link.
 */
function assertLink(link: unknown, allowExecutable: boolean): asserts link is ThreadLinkSnapshot {
	if (!isRecord(link) || link["kind"] !== "thread_link") {
		throw invalidInput("A thread-link binding requires a thread_link snapshot.");
	}
	const state = link["state"];
	if (state === "unbound") {
		assertCanonicalUnbound(link);
		return;
	}
	if (state !== "executable" && state !== "inspect_only") {
		throw invalidInput("A bound thread link has an unknown state.");
	}
	assertBoundLink(link, allowExecutable, state === "executable");
}

/**
 * Whether a value is a safe non-negative revision number.
 * @param value The value.
 * @returns True for a safe non-negative integer.
 */
function isRevision(value: unknown): boolean {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Whether a value is an identity string or null.
 * @param value The value.
 * @returns True for either.
 */
function isNullableIdentity(value: unknown): boolean {
	return value === null || typeof value === "string";
}

/** How each CAS token field is checked, so a malformed token is refused as a whole. */
const CAS_TOKEN_FIELDS: readonly (readonly [string, (value: unknown) => boolean])[] = Object.freeze(
	[
		["revision", isRevision],
		["paneId", isNonEmptyString],
		["childId", isNullableIdentity],
		["epoch", isNullableIdentity],
		["threadId", isNullableIdentity],
	] as const,
);

/**
 * Validates a CAS token a caller offers. Like the link, it is checked structurally because it
 * crosses the public boundary.
 * @param expected The token as supplied.
 */
function assertExpected(expected: unknown): asserts expected is ThreadLinkCasToken {
	if (!isRecord(expected) || CAS_TOKEN_FIELDS.some(([key, accepts]) => !accepts(expected[key]))) {
		throw invalidInput("A thread-link CAS token is malformed; re-read the pane binding.");
	}
}

export { EMPTY_LINK, assertExpected, assertLink, assertPaneId, invalidInput, isNonEmptyString };
