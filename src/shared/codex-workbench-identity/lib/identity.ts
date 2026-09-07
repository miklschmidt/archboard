// The identity authority: capability objects composed over one ledger. The
// vocabulary lives in identity-values, operations in identity-operations,
// correlations in identity-correlations and the ledger operations in
// identity-ledger; this file only assembles and re-exports them.

import type {
	IdentityAuthorities,
	IdentityAuthority,
	IdentityIssuer,
	IdentityValidator,
	OperationAuthority,
	OperationIdIssuer,
	OperationIdValidator,
	TrustedIdentityDecoder,
	TrustedOperationIdDecoder,
} from "@/shared/codex-workbench-identity/lib/identity-capabilities";
import {
	assertCurrent,
	logicalToolCallKey,
	parseLogicalToolCallCorrelationValue,
	parseWireRequestCorrelationValue,
	type LogicalToolCallCorrelation,
	type LogicalToolCallCorrelationInput,
	type WireRequestCorrelation,
	type WireRequestCorrelationInput,
} from "@/shared/codex-workbench-identity/lib/identity-correlations";
import {
	adopt,
	adoptCodexResponseIdentities,
	adoptJsonRpcRequestId,
	createLogicalToolCallCorrelation,
	createWireRequestCorrelation,
	issueExisting,
	mint,
	mintEpoch,
	mintOperation,
	parseIssued,
	parseIssuedEpoch,
	parseOperation,
	resolve,
	serialize,
	serializeJsonRpc,
	type AdoptedCodexResponseIdentityBatch,
	type CodexResponseIdentityBatch,
	type IdentityLedger,
} from "@/shared/codex-workbench-identity/lib/identity-ledger";
import { OPERATION_ID_MAX_BYTES } from "@/shared/codex-workbench-identity/lib/identity-operations";
import {
	CANONICAL_ITEM_ID_MAX_LENGTH,
	IdentityValidationError,
	mintEpochValue,
	mintHostValue,
	parseEpochValue,
	parseValue,
	tokenOf,
	type AnyIdentity,
	type ApprovalId,
	type BrowserCommandId,
	type ChildEpoch,
	type ChildId,
	type CodexIdentity,
	type DynamicToolCallId,
	type IdentityDomain,
	type IdentityValidationCode,
	type ItemId,
	type JsonRpcRequestId,
	type JsonRpcRequestIdWireValue,
	type LoginId,
	type OperationId,
	type QueuedSubmissionId,
	type RealtimeSessionId,
	type ThreadId,
	type TurnId,
} from "@/shared/codex-workbench-identity/lib/identity-values";

/**
 * Builds the validator: the epoch facts every owner may compare against.
 *
 * @param ledger - The ledger the validator reads.
 * @returns A frozen validator.
 */
function createValidator(ledger: IdentityLedger): IdentityValidator {
	const { childId, epoch } = ledger;
	return Object.freeze({
		childId,
		epoch,
		/**
		 * Tells whether a child and epoch are this session's current ones.
		 *
		 * @param child - The child to compare.
		 * @param candidateEpoch - The epoch to compare.
		 * @returns True when both match.
		 */
		isCurrentEpoch: (child: ChildId, candidateEpoch: ChildEpoch): boolean =>
			child === childId && candidateEpoch === epoch,
		/**
		 * Refuses a child and epoch that are not this session's current ones.
		 *
		 * @param child - The child to compare.
		 * @param candidateEpoch - The epoch to compare.
		 */
		assertCurrentEpoch: (child: ChildId, candidateEpoch: ChildEpoch): void =>
			assertCurrent(child, candidateEpoch, childId, epoch),
	});
}

/**
 * Builds the issuer: the host-owned identities this session may mint.
 *
 * @param ledger - The ledger the issuer records into.
 * @returns A frozen issuer.
 */
