// The issuance ledger and the operations over it: minting host identities,
// adopting server identities, checking that an identity was issued here, and
// giving the server's raw value back for one that was.

import {
	assertIssued,
	assertText,
	type LogicalToolCallCorrelation,
	type LogicalToolCallCorrelationInput,
	type WireRequestCorrelation,
	type WireRequestCorrelationInput,
} from "@/shared/codex-workbench-identity/lib/identity-correlations";
import {
	OPERATION_ID_MAX_ISSUE_ATTEMPTS,
	operationWireValue,
	requireOperationToken,
} from "@/shared/codex-workbench-identity/lib/identity-operations";
import {
	encodeRawIdentity,
	encodeRawJsonRpcRequestId,
	fail,
	identityDomain,
	mintEpochValue,
	mintToken,
	parseEpochValue,
	parseValue,
	tokenOf,
	wireValue,
	type ChildEpoch,
	type ChildId,
	type CodexIdentity,
	type IdentityDomain,
	type IdentityValue,
	type ItemId,
	type JsonRpcRequestId,
	type JsonRpcRequestIdWireValue,
	type LoginId,
	type OperationId,
	type QueuedSubmissionId,
	type ThreadId,
	type TurnId,
} from "@/shared/codex-workbench-identity/lib/identity-values";

/**
 * Process-lifetime identity facts and issuance history. The ledger is data only;
 * every source generation builds fresh validators, issuers, and decoders over it.
 */
interface IdentityLedger {
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly issued: Map<IdentityDomain, Set<string>>;
	readonly rawByIdentity: Map<string, JsonRpcRequestIdWireValue>;
}

type AdoptableDomain =
	| "thread"
	| "turn"
	| "item"
	| "queued-submission"
	| "login"
	| "json-rpc-request"
	| "dynamic-tool-call"
	| "approval";

type ResponseAdoptionDomain = "thread" | "turn" | "item" | "queued-submission" | "login";

/** The domains whose identities may be handed back to Codex on the wire. */
const CODEX_WIRE_DOMAINS: ReadonlySet<IdentityDomain> = new Set<IdentityDomain>([
	"thread",
	"turn",
	"item",
	"queued-submission",
	"login",
	"json-rpc-request",
	"dynamic-tool-call",
	"approval",
]);

/** Raw server identities collected from one decoded app-server response. */
interface CodexResponseIdentityBatch {
	readonly threadIds?: readonly unknown[];
	readonly turnIds?: readonly unknown[];
	readonly itemIds?: readonly unknown[];
	readonly queuedSubmissionIds?: readonly unknown[];
	readonly loginIds?: readonly unknown[];
}

/** Branded identities returned in the same order as one response batch. */
interface AdoptedCodexResponseIdentityBatch {
	readonly threadIds: readonly ThreadId[];
	readonly turnIds: readonly TurnId[];
	readonly itemIds: readonly ItemId[];
	readonly queuedSubmissionIds: readonly QueuedSubmissionId[];
	readonly loginIds: readonly LoginId[];
}

interface StagedResponseIdentity<Domain extends ResponseAdoptionDomain> {
	readonly domain: Domain;
	readonly raw: string;
	readonly value: IdentityValue<Domain>;
}

/**
 * Records a token as issued in `domain` and remembers the raw value it stands
 * for, so it can later be proven issued and serialized back.
 * @param ledger - The ledger to write to.
 * @param domain - The identity domain.
 * @param token - The token to spell the wire value from.
 * @param raw - The server's raw value, or the token itself for a host identity.
 * @returns The branded identity.
 */
function issue<Domain extends IdentityDomain>(
	ledger: IdentityLedger,
	domain: Domain,
	token: string,
	raw: JsonRpcRequestIdWireValue,
): IdentityValue<Domain> {
	const value = wireValue(domain, token);
	let values = ledger.issued.get(domain);
	if (values === undefined) {
		values = new Set<string>();
		ledger.issued.set(domain, values);
	}
	values.add(value);
	ledger.rawByIdentity.set(value, raw);
	return value;
}

/**
 * Records an already-branded identity as issued.
 * @param ledger - The ledger to write to.
 * @param domain - The identity domain.
 * @param value - The branded identity.
 * @param raw - The server's raw value, or the token for a host identity.
 * @returns The same identity.
 */
function issueExisting<Domain extends IdentityDomain>(
	ledger: IdentityLedger,
	domain: Domain,
	value: IdentityValue<Domain>,
	raw: JsonRpcRequestIdWireValue,
): IdentityValue<Domain> {
	return issue(ledger, domain, tokenOf(value), raw);
}

