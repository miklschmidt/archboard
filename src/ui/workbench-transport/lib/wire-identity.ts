// The identity context the browser validates wire DTOs with. The browser
// receives identities the server already issued and owns no issuance ledger,
// so this context validates each identity as a bounded wire string and leaves
// authority and current-epoch questions to the gateway that owns them. It
// deliberately preserves the shared model's exact object, enum, cross-field
// and bounded-text checks instead of copying those schemas into the UI.

import type { IdentityContext } from "@/shared/codex-browser-model";
import type {
	ApprovalId,
	BrowserCommandId,
	ChildEpoch,
	ChildId,
	DynamicToolCallId,
	IdentityValidator,
	ItemId,
	JsonRpcRequestId,
	LoginId,
	OperationAuthority,
	OperationId,
	QueuedSubmissionId,
	RealtimeSessionId,
	ThreadId,
	TrustedIdentityDecoder,
	TurnId,
} from "@/shared/codex-workbench-identity";

const WIRE_IDENTITY_MAX_BYTES = 16_384;

/** The branded identity each domain names. */
interface IdentityByDomain {
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly "browser-command": BrowserCommandId;
	readonly thread: ThreadId;
	readonly turn: TurnId;
	readonly item: ItemId;
	readonly "queued-submission": QueuedSubmissionId;
	readonly login: LoginId;
	readonly "json-rpc-request": JsonRpcRequestId;
	readonly "dynamic-tool-call": DynamicToolCallId;
	readonly "realtime-session": RealtimeSessionId;
	readonly approval: ApprovalId;
	readonly operation: OperationId;
}

/** A wire value that is not a valid identity, or a DTO that failed validation. */
class BrowserWorkbenchWireError extends Error {
	override readonly name = "BrowserWorkbenchWireError";
}

/**
 * Whether a value is a bounded, trimmed, NUL-free wire string.
 * @param value The wire value.
 * @param maximum The UTF-8 byte bound.
 * @returns True for a usable wire string.
 */
function isWireString(value: unknown, maximum: number): value is string {
	return (
		typeof value === "string" &&
		value.length > 0 &&
		!value.includes("\0") &&
		value.trim() === value &&
		new TextEncoder().encode(value).byteLength <= maximum
	);
}

/**
 * Validate one identity as a wire string and brand it for its domain.
 * @param value The wire value.
 * @param domain The identity domain.
 * @returns The branded identity.
 */
function parseIdentity<Domain extends keyof IdentityByDomain>(
	value: unknown,
	domain: Domain,
): IdentityByDomain[Domain] {
	if (!isWireString(value, WIRE_IDENTITY_MAX_BYTES)) {
		throw new BrowserWorkbenchWireError(`The Codex workbench ${domain} identity is invalid.`);
	}
	// The shared identity module brands identities only through an issuance
	// ledger the browser does not own; a validated wire string is the browser's
	// whole knowledge of an identity, so it is branded here, once.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion
	return value as IdentityByDomain[Domain];
}

/**
 * A parser for one identity domain.
 * @param domain The domain.
 * @returns The parser.
 */
function identityParser<Domain extends keyof IdentityByDomain>(
	domain: Domain,
): (value: unknown) => IdentityByDomain[Domain] {
	return (value) => parseIdentity(value, domain);
}

/**
 * A decoder member the browser never needs: adoption, resolution and
 * serialisation belong to the host's ledger.
 * @param member The member name, for the refusal's words.
 * @returns A function that refuses.
 */
function unavailable(member: string): () => never {
	return () => {
		throw new BrowserWorkbenchWireError(
			`The browser identity decoder cannot ${member}; only the host ledger can.`,
		);
	};
}

/**
 * A validator answer that always agrees; the gateway owns the real question.
 * @returns True.
 */
function alwaysCurrent(): true {
	return true;
}

/** The gateway owns epoch and operation currency; the browser asserts nothing. */
function assertNothing(): void {
	// Deliberately empty: see the module comment.
}

const decoder: TrustedIdentityDecoder = {
	parseChildId: identityParser("child"),
	parseChildEpoch: identityParser("epoch"),
	parseBrowserCommandId: identityParser("browser-command"),
	parseThreadId: identityParser("thread"),
	parseTurnId: identityParser("turn"),
	parseItemId: identityParser("item"),
	parseQueuedSubmissionId: identityParser("queued-submission"),
	parseLoginId: identityParser("login"),
	parseJsonRpcRequestId: identityParser("json-rpc-request"),
	parseDynamicToolCallId: identityParser("dynamic-tool-call"),
	parseRealtimeSessionId: identityParser("realtime-session"),
	parseApprovalId: identityParser("approval"),
	resolveThreadId: unavailable("resolve a thread id"),
	resolveItemId: unavailable("resolve an item id"),
	adoptThreadId: unavailable("adopt a thread id"),
	adoptTurnId: unavailable("adopt a turn id"),
	adoptItemId: unavailable("adopt an item id"),
	adoptQueuedSubmissionId: unavailable("adopt a queued submission id"),
	adoptLoginId: unavailable("adopt a login id"),
	adoptJsonRpcRequestId: unavailable("adopt a request id"),
	adoptDynamicToolCallId: unavailable("adopt a dynamic tool call id"),
	adoptApprovalId: unavailable("adopt an approval id"),
	adoptCodexResponseIdentities: unavailable("adopt response identities"),
	serializeCodexIdentity: unavailable("serialise an identity"),
	serializeJsonRpcRequestId: unavailable("serialise a request id"),
	createWireRequestCorrelation: unavailable("create a wire correlation"),
	parseWireRequestCorrelation: unavailable("parse a wire correlation"),
	createLogicalToolCallCorrelation: unavailable("create a tool call correlation"),
	parseLogicalToolCallCorrelation: unavailable("parse a tool call correlation"),
};

const validator: IdentityValidator = {
	childId: parseIdentity("wire-child", "child"),
	epoch: parseIdentity("wire-epoch", "epoch"),
	isCurrentEpoch: alwaysCurrent,
	assertCurrentEpoch: assertNothing,
};

const operation: Pick<OperationAuthority, "decoder" | "validator"> = {
	decoder: {
		parseOperationId: identityParser("operation"),
		serializeOperationId: unavailable("serialise an operation id"),
	},
	validator: {
		isCurrentOperationId: alwaysCurrent,
		assertCurrentOperationId: assertNothing,
	},
};

/** The browser's inert identity context for the shared browser model. */
const wireIdentityContext: IdentityContext = { decoder, validator, operation };

export {
	BrowserWorkbenchWireError,
	WIRE_IDENTITY_MAX_BYTES,
	parseIdentity,
	wireIdentityContext,
	type IdentityByDomain,
};
