import { isAbsolute, resolve } from "node:path";

import type { ChildEpoch, ChildId, ThreadId, TurnId } from "@/shared/codex-workbench-identity";

const CHILD_TOKEN = /^archboard:child:([A-Za-z0-9][A-Za-z0-9._~-]{0,8192})$/u;
const EPOCH_TOKENS =
	/^archboard:epoch:([A-Za-z0-9][A-Za-z0-9._~-]{0,8192})\.([A-Za-z0-9][A-Za-z0-9._~-]{0,8192})$/u;
const BOUNDED_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._~:/-]{0,255}$/u;
const SHA256_HEX = /^[0-9a-f]{64}$/u;
const IDENTITY_MAX_LENGTH = 8193;
const TOKEN_MAX_LENGTH = 256;
const REASON_MAX_LENGTH = 1024;
const PATH_MAX_LENGTH = 4096;
const HASH_LENGTH = 64;

/** The identity domains a manifest can name. */
type ManifestIdentityDomain = "child" | "epoch" | "thread" | "turn";

/**
 * Whether a value is a plain object, which is what every manifest section must be.
 * @param value - The decoded value.
 * @returns True for a non-null, non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Whether a string is one of a fixed set of literals.
 * @param list - The accepted literals.
 * @param value - The string to test.
 * @returns True when the string appears in the list.
 */
function isInList<Value extends string>(list: readonly Value[], value: string): value is Value {
	return (list as readonly string[]).includes(value);
}

/**
 * Whether a value is a safe integer.
 * @param value - The decoded value.
 * @returns True for a safe integer number.
 */
function isInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value);
}

/**
 * Adopt a canonical identity read back from the durable manifest as its branded type. The
 * manifest is Archboard's own earlier output and the text has just been matched against that
 * domain's canonical form, so this decode boundary is the one place a brand is restored.
 * @param identity - The canonical identity text.
 * @returns The same text, typed as the branded identity.
 */
function adoptIdentity(identity: string): ChildId & ChildEpoch & ThreadId & TurnId {
	// The caller has just matched the text against one domain's canonical form, so it is that
	// domain's identity; the intersection lets each caller keep only the brand it asked for.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- canonical identity re-adopted at the durable decode boundary
	return identity as ChildId & ChildEpoch & ThreadId & TurnId;
}

/**
 * Require a manifest section to be an object.
 * @param value - The decoded value.
 * @param label - Which section, for the failure message.
 * @returns The section as a record.
 */
function asObject(value: unknown, label: string): Record<string, unknown> {
	if (!isRecord(value)) {
		throw new Error(`${label} must be an object`);
	}
	return value;
}

/**
 * Require a manifest section to be an array.
 * @param value - The decoded value.
 * @param label - Which section, for the failure message.
 * @returns The section as an array.
 */
function asArray(value: unknown, label: string): unknown[] {
	if (!Array.isArray(value)) {
		throw new Error(`${label} must be an array`);
	}
	return value;
}

/**
 * Require an object to carry exactly the expected keys, so an unknown field is refused rather
 * than silently dropped when the manifest is re-encoded.
 * @param object - The section.
 * @param expected - The keys it must carry.
 * @param label - Which section, for the failure message.
 */
function assertKeys(
	object: Record<string, unknown>,
	expected: readonly string[],
	label: string,
): void {
	const keys = Object.keys(object);
	if (keys.length !== expected.length || expected.some((key) => !Object.hasOwn(object, key))) {
		throw new Error(`${label} has missing or unknown fields`);
	}
}

/**
 * Require a non-empty string within a length bound.
 * @param value - The decoded value.
 * @param label - Which field, for the failure message.
 * @param maxLength - The longest string accepted.
 * @returns The string.
 */
function asBoundedString(value: unknown, label: string, maxLength: number): string {
	if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
		throw new Error(`${label} must be a non-empty bounded string`);
	}
	return value;
}

/**
 * Require a canonical Archboard identity of one domain.
 * @param value - The decoded value.
 * @param domain - Which identity domain it must name.
 * @param label - Which field, for the failure message.
 * @returns The canonical identity text.
 */
function asDomainIdentity(value: unknown, domain: ManifestIdentityDomain, label: string): string {
	const identity = asBoundedString(value, label, IDENTITY_MAX_LENGTH);
	const match = new RegExp(`^archboard:${domain}:([A-Za-z0-9][A-Za-z0-9._~-]{0,8192})$`, "u").exec(
		identity,
	);
	if (match === null) {
		throw new Error(`${label} is not a canonical ${domain} identity`);
	}
	return identity;
}