function createIssuer(ledger: IdentityLedger): IdentityIssuer {
	return Object.freeze({
		/**
		 * Mints a browser command id.
		 *
		 * @returns The fresh id.
		 */
		mintBrowserCommandId: (): BrowserCommandId => mint(ledger, "browser-command"),
		/**
		 * Mints a JSON-RPC request id for a request this host sends.
		 *
		 * @returns The fresh id.
		 */
		mintJsonRpcRequestId: (): JsonRpcRequestId => mint(ledger, "json-rpc-request"),
		/**
		 * Mints a realtime session id.
		 *
		 * @returns The fresh id.
		 */
		mintRealtimeSessionId: (): RealtimeSessionId => mint(ledger, "realtime-session"),
		/**
		 * Mints and records a new epoch for this session's child.
		 *
		 * @returns The fresh epoch.
		 */
		mintChildEpoch: (): ChildEpoch => mintEpoch(ledger),
	});
}

/**
 * Builds the trusted decoder: parsing, adopting and serializing identities
 * against the ledger.
 *
 * @param ledger - The ledger the decoder reads and records into.
 * @returns A frozen decoder.
 */
function createDecoder(ledger: IdentityLedger): TrustedIdentityDecoder {
	const { childId, epoch, issued } = ledger;
	return Object.freeze({
		/**
		 * Parses a child id this session issued.
		 *
		 * @param value - The untrusted value.
		 * @returns The issued child id.
		 */
		parseChildId: (value: unknown): ChildId => parseIssued(ledger, "child", value),
		/**
		 * Parses an epoch of this session's child that it issued.
		 *
		 * @param value - The untrusted value.
		 * @returns The issued epoch of this child.
		 */
		parseChildEpoch: (value: unknown): ChildEpoch => parseIssuedEpoch(ledger, value),
		/**
		 * Parses a browser command id this session issued.
		 *
		 * @param value - The untrusted value.
		 * @returns The issued browser command id.
		 */
		parseBrowserCommandId: (value: unknown): BrowserCommandId =>
			parseIssued(ledger, "browser-command", value),
		/**
		 * Parses a thread id this session issued or adopted.
		 *
		 * @param value - The untrusted value.
		 * @returns The issued thread id.
		 */
		parseThreadId: (value: unknown): ThreadId => parseIssued(ledger, "thread", value),
		/**
		 * Parses a turn id this session issued or adopted.
		 *
		 * @param value - The untrusted value.
		 * @returns The issued turn id.
		 */
		parseTurnId: (value: unknown): TurnId => parseIssued(ledger, "turn", value),
		/**
		 * Parses an item id this session issued or adopted.
		 *
		 * @param value - The untrusted value.
		 * @returns The issued item id.
		 */
		parseItemId: (value: unknown): ItemId => parseIssued(ledger, "item", value),
		/**
		 * Parses a queued submission id this session adopted.
		 *
		 * @param value - The untrusted value.
		 * @returns The issued queued submission id.
		 */
		parseQueuedSubmissionId: (value: unknown): QueuedSubmissionId =>
			parseIssued(ledger, "queued-submission", value),
		/**
		 * Parses a login id this session adopted.
		 *
		 * @param value - The untrusted value.
		 * @returns The issued login id.
		 */
		parseLoginId: (value: unknown): LoginId => parseIssued(ledger, "login", value),
		/**
		 * Parses a JSON-RPC request id this session issued or adopted.
		 *
		 * @param value - The untrusted value.
		 * @returns The issued JSON-RPC request id.
		 */
		parseJsonRpcRequestId: (value: unknown): JsonRpcRequestId =>
			parseIssued(ledger, "json-rpc-request", value),
		/**
		 * Parses a dynamic tool call id this session adopted.
		 *
		 * @param value - The untrusted value.
		 * @returns The issued dynamic tool call id.
		 */
		parseDynamicToolCallId: (value: unknown): DynamicToolCallId =>
			parseIssued(ledger, "dynamic-tool-call", value),
		/**
		 * Parses a realtime session id this session issued.
		 *
		 * @param value - The untrusted value.
		 * @returns The issued realtime session id.
		 */
		parseRealtimeSessionId: (value: unknown): RealtimeSessionId =>
			parseIssued(ledger, "realtime-session", value),
		/**
		 * Parses an approval id this session adopted.
		 *
		 * @param value - The untrusted value.
		 * @returns The issued approval id.
		 */
		parseApprovalId: (value: unknown): ApprovalId => parseIssued(ledger, "approval", value),
		/**
		 * Looks up the thread id already adopted for a raw Codex thread id.
		 *
		 * @param raw - The raw Codex thread id.
		 * @returns The thread id already adopted for it.
		 */
		resolveThreadId: (raw: unknown): ThreadId => resolve(ledger, "thread", raw),
		/**
		 * Looks up the item id already adopted for a raw Codex item id.
		 *
		 * @param raw - The raw Codex item id.
		 * @returns The item id already adopted for it.
		 */
		resolveItemId: (raw: unknown): ItemId => resolve(ledger, "item", raw),
		/**
		 * Adopts a raw Codex thread id into this session.
		 *
		 * @param raw - The raw Codex thread id.
		 * @returns The newly adopted thread id.
		 */
		adoptThreadId: (raw: unknown): ThreadId => adopt(ledger, "thread", raw),
		/**
		 * Adopts a raw Codex turn id into this session.
		 *
		 * @param raw - The raw Codex turn id.
		 * @returns The newly adopted turn id.
		 */
		adoptTurnId: (raw: unknown): TurnId => adopt(ledger, "turn", raw),
		/**
		 * Adopts a raw Codex item id into this session.
		 *
		 * @param raw - The raw Codex item id.
		 * @returns The newly adopted item id.
		 */
		adoptItemId: (raw: unknown): ItemId => adopt(ledger, "item", raw),
		/**
		 * Adopts a raw Codex queued submission id into this session.
		 *
		 * @param raw - The raw Codex queued submission id.
		 * @returns The newly adopted queued submission id.
		 */
		adoptQueuedSubmissionId: (raw: unknown): QueuedSubmissionId =>
			adopt(ledger, "queued-submission", raw),
		/**
		 * Adopts a raw Codex login id into this session.
		 *
		 * @param raw - The raw Codex login id.
		 * @returns The newly adopted login id.
		 */
		adoptLoginId: (raw: unknown): LoginId => adopt(ledger, "login", raw),
		/**
		 * Adopts a raw JSON-RPC request id the server chose.
		 *
		 * @param raw - The raw JSON-RPC request id, string or integer.
		 * @returns The newly adopted request id.
		 */
		adoptJsonRpcRequestId: (raw: unknown): JsonRpcRequestId => adoptJsonRpcRequestId(ledger, raw),
		/**
		 * Adopts a raw Codex dynamic tool call id into this session.
		 *
		 * @param raw - The raw Codex dynamic tool call id.
		 * @returns The newly adopted call id.
		 */
		adoptDynamicToolCallId: (raw: unknown): DynamicToolCallId =>
			adopt(ledger, "dynamic-tool-call", raw),
		/**
		 * Adopts a raw Codex approval id into this session.
		 *
		 * @param raw - The raw Codex approval id.
		 * @returns The newly adopted approval id.
		 */
		adoptApprovalId: (raw: unknown): ApprovalId => adopt(ledger, "approval", raw),
		/**
		 * Adopts every identity of one decoded response, all or none.
		 *
		 * @param batch - The raw identities of one decoded response.
		 * @returns The adopted identities, or nothing adopted when any is bad.
		 */
		adoptCodexResponseIdentities: (
			batch: CodexResponseIdentityBatch,
		): AdoptedCodexResponseIdentityBatch => adoptCodexResponseIdentities(ledger, batch),
		/**
		 * Serializes an issued Codex identity back to the server's raw id.
		 *
		 * @param identity - An issued Codex identity.
		 * @returns The raw string the server knows it by.
		 */
		serializeCodexIdentity: (identity: CodexIdentity): string => serialize(ledger, identity),
		/**
		 * Serializes an issued request id back to the exact value the server used.
		 *
		 * @param identity - An issued JSON-RPC request id.
		 * @returns The raw value, string or integer, the server used.
		 */
		serializeJsonRpcRequestId: (identity: JsonRpcRequestId): JsonRpcRequestIdWireValue =>
			serializeJsonRpc(ledger, identity),
		/**
		 * Correlates an issued request id with the current child and epoch.
		 *
		 * @param input - The request id to correlate.
		 * @returns The correlation bound to the current child and epoch.
		 */
		createWireRequestCorrelation: (input: WireRequestCorrelationInput): WireRequestCorrelation =>
			createWireRequestCorrelation(ledger, input),
		/**
		 * Parses a wire request correlation and proves it current.
		 *
		 * @param value - The untrusted correlation record.
		 * @returns The proven-current correlation.
		 */
		parseWireRequestCorrelation: (value: unknown): WireRequestCorrelation =>
			parseWireRequestCorrelationValue(value, childId, epoch, issued),
		/**
		 * Correlates issued call identities and bounded text with the current child and epoch.
		 *
		 * @param input - The identities and text of the call.
		 * @returns The correlation bound to the current child and epoch.
		 */
		createLogicalToolCallCorrelation: (
			input: LogicalToolCallCorrelationInput,
		): LogicalToolCallCorrelation => createLogicalToolCallCorrelation(ledger, input),
		/**
		 * Parses a logical tool-call correlation and proves it current.
		 *
		 * @param value - The untrusted correlation record.
		 * @returns The proven-current correlation.
		 */
		parseLogicalToolCallCorrelation: (value: unknown): LogicalToolCallCorrelation =>
			parseLogicalToolCallCorrelationValue(value, childId, epoch, issued),
	});
}