/**
 * Mints and records a host-owned identity.
 * @param ledger - The ledger to write to.
 * @param domain - The identity domain.
 * @returns The fresh branded identity.
 */
function mint<Domain extends IdentityDomain>(
	ledger: IdentityLedger,
	domain: Domain,
): IdentityValue<Domain> {
	const raw = mintToken();
	return issue(ledger, domain, `h${raw}`, raw);
}

/**
 * Mints and records a new epoch for the ledger's child.
 * @param ledger - The ledger to write to.
 * @returns The fresh branded epoch.
 */
function mintEpoch(ledger: IdentityLedger): ChildEpoch {
	const nextEpoch = mintEpochValue(ledger.childId);
	issueExisting(ledger, "epoch", nextEpoch, tokenOf(nextEpoch));
	return nextEpoch;
}

/**
 * Mints an operation identity bound to the current epoch, retrying a bounded
 * number of times should the random nonce collide with one already issued.
 * @param ledger - The ledger to write to.
 * @returns The fresh branded operation identity.
 * @throws {IdentityValidationError} As `issuance-exhausted` after too many collisions.
 */
function mintOperation(ledger: IdentityLedger): OperationId {
	for (let attempt = 0; attempt < OPERATION_ID_MAX_ISSUE_ATTEMPTS; attempt++) {
		const value = operationWireValue(ledger.epoch, mintToken());
		if (ledger.issued.get("operation")?.has(value) !== true) {
			return issue(ledger, "operation", tokenOf(value), value);
		}
	}
	return fail(
		"issuance-exhausted",
		`Could not issue a unique operation identity after ${OPERATION_ID_MAX_ISSUE_ATTEMPTS} attempts.`,
		"operation",
	);
}

/**
 * Adopts a raw server-issued string id into `domain`, recording it as issued.
 * @param ledger - The ledger to write to.
 * @param domain - The identity domain.
 * @param rawValue - The id as the server sent it.
 * @returns The branded identity.
 * @throws {IdentityValidationError} When the raw id is not an acceptable string.
 */
function adopt<Domain extends AdoptableDomain>(
	ledger: IdentityLedger,
	domain: Domain,
	rawValue: unknown,
): IdentityValue<Domain> {
	if (typeof rawValue !== "string") {
		return fail("invalid-shape", `The server ${domain} identity must be a string.`, domain);
	}
	const token = encodeRawIdentity(rawValue, domain);
	return issue(ledger, domain, token, rawValue);
}

/**
 * Tells whether a raw value is a JSON-RPC id the protocol allows: a string
 * or a safe integer.
 * @param rawValue - The id as the server sent it.
 * @returns True when it may be adopted.
 */
function isJsonRpcRequestIdWireValue(rawValue: unknown): rawValue is JsonRpcRequestIdWireValue {
	return typeof rawValue === "string" || Number.isSafeInteger(rawValue);
}

/**
 * Adopts a raw server-issued JSON-RPC request id, which may be a string or an
 * integer, recording it as issued.
 * @param ledger - The ledger to write to.
 * @param rawValue - The id as the server sent it.
 * @returns The branded request id.
 * @throws {IdentityValidationError} When the id is neither a string nor a safe integer.
 */
function adoptJsonRpcRequestId(ledger: IdentityLedger, rawValue: unknown): JsonRpcRequestId {
	if (!isJsonRpcRequestIdWireValue(rawValue)) {
		return fail(
			"invalid-shape",
			"The server json-rpc-request identity must be a string or integer.",
			"json-rpc-request",
		);
	}
	const token = encodeRawJsonRpcRequestId(rawValue);
	return issue(ledger, "json-rpc-request", token, rawValue);
}

/**
 * Validates one raw response identity without recording it yet.
 * @param domain - The identity domain.
 * @param rawValue - The id as the server sent it.
 * @returns The staged identity, ready to commit.
 * @throws {IdentityValidationError} When the raw id is not an acceptable string.
 */
function stageResponseIdentity<Domain extends ResponseAdoptionDomain>(
	domain: Domain,
	rawValue: unknown,
): StagedResponseIdentity<Domain> {
	if (typeof rawValue !== "string") {
		return fail("invalid-shape", `The server ${domain} identity must be a string.`, domain);
	}
	return {
		domain,
		raw: rawValue,
		value: wireValue(domain, encodeRawIdentity(rawValue, domain)),
	};
}

