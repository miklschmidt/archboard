import { isAbsolute, resolve } from "node:path";

import type { ChildEpoch, ChildId, ThreadId, TurnId } from "@/shared/codex-workbench-identity";
import { CodexEpochError, type CodexEpochErrorCode } from "@/runtime/codex-epoch/lib/contract";

const CHILD_PATTERN = /^archboard:child:([A-Za-z0-9][A-Za-z0-9._~-]{0,8192})$/u;
const EPOCH_PATTERN =
	/^archboard:epoch:([A-Za-z0-9][A-Za-z0-9._~-]{0,8192})\.([A-Za-z0-9][A-Za-z0-9._~-]{0,8192})$/u;
const THREAD_PATTERN = /^archboard:thread:[A-Za-z0-9][A-Za-z0-9._~-]{0,8192}$/u;
const TURN_PATTERN = /^archboard:turn:[A-Za-z0-9][A-Za-z0-9._~-]{0,8192}$/u;
const OPERATION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~:/-]{0,255}$/u;
const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~:/-]{0,255}$/u;
const HASH_PATTERN = /^[0-9a-f]{64}$/u;
const REASON_MAX_LENGTH = 1024;

/**
 * Build a typed epoch failure.
 * @param code - Which refusal this is.
 * @param message - What the caller should do about it.
 * @param cause - The underlying failure, when one caused this refusal.
 * @returns The error.
 */
function epochError(code: CodexEpochErrorCode, message: string, cause?: unknown): CodexEpochError {
	return new CodexEpochError(code, message, cause);
}

/**
 * Adopt an identity the caller supplied as its branded type, once it has been matched against
 * that domain's canonical form. The epoch store is handed identities minted elsewhere in the
 * process, so this check is where they re-enter the type system.
 * @param identity - The canonical identity text.
 * @returns The same text, typed as the branded identity.
 */
function adoptIdentity(identity: string): ChildId & ChildEpoch & ThreadId & TurnId {
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- canonical identity re-adopted after its pattern check
	return identity as ChildId & ChildEpoch & ThreadId & TurnId;
}

/**
 * Whether a value is a safe integer, which every timestamp and revision must be.
 * @param value - The value.
 * @returns True for a safe integer number.
 */
function isSafeInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value);
}

/**
 * Require a canonical child identity.
 * @param value - The caller-supplied value.
 * @param label - Which argument, for the failure message.
 * @returns The child identity.
 */
function canonicalChild(value: unknown, label: string): ChildId {
	if (typeof value !== "string" || CHILD_PATTERN.exec(value) === null) {
		throw epochError("invalid_input", `${label} must be a canonical child identity`);
	}
	return adoptIdentity(value);
}

/**
 * Require an epoch identity minted under the child it is being used with, so one child's
 * epoch can never be recorded against another.
 * @param value - The caller-supplied value.
 * @param childId - The child it must belong to.
 * @param label - Which argument, for the failure message.
 * @returns The epoch identity.
 */
function canonicalEpoch(value: unknown, childId: ChildId, label: string): ChildEpoch {
	if (typeof value !== "string") {
		throw epochError("invalid_input", `${label} must be a canonical child epoch`);
	}
	const match = EPOCH_PATTERN.exec(value);
	const childMatch = CHILD_PATTERN.exec(childId);
	if (match === null || childMatch === null || match[1] !== childMatch[1]) {
		throw epochError("invalid_input", `${label} must be bound to the supplied child identity`);
	}
	return adoptIdentity(value);
}

/**
 * Require a canonical thread identity.
 * @param value - The caller-supplied value.
 * @param label - Which argument, for the failure message.
 * @returns The thread identity.
 */
function canonicalThread(value: unknown, label: string): ThreadId {
	if (typeof value !== "string" || THREAD_PATTERN.exec(value) === null) {
		throw epochError("invalid_input", `${label} must be a canonical thread identity`);
	}
	return adoptIdentity(value);
}

/**
 * Require a canonical turn identity.
 * @param value - The caller-supplied value.
 * @param label - Which argument, for the failure message.
 * @returns The turn identity.
 */