/**
 * Builds the operation capability: validation, issuance and decoding of
 * operation identities, kept apart from the identity capability so ordinary
 * owners can be handed only the validator.
 *
 * @param ledger - The ledger the capability reads and records into.
 * @returns A frozen operation authority.
 */
function createOperationAuthority(ledger: IdentityLedger): OperationAuthority {
	/**
	 * Refuses an operation id that is not current and issued here.
	 *
	 * @param value - The operation id.
	 */
	const assertCurrentOperationId = (value: OperationId): void => {
		parseOperation(ledger, value);
	};
	/**
	 * Tells whether an operation id is current and issued here, letting
	 * only validation refusals answer false.
	 *
	 * @param value - The operation id.
	 * @returns True when it validates.
	 */
	const isCurrentOperationId = (value: OperationId): boolean => {
		try {
			assertCurrentOperationId(value);
			return true;
		} catch (error) {
			if (error instanceof IdentityValidationError) {
				return false;
			}
			throw error;
		}
	};
	return Object.freeze({
		validator: Object.freeze({ isCurrentOperationId, assertCurrentOperationId }),
		issuer: Object.freeze({
			/**
			 * Mints an operation id in the current epoch.
			 *
			 * @returns The fresh operation id.
			 */
			mintOperationId: (): OperationId => mintOperation(ledger),
		}),
		decoder: Object.freeze({
			/**
			 * Parses an operation id issued in the current epoch.
			 *
			 * @param value - The untrusted value.
			 * @returns The proven-current operation id.
			 */
			parseOperationId: (value: unknown): OperationId => parseOperation(ledger, value),
			/**
			 * Serializes an operation id; a canonical value is its own wire form.
			 *
			 * @param value - An operation id.
			 * @returns The same value, once proven current; it is its own wire form.
			 */
			serializeOperationId: (value: OperationId): string => parseOperation(ledger, value),
		}),
	});
}