/**
 * Require a canonical child identity.
 * @param value - The decoded value.
 * @param label - Which field, for the failure message.
 * @returns The child identity.
 */
function asChildId(value: unknown, label: string): ChildId {
	return adoptIdentity(asDomainIdentity(value, "child", label));
}

/**
 * Require a canonical thread identity.
 * @param value - The decoded value.
 * @param label - Which field, for the failure message.
 * @returns The thread identity.
 */
function asThreadId(value: unknown, label: string): ThreadId {
	return adoptIdentity(asDomainIdentity(value, "thread", label));
}

/**
 * Require a canonical turn identity.
 * @param value - The decoded value.
 * @param label - Which field, for the failure message.
 * @returns The turn identity.
 */
function asTurnId(value: unknown, label: string): TurnId {
	return adoptIdentity(asDomainIdentity(value, "turn", label));
}

/**
 * Require an epoch identity that was minted under the child it is recorded beside, so a record
 * can never claim one child's epoch under another child.
 * @param value - The decoded epoch value.
 * @param childValue - The decoded child value it must belong to.
 * @param label - Which field, for the failure message.
 * @returns The epoch identity.
 */
function asEpoch(value: unknown, childValue: unknown, label: string): ChildEpoch {
	const child = asDomainIdentity(childValue, "child", `${label}.child`);
	const epoch = asDomainIdentity(value, "epoch", label);
	const childToken = CHILD_TOKEN.exec(child)?.[1];
	const epochTokens = EPOCH_TOKENS.exec(epoch);
	if (childToken === undefined || epochTokens === null || epochTokens[1] !== childToken) {
		throw new Error(`${label} does not belong to its child`);
	}
	return adoptIdentity(epoch);
}

/**
 * Require a bounded opaque token: an operation id, kind, RPC name or thread source.
 * @param value - The decoded value.
 * @param label - Which field, for the failure message.
 * @returns The token.
 */
function asToken(value: unknown, label: string): string {
	const token = asBoundedString(value, label, TOKEN_MAX_LENGTH);
	if (!BOUNDED_TOKEN.test(token)) {
		throw new Error(`${label} is not a bounded token`);
	}
	return token;
}

/**
 * Require a single-line bounded reason.
 * @param value - The decoded value.
 * @param label - Which field, for the failure message.
 * @returns The reason.
 */
function asReason(value: unknown, label: string): string {
	const reason = asBoundedString(value, label, REASON_MAX_LENGTH);
	if (reason.includes("\0") || reason.includes("\r") || reason.includes("\n")) {
		throw new Error(`${label} contains a control character`);
	}
	return reason;
}

/**
 * Require a lowercase SHA-256 digest.
 * @param value - The decoded value.
 * @param label - Which field, for the failure message.
 * @returns The digest.
 */
function asHash(value: unknown, label: string): string {
	const hash = asBoundedString(value, label, HASH_LENGTH);
	if (!SHA256_HEX.test(hash)) {
		throw new Error(`${label} must be a lowercase SHA-256 digest`);
	}
	return hash;
}

/**
 * Require an absolute path already in canonical form, so two records cannot name one
 * workspace differently.
 * @param value - The decoded value.
 * @param label - Which field, for the failure message.
 * @returns The path.
 */
function asAbsolutePath(value: unknown, label: string): string {
	const path = asBoundedString(value, label, PATH_MAX_LENGTH);
	if (!isAbsolute(path) || resolve(path) !== path) {
		throw new Error(`${label} must be a canonical absolute path`);
	}
	return path;
}

/**
 * Require a non-negative epoch-millisecond timestamp.
 * @param value - The decoded value.
 * @param label - Which field, for the failure message.
 * @returns The timestamp.
 */
function asTimestamp(value: unknown, label: string): number {
	if (!isInteger(value) || value < 0) {
		throw new Error(`${label} must be a non-negative integer`);
	}
	return value;
}

/**
 * Require one of a fixed set of literals.
 * @param value - The decoded value.
 * @param values - The accepted literals.
 * @param label - Which field, for the failure message.
 * @returns The literal, narrowed to the accepted set.
 */
function asEnum<Value extends string>(
	value: unknown,
	values: readonly Value[],
	label: string,
): Value {
	if (typeof value !== "string" || !isInList(values, value)) {
		throw new Error(`${label} has an unknown value`);
	}
	return value;
}

export {
	asAbsolutePath,
	asArray,
	asBoundedString,
	asChildId,
	asDomainIdentity,
	asEnum,
	asEpoch,
	asHash,
	asObject,
	asReason,
	asThreadId,
	asTimestamp,
	asToken,
	asTurnId,
	assertKeys,
	isInteger,
	isRecord,
};