/**
 * Stages every raw identity of one domain from a response.
 * @param domain - The identity domain.
 * @param values - The raw ids, absent when the response carried none.
 * @returns The staged identities in the same order.
 */
function stageResponseIdentities<Domain extends ResponseAdoptionDomain>(
	domain: Domain,
	values: readonly unknown[] | undefined,
): readonly StagedResponseIdentity<Domain>[] {
	return (values ?? []).map((value) => stageResponseIdentity(domain, value));
}

/**
 * Records staged identities as issued.
 * @param ledger - The ledger to write to.
 * @param values - The staged identities.
 * @returns The branded identities in the same order.
 */
function commitResponseIdentities<Domain extends ResponseAdoptionDomain>(
	ledger: IdentityLedger,
	values: readonly StagedResponseIdentity<Domain>[],
): readonly IdentityValue<Domain>[] {
	return values.map(({ domain, raw, value }) => issueExisting(ledger, domain, value, raw));
}

/**
 * Validates a complete decoded response before adopting any identity from it.
 * Staging every domain first makes a hostile late field fail without trusting
 * the valid identities that preceded it in the response.
 * @param ledger - The ledger to write to.
 * @param batch - The raw identities collected from one response.
 * @returns The branded identities, frozen, in the batch's order.
 * @throws {IdentityValidationError} When any raw identity is unacceptable.
 */
function adoptCodexResponseIdentities(
	ledger: IdentityLedger,
	batch: CodexResponseIdentityBatch,
): AdoptedCodexResponseIdentityBatch {
	const threadIds = stageResponseIdentities("thread", batch.threadIds);
	const turnIds = stageResponseIdentities("turn", batch.turnIds);
	const itemIds = stageResponseIdentities("item", batch.itemIds);
	const queuedSubmissionIds = stageResponseIdentities(
		"queued-submission",
		batch.queuedSubmissionIds,
	);
	const loginIds = stageResponseIdentities("login", batch.loginIds);
	return Object.freeze({
		threadIds: Object.freeze(commitResponseIdentities(ledger, threadIds)),
		turnIds: Object.freeze(commitResponseIdentities(ledger, turnIds)),
		itemIds: Object.freeze(commitResponseIdentities(ledger, itemIds)),
		queuedSubmissionIds: Object.freeze(commitResponseIdentities(ledger, queuedSubmissionIds)),
		loginIds: Object.freeze(commitResponseIdentities(ledger, loginIds)),
	});
}

/**
 * Parses an untrusted value as an identity of `domain` that this ledger issued.
 * @param ledger - The ledger to check against.
 * @param domain - The identity domain.
 * @param value - The untrusted value.
 * @returns The branded identity.
 * @throws {IdentityValidationError} When malformed or unissued.
 */
function parseIssued<Domain extends IdentityDomain>(
	ledger: IdentityLedger,
	domain: Domain,
	value: unknown,
): IdentityValue<Domain> {
	const parsed = parseValue(value, domain);
	assertIssued(parsed, domain, ledger.issued);
	return parsed;
}

/**
 * Parses an untrusted value as an operation identity issued in the current
 * epoch of this ledger.
 * @param ledger - The ledger to check against.
 * @param value - The untrusted value.
 * @returns The branded operation identity.
 * @throws {IdentityValidationError} When malformed, stale, foreign or unissued.
 */
function parseOperation(ledger: IdentityLedger, value: unknown): OperationId {
	const parsed = parseValue(value, "operation");
	requireOperationToken(parsed, ledger.childId, ledger.epoch);
	assertIssued(parsed, "operation", ledger.issued);
	return parsed;
}

/**
 * Parses an untrusted value as the current child epoch of this ledger.
 * @param ledger - The ledger to check against.
 * @param value - The untrusted value.
 * @returns The branded epoch.
 * @throws {IdentityValidationError} When malformed, foreign or unissued.
 */
function parseIssuedEpoch(ledger: IdentityLedger, value: unknown): ChildEpoch {
	const parsed = parseEpochValue(value, ledger.childId);
	assertIssued(parsed, "epoch", ledger.issued);
	return parsed;
}

/**
 * Resolves a raw Codex id to the identity this ledger already adopted for it,
 * refusing an id that was never adopted.
 * @param ledger - The ledger to check against.
 * @param domain - The identity domain.
 * @param rawValue - The id as the server sent it.
 * @returns The branded identity.
 * @throws {IdentityValidationError} When the raw id is unacceptable or unissued.
 */