/**
 * Composes every capability over one ledger, first recording the ledger's own
 * child and epoch as issued.
 *
 * @param ledger - The ledger to build over.
 * @returns The identity and operation authorities.
 */
function createAuthority(ledger: IdentityLedger): IdentityAuthorities {
	issueExisting(ledger, "child", ledger.childId, tokenOf(ledger.childId));
	issueExisting(ledger, "epoch", ledger.epoch, tokenOf(ledger.epoch));
	return {
		identity: Object.freeze({
			validator: createValidator(ledger),
			issuer: createIssuer(ledger),
			decoder: createDecoder(ledger),
		}),
		operation: createOperationAuthority(ledger),
	};
}

/**
 * Starts a fresh ledger with a newly minted child and epoch.
 *
 * @returns An empty ledger for a new process.
 */
function createIdentityLedger(): IdentityLedger {
	const childId = mintHostValue("child");
	return {
		childId,
		epoch: mintEpochValue(childId),
		issued: new Map(),
		rawByIdentity: new Map(),
	};
}

/**
 * Builds authorities over a ledger, a fresh one by default.
 *
 * @param ledger - The ledger to build over.
 * @returns The identity and operation authorities.
 */
function createIdentityAuthorities(
	ledger: IdentityLedger = createIdentityLedger(),
): IdentityAuthorities {
	return createAuthority(ledger);
}