function canonicalTurn(value: unknown, label: string): TurnId {
	if (typeof value !== "string" || TURN_PATTERN.exec(value) === null) {
		throw epochError("invalid_input", `${label} must be a canonical turn identity`);
	}
	return adoptIdentity(value);
}

/**
 * Require a bounded opaque token.
 * @param value - The caller-supplied value.
 * @param label - Which argument, for the failure message.
 * @param pattern - The token form it must match.
 * @returns The token.
 */
function boundedToken(value: unknown, label: string, pattern: RegExp): string {
	if (typeof value !== "string" || pattern.exec(value) === null) {
		throw epochError("invalid_input", `${label} must be a bounded token`);
	}
	return value;
}

/**
 * Require an absolute path and canonicalise it, refusing the filesystem root itself.
 * @param value - The caller-supplied value.
 * @returns The canonical workspace root.
 */
function canonicalWorkspaceRoot(value: unknown): string {
	if (typeof value !== "string" || !isAbsolute(value)) {
		throw epochError("invalid_input", "workspaceRoot must be an absolute path");
	}
	const root = resolve(value);
	if (root === "/") {
		throw epochError("invalid_input", "workspaceRoot cannot be the filesystem root");
	}
	return root;
}

/**
 * Require an absolute epoch root and canonicalise it, refusing the filesystem root itself.
 * @param value - The caller-supplied value.
 * @returns The canonical epoch root.
 */
function normalizeRoot(value: string): string {
	if (typeof value !== "string" || !isAbsolute(value)) {
		throw epochError("invalid_input", "epoch root must be an absolute path");
	}
	const root = resolve(value);
	if (root === "/") {
		throw epochError("invalid_input", "epoch root cannot be the filesystem root");
	}
	return root;
}

/**
 * Require a lowercase SHA-256 digest.
 * @param value - The caller-supplied value.
 * @param label - Which argument, for the failure message.
 * @returns The digest.
 */
function sha256Hash(value: unknown, label: string): string {
	if (typeof value !== "string" || HASH_PATTERN.exec(value) === null) {
		throw epochError("invalid_input", `${label} must be a lowercase SHA-256 digest`);
	}
	return value;
}

/**
 * Whether a reason is bounded and free of the characters that would break a one-line record.
 * @param value - The caller-supplied value.
 * @returns True when the reason may be recorded.
 */
function isRecordableReason(value: unknown): value is string {
	return (
		typeof value === "string" &&
		value.length > 0 &&
		value.length <= REASON_MAX_LENGTH &&
		!value.includes("\0") &&
		!value.includes("\r") &&
		!value.includes("\n")
	);
}

/**
 * Require the terminal reason a settled record must carry.
 * @param value - The caller-supplied value.
 * @returns The reason.
 */
function prepareReason(value: unknown): string {
	if (!isRecordableReason(value)) {
		throw epochError(
			"invalid_input",
			"terminal reason must be bounded and free of control characters",
		);
	}
	return value;
}

/**
 * Require a timestamp that is a safe integer at or after a lower bound, so a record can never
 * claim to have settled before it was staged.
 * @param value - The caller-supplied value.
 * @param label - Which argument, for the failure message.
 * @param minimum - The earliest instant accepted.
 * @returns The timestamp.
 */
function timestamp(value: unknown, label: string, minimum = 0): number {
	if (!isSafeInteger(value) || value < minimum) {
		throw epochError("invalid_input", `${label} must be a safe timestamp`);
	}
	return value;
}

export {
	CHILD_PATTERN,
	EPOCH_PATTERN,
	HASH_PATTERN,
	OPERATION_PATTERN,
	THREAD_PATTERN,
	TOKEN_PATTERN,
	TURN_PATTERN,
	boundedToken,
	canonicalChild,
	canonicalEpoch,
	canonicalThread,
	canonicalTurn,
	canonicalWorkspaceRoot,
	epochError,
	isSafeInteger,
	normalizeRoot,
	prepareReason,
	sha256Hash,
	timestamp,
};
