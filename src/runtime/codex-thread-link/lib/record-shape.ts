import { isAbsolute, resolve } from "node:path";

const CANONICAL_IDENTITY_PATTERNS = Object.freeze({
	child: /^archboard:child:[A-Za-z0-9][A-Za-z0-9._~-]{0,8192}$/u,
	thread: /^archboard:thread:[A-Za-z0-9][A-Za-z0-9._~-]{0,8192}$/u,
	turn: /^archboard:turn:[A-Za-z0-9][A-Za-z0-9._~-]{0,8192}$/u,
	epoch:
		/^archboard:epoch:[A-Za-z0-9][A-Za-z0-9._~-]{0,8192}\.[A-Za-z0-9][A-Za-z0-9._~-]{0,8192}$/u,
});
const CHILD_TOKEN = /^archboard:child:([A-Za-z0-9][A-Za-z0-9._~-]{0,8192})$/u;
const EPOCH_CHILD_TOKEN =
	/^archboard:epoch:([A-Za-z0-9][A-Za-z0-9._~-]{0,8192})\.[A-Za-z0-9][A-Za-z0-9._~-]{0,8192}$/u;
const BOUNDED_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._~:/-]{0,255}$/u;
const SHA256_HEX = /^[0-9a-f]{64}$/u;
const MAX_PATH_LENGTH = 4096;
const MAX_REASON_LENGTH = 1024;

/** The identity kinds an epoch record's fields are minted under. */
type CanonicalIdentityKind = keyof typeof CANONICAL_IDENTITY_PATTERNS;

/**
 * Whether a value is a plain object.
 * @param value The value.
 * @returns True for a non-null, non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Whether a value is a string with at least one character.
 * @param value The value.
 * @returns True for a non-empty string.
 */
function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}

/**
 * Whether a value is null or a non-empty string.
 * @param value The value.
 * @returns True for either.
 */
function isNullableString(value: unknown): value is string | null {
	return value === null || isNonEmptyString(value);
}

/**
 * Whether a value is a non-negative epoch-millisecond timestamp.
 * @param value The value.
 * @returns True for a safe non-negative integer.
 */
function isTimestamp(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Whether an object's own keys are exactly the expected set, so an unknown field is refused
 * rather than ignored.
 * @param value The object.
 * @param keys The expected keys.
 * @returns True when the key sets match.
 */
function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
	const actual = Object.keys(value).toSorted();
	const expected = [...keys].toSorted();
	return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

/**
 * Whether a value is an Archboard identity of the given kind.
 * @param value The value.
 * @param kind Which identity it should be.
 * @returns True when it matches that kind's minted form.
 */
function isCanonicalIdentity(value: unknown, kind: CanonicalIdentityKind): boolean {
	return isNonEmptyString(value) && CANONICAL_IDENTITY_PATTERNS[kind].test(value);
}

/**
 * Whether an epoch identity was minted under a child identity, which is what makes a record's
 * correlation self-consistent rather than merely well-formed.
 * @param epoch The epoch identity.
 * @param child The child identity.
 * @returns True when the epoch names that child.
 */
function epochBelongsToChild(epoch: unknown, child: unknown): boolean {
	if (!isNonEmptyString(epoch) || !isNonEmptyString(child)) {
		return false;
	}
	const childToken = CHILD_TOKEN.exec(child)?.[1];
	const epochChild = EPOCH_CHILD_TOKEN.exec(epoch)?.[1];
	return childToken !== undefined && epochChild === childToken;
}

/**
 * Whether a value is a bounded opaque token: an operation id, kind, RPC name or thread source.
 * @param value The value.
 * @returns True for a token within the bound.
 */
function isBoundedToken(value: unknown): value is string {
	return typeof value === "string" && BOUNDED_TOKEN.test(value);
}

/**
 * Whether a value is a lowercase SHA-256 digest.
 * @param value The value.
 * @returns True for 64 hex characters.
 */
function isHash(value: unknown): value is string {
	return typeof value === "string" && SHA256_HEX.test(value);
}

/**
 * Whether a value is an absolute path already in its canonical form, so two records cannot
 * name one workspace differently.
 * @param value The value.
 * @returns True for a bounded, absolute, already-resolved path.
 */
function isCanonicalAbsolutePath(value: unknown): value is string {
	return (
		typeof value === "string" &&
		value.length <= MAX_PATH_LENGTH &&
		isAbsolute(value) &&
		resolve(value) === value
	);
}

/**
 * Whether a value is a single-line bounded reason, or null.
 * @param value The value.
 * @returns True for null or a reason with no NUL or newline.
 */
function isReason(value: unknown): value is string | null {
	if (value === null) {
		return true;
	}
	return (
		isNonEmptyString(value) &&
		value.length <= MAX_REASON_LENGTH &&
		!value.includes("\0") &&
		!value.includes("\r") &&
		!value.includes("\n")
	);
}

export {
	epochBelongsToChild,
	hasExactKeys,
	isBoundedToken,
	isCanonicalAbsolutePath,
	isCanonicalIdentity,
	isHash,
	isNonEmptyString,
	isNullableString,
	isReason,
	isRecord,
	isTimestamp,
};
export type { CanonicalIdentityKind };