function resolve<Domain extends "thread" | "item">(
	ledger: IdentityLedger,
	domain: Domain,
	rawValue: unknown,
): IdentityValue<Domain> {
	if (typeof rawValue !== "string") {
		return fail("invalid-shape", `The server ${domain} identity must be a string.`, domain);
	}
	return parseIssued(ledger, domain, wireValue(domain, encodeRawIdentity(rawValue, domain)));
}

/**
 * Gives back the raw wire value an issued identity stands for.
 * @param ledger - The ledger to read from.
 * @param value - The branded identity.
 * @param domain - Its domain, already checked by the caller.
 * @returns The raw value recorded at issuance.
 * @throws {IdentityValidationError} As `unissued` when the ledger has no raw value for it.
 */
function rawValueOf(
	ledger: IdentityLedger,
	value: IdentityValue<IdentityDomain>,
	domain: IdentityDomain,
): JsonRpcRequestIdWireValue {
	assertIssued(value, domain, ledger.issued);
	const raw = ledger.rawByIdentity.get(value);
	if (raw === undefined) {
		return fail("unissued", "Identity has no trusted wire value.", domain);
	}
	return raw;
}

/**
 * Serializes a Codex identity back to the string the server knows it by.
 * @param ledger - The ledger to read from.
 * @param value - The branded identity.
 * @returns The server's raw id as a string.
 * @throws {IdentityValidationError} When the identity is not a Codex wire identity or unissued.
 */
function serialize(ledger: IdentityLedger, value: CodexIdentity): string {
	const domain = identityDomain(value);
	if (!CODEX_WIRE_DOMAINS.has(domain)) {
		return fail("wrong-domain", "Identity is not a Codex wire identity.", domain);
	}
	return String(rawValueOf(ledger, value, domain));
}

/**
 * Serializes a JSON-RPC request identity back to the exact value, string or
 * integer, the server used.
 * @param ledger - The ledger to read from.
 * @param value - The branded request id.
 * @returns The server's raw id.
 * @throws {IdentityValidationError} When the identity is not a request id or unissued.
 */
function serializeJsonRpc(
	ledger: IdentityLedger,
	value: JsonRpcRequestId,
): JsonRpcRequestIdWireValue {
	const domain = identityDomain(value);
	if (domain !== "json-rpc-request") {
		return fail("wrong-domain", "Identity is not a JSON-RPC request identity.", domain);
	}
	return rawValueOf(ledger, value, domain);
}

/**
 * Builds a wire request correlation for a request id this ledger issued.
 * @param ledger - The ledger to check against.
 * @param input - The request id.
 * @returns The frozen correlation bound to the current child and epoch.
 * @throws {IdentityValidationError} When the request id was not issued here.
 */
function createWireRequestCorrelation(
	ledger: IdentityLedger,
	input: WireRequestCorrelationInput,
): WireRequestCorrelation {
	const requestId = parseIssued(ledger, "json-rpc-request", input.requestId);
	return Object.freeze({ child: ledger.childId, epoch: ledger.epoch, requestId });
}

/**
 * Builds a logical tool-call correlation from identities this ledger issued
 * and bounded text fields.
 * @param ledger - The ledger to check against.
 * @param input - The identities and text of the call.
 * @returns The frozen correlation bound to the current child and epoch.
 * @throws {IdentityValidationError} When an identity was not issued here or a text field is unacceptable.
 */
function createLogicalToolCallCorrelation(
	ledger: IdentityLedger,
	input: LogicalToolCallCorrelationInput,
): LogicalToolCallCorrelation {
	const threadId = parseIssued(ledger, "thread", input.threadId);
	const turnId = parseIssued(ledger, "turn", input.turnId);
	const callId = parseIssued(ledger, "dynamic-tool-call", input.callId);
	return Object.freeze({
		child: ledger.childId,
		epoch: ledger.epoch,
		threadId,
		turnId,
		callId,
		namespace: assertText(input.namespace, "namespace"),
		tool: assertText(input.tool, "tool"),
		manifestHash: assertText(input.manifestHash, "manifestHash"),
	});
}

export {
	type IdentityLedger,
	type CodexResponseIdentityBatch,
	type AdoptedCodexResponseIdentityBatch,
	issueExisting,
	mint,
	mintEpoch,
	mintOperation,
	adopt,
	adoptJsonRpcRequestId,
	adoptCodexResponseIdentities,
	parseIssued,
	parseOperation,
	parseIssuedEpoch,
	resolve,
	serialize,
	serializeJsonRpc,
	createWireRequestCorrelation,
	createLogicalToolCallCorrelation,
};
