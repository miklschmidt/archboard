// Operation identities: host-issued mutation correlations whose token carries
// the child epoch they were issued in, so a stale or foreign one is refused by
// inspection rather than by lookup alone.

import {
	EPOCH_TOKEN_PATTERN,
	WIRE_TOKEN_LIMIT,
	fail,
	requireToken,
	tokenOf,
	wireValue,
	type ChildEpoch,
	type ChildId,
	type OperationId,
} from "@/shared/codex-workbench-identity/lib/identity-values";

const OPERATION_ID_MAX_BYTES = 128 as const;
const OPERATION_ID_MAX_ISSUE_ATTEMPTS = 16 as const;
const OPERATION_TOKEN_PATTERN = new RegExp(
	`^([A-Za-z0-9][A-Za-z0-9._~-]{0,${WIRE_TOKEN_LIMIT - 1}})\\.(h[0-9a-f]{32})$`,
	"u",
);
const OPERATION_NONCE_PATTERN = /^[0-9a-f]{32}$/u;

/**
 * Spells an operation identity from the epoch it is issued in and a nonce.
 * @param epoch - The current child epoch.
 * @param nonce - Thirty-two lowercase hexadecimal characters.
 * @returns The branded operation identity.
 * @throws {IdentityValidationError} When the nonce is malformed or the value exceeds the byte limit.
 */
function operationWireValue(epoch: ChildEpoch, nonce: unknown): OperationId {
	if (typeof nonce !== "string" || !OPERATION_NONCE_PATTERN.test(nonce)) {
		return fail(
			"invalid-shape",
			"Operation identity nonce must be 32 lowercase hexadecimal characters.",
			"operation",
		);
	}
	const value = wireValue("operation", `${tokenOf(epoch)}.h${nonce}`);
	if (new TextEncoder().encode(value).byteLength > OPERATION_ID_MAX_BYTES) {
		return fail(
			"invalid-shape",
			`Operation identity exceeds ${OPERATION_ID_MAX_BYTES} UTF-8 bytes.`,
			"operation",
		);
	}
	return value;
}

/**
 * Names why an operation's epoch token is not the current one: it belongs to
 * an earlier epoch of the same child, or to another child altogether.
 * @param epochToken - The epoch token carried by the operation.
 * @param childId - The current child.
 * @returns Never; always refuses with the matching code.
 * @throws {IdentityValidationError} Always, as `stale-epoch` or `wrong-child`.
 */
function refuseForeignEpoch(epochToken: string, childId: ChildId): never {
	if (epochToken.startsWith(`${tokenOf(childId)}.`)) {
		return fail("stale-epoch", "The operation belongs to a stale child epoch.", "operation");
	}
	return fail("wrong-child", "The operation belongs to another child.", "operation");
}

/**
 * Validates an operation identity against the current child and epoch and
 * returns its token.
 * @param value - The untrusted value.
 * @param childId - The current child.
 * @param epoch - The current epoch.
 * @returns The token segment of the operation identity.
 * @throws {IdentityValidationError} When the value is malformed, oversized, stale or foreign.
 */
function requireOperationToken(value: unknown, childId: ChildId, epoch: ChildEpoch): string {
	const token = requireToken(value, "operation");
	if (new TextEncoder().encode(String(value)).byteLength > OPERATION_ID_MAX_BYTES) {
		return fail(
			"invalid-shape",
			`Operation identity exceeds ${OPERATION_ID_MAX_BYTES} UTF-8 bytes.`,
			"operation",
		);
	}
	const epochToken = OPERATION_TOKEN_PATTERN.exec(token)?.[1];
	if (epochToken === undefined || !EPOCH_TOKEN_PATTERN.test(epochToken)) {
		return fail(
			"invalid-shape",
			"Operation identity must carry a durable epoch token.",
			"operation",
		);
	}
	if (epochToken !== tokenOf(epoch)) {
		return refuseForeignEpoch(epochToken, childId);
	}
	return token;
}

export {
	OPERATION_ID_MAX_BYTES,
	OPERATION_ID_MAX_ISSUE_ATTEMPTS,
	operationWireValue,
	requireOperationToken,
};