/**
 * Builds only the identity authority over a fresh ledger.
 *
 * @returns The identity authority.
 */
function createIdentityAuthority(): IdentityAuthority {
	return createIdentityAuthorities().identity;
}

/**
 * Rebuilds authorities for a child and epoch minted earlier, with an empty
 * issuance history.
 *
 * @param input - The child id and epoch, as untrusted values.
 * @returns The identity and operation authorities.
 * @throws {IdentityValidationError} When the child or epoch is malformed or mismatched.
 */
function restoreIdentityAuthorities(input: {
	readonly childId: unknown;
	readonly epoch: unknown;
}): IdentityAuthorities {
	const childId = parseValue(input.childId, "child");
	const epoch = parseEpochValue(input.epoch, childId);
	return createAuthority({ childId, epoch, issued: new Map(), rawByIdentity: new Map() });
}

/**
 * Rebuilds only the identity authority for a child and epoch minted earlier.
 *
 * @param input - The child id and epoch, as untrusted values.
 * @returns The identity authority.
 * @throws {IdentityValidationError} When the child or epoch is malformed or mismatched.
 */
function restoreIdentityAuthority(input: {
	readonly childId: unknown;
	readonly epoch: unknown;
}): IdentityAuthority {
	return restoreIdentityAuthorities(input).identity;
}

export {
	CANONICAL_ITEM_ID_MAX_LENGTH,
	OPERATION_ID_MAX_BYTES,
	type IdentityDomain,
	type JsonRpcRequestIdWireValue,
	type ChildId,
	type ChildEpoch,
	type BrowserCommandId,
	type ThreadId,
	type TurnId,
	type ItemId,
	type QueuedSubmissionId,
	type LoginId,
	type JsonRpcRequestId,
	type DynamicToolCallId,
	type RealtimeSessionId,
	type ApprovalId,
	type OperationId,
	type AnyIdentity,
	type CodexIdentity,
	type WireRequestCorrelation,
	type LogicalToolCallCorrelation,
	logicalToolCallKey,
	type WireRequestCorrelationInput,
	type LogicalToolCallCorrelationInput,
	type IdentityValidationCode,
	IdentityValidationError,
	type IdentityValidator,
	type OperationIdValidator,
	type IdentityIssuer,
	type OperationIdIssuer,
	type CodexResponseIdentityBatch,
	type AdoptedCodexResponseIdentityBatch,
	type TrustedIdentityDecoder,
	type TrustedOperationIdDecoder,
	type OperationAuthority,
	type IdentityAuthority,
	type IdentityAuthorities,
	type IdentityLedger,
	createIdentityLedger,
	createIdentityAuthorities,
	createIdentityAuthority,
	restoreIdentityAuthorities,
	restoreIdentityAuthority,
};
