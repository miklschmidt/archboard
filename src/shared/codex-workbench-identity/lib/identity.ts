const WIRE_PREFIX = "archboard";
const WIRE_TOKEN_LIMIT = 8193;
const RAW_ID_LIMIT_BYTES = 4096;
export const CANONICAL_ITEM_ID_MAX_LENGTH = `${WIRE_PREFIX}:item:`.length + WIRE_TOKEN_LIMIT;
const TOKEN_PATTERN = new RegExp(`^[A-Za-z0-9][A-Za-z0-9._~-]{0,${WIRE_TOKEN_LIMIT - 1}}$`);
const WIRE_PATTERN = new RegExp(
	`^${WIRE_PREFIX}:([a-z-]+):([A-Za-z0-9][A-Za-z0-9._~-]{0,${WIRE_TOKEN_LIMIT - 1}})$`,
);
const EPOCH_TOKEN_PATTERN = new RegExp(
	`^([A-Za-z0-9][A-Za-z0-9._~-]{0,${WIRE_TOKEN_LIMIT - 1}})\\.([A-Za-z0-9][A-Za-z0-9._~-]{0,${WIRE_TOKEN_LIMIT - 1}})$`,
);
export const OPERATION_ID_MAX_BYTES = 128 as const;
const OPERATION_ID_MAX_ISSUE_ATTEMPTS = 16 as const;
const OPERATION_TOKEN_PATTERN = new RegExp(
	`^([A-Za-z0-9][A-Za-z0-9._~-]{0,${WIRE_TOKEN_LIMIT - 1}})\\.(h[0-9a-f]{32})$`,
);
const OPERATION_NONCE_PATTERN = /^[0-9a-f]{32}$/u;
const TEXT_LIMIT = 256;

declare const identityBrand: unique symbol;

export type IdentityDomain =
	| "child"
	| "epoch"
	| "browser-command"
	| "thread"
	| "turn"
	| "item"
	| "queued-submission"
	| "login"
	| "json-rpc-request"
	| "dynamic-tool-call"
	| "realtime-session"
	| "approval"
	| "operation";

const IDENTITY_DOMAINS = new Set<IdentityDomain>([
	"child",
	"epoch",
	"browser-command",
	"thread",
	"turn",
	"item",
	"queued-submission",
	"login",
	"json-rpc-request",
	"dynamic-tool-call",
	"realtime-session",
	"approval",
	"operation",
]);

type BrandedIdentity<Domain extends IdentityDomain> = string & {
	readonly [identityBrand]: Domain;
};

export type JsonRpcRequestIdWireValue = string | number;

export type ChildId = BrandedIdentity<"child">;
export type ChildEpoch = BrandedIdentity<"epoch">;
export type BrowserCommandId = BrandedIdentity<"browser-command">;
export type ThreadId = BrandedIdentity<"thread">;
export type TurnId = BrandedIdentity<"turn">;
export type ItemId = BrandedIdentity<"item">;
export type QueuedSubmissionId = BrandedIdentity<"queued-submission">;
export type LoginId = BrandedIdentity<"login">;
export type JsonRpcRequestId = BrandedIdentity<"json-rpc-request">;
export type DynamicToolCallId = BrandedIdentity<"dynamic-tool-call">;
export type RealtimeSessionId = BrandedIdentity<"realtime-session">;
export type ApprovalId = BrandedIdentity<"approval">;
/** A host-issued workbench mutation correlation, bound to one child epoch. */
export type OperationId = BrandedIdentity<"operation">;

export type AnyIdentity =
	| ChildId
	| ChildEpoch
	| BrowserCommandId
	| ThreadId
	| TurnId
	| ItemId
	| QueuedSubmissionId
	| LoginId
	| JsonRpcRequestId
	| DynamicToolCallId
	| RealtimeSessionId
	| ApprovalId
	| OperationId;

/** Identities that may appear in Codex requests or reverse requests. */
export type CodexIdentity =
	| ThreadId
	| TurnId
	| ItemId
	| QueuedSubmissionId
	| LoginId
	| JsonRpcRequestId
	| DynamicToolCallId
	| ApprovalId;

export interface WireRequestCorrelation {
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly requestId: JsonRpcRequestId;
}

export interface LogicalToolCallCorrelation {
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly threadId: ThreadId;
	readonly turnId: TurnId;
	readonly callId: DynamicToolCallId;
	readonly namespace: string;
	readonly tool: string;
	readonly manifestHash: string;
}

/** Stable identity for one logical dynamic-tool call across wire retries and owners. */
export function logicalToolCallKey(call: LogicalToolCallCorrelation): string {
	return JSON.stringify([
		call.child,
		call.epoch,
		call.threadId,
		call.turnId,
		call.callId,
		call.namespace,
		call.tool,
		call.manifestHash,
	]);
}

export interface WireRequestCorrelationInput {
	readonly requestId: JsonRpcRequestId;
}

export interface LogicalToolCallCorrelationInput {
	readonly threadId: ThreadId;
	readonly turnId: TurnId;
	readonly callId: DynamicToolCallId;
	readonly namespace: string;
	readonly tool: string;
	readonly manifestHash: string;
}

export type IdentityValidationCode =
	| "invalid-shape"
	| "empty"
	| "wrong-domain"
	| "unissued"
	| "stale-epoch"
	| "wrong-child"
	| "issuance-exhausted"
	| "extra-field"
	| "invalid-field";

export class IdentityValidationError extends Error {
	readonly code: IdentityValidationCode;
	readonly domain?: IdentityDomain;

	constructor(code: IdentityValidationCode, message: string, domain?: IdentityDomain) {
		super(message);
		this.name = "IdentityValidationError";
		this.code = code;
		this.domain = domain;
	}
}

type IdentityValue<Domain extends IdentityDomain> = BrandedIdentity<Domain>;

function fail(code: IdentityValidationCode, message: string, domain?: IdentityDomain): never {
	throw new IdentityValidationError(code, message, domain);
}

function requireRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return fail("invalid-shape", "An identity correlation must be a record.");
	}
	const record = value as Record<string, unknown>;
	for (const key of Reflect.ownKeys(record)) {
		if (typeof key !== "string" || !keys.includes(key)) {
			return fail("extra-field", "An identity correlation contains an unexpected field.");
		}
	}
	for (const key of keys) {
		if (!Object.prototype.hasOwnProperty.call(record, key)) {
			return fail("invalid-shape", `Missing correlation field "${key}".`);
		}
	}
	return record;
}

function requireToken(value: unknown, domain: IdentityDomain): string {
	if (typeof value !== "string") {
		return fail("invalid-shape", `${domain} identity must be a string.`, domain);
	}
	if (value.length === 0) return fail("empty", `${domain} identity must not be empty.`, domain);
	if (value.trim() !== value) {
		return fail(
			"invalid-shape",
			`${domain} identity must not have surrounding whitespace.`,
			domain,
		);
	}
	const match = WIRE_PATTERN.exec(value);
	if (!match) return fail("invalid-shape", `Invalid ${domain} identity wire value.`, domain);
	if (match[1] !== domain) return fail("wrong-domain", `Expected a ${domain} identity.`, domain);
	return match[2] as string;
}

function wireValue<Domain extends IdentityDomain>(
	domain: Domain,
	token: string,
): IdentityValue<Domain> {
	if (!TOKEN_PATTERN.test(token)) {
		return fail("invalid-shape", `Invalid ${domain} identity token.`, domain);
	}
	return `${WIRE_PREFIX}:${domain}:${token}` as IdentityValue<Domain>;
}

function mintToken(): string {
	return crypto.randomUUID().replaceAll("-", "");
}

function tokenOf(value: AnyIdentity): string {
	const match = WIRE_PATTERN.exec(value);
	if (!match) return fail("invalid-shape", "Identity is not a canonical wire value.");
	return match[2] as string;
}

function mintHostValue<Domain extends IdentityDomain>(domain: Domain): IdentityValue<Domain> {
	return wireValue(domain, `h${mintToken()}`);
}

function parseValue<Domain extends IdentityDomain>(
	value: unknown,
	domain: Domain,
): IdentityValue<Domain> {
	requireToken(value, domain);
	return value as IdentityValue<Domain>;
}

function parseEpochValue(value: unknown, expectedChild?: ChildId): ChildEpoch {
	const token = requireToken(value, "epoch");
	const match = EPOCH_TOKEN_PATTERN.exec(token);
	if (!match) {
		return fail("invalid-shape", "A child epoch must bind to a child identity.", "epoch");
	}
	if (expectedChild !== undefined && match[1] !== tokenOf(expectedChild)) {
		return fail("wrong-child", "The child epoch belongs to another child.", "epoch");
	}
	return value as ChildEpoch;
}

function mintEpochValue(child: ChildId): ChildEpoch {
	return wireValue("epoch", `${tokenOf(child)}.h${mintToken()}`);
}

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

function requireOperationToken(value: unknown, childId: ChildId, epoch: ChildEpoch): string {
	const token = requireToken(value, "operation");
	if (new TextEncoder().encode(String(value)).byteLength > OPERATION_ID_MAX_BYTES) {
		return fail(
			"invalid-shape",
			`Operation identity exceeds ${OPERATION_ID_MAX_BYTES} UTF-8 bytes.`,
			"operation",
		);
	}
	const match = OPERATION_TOKEN_PATTERN.exec(token);
	const epochToken = match?.[1];
	if (epochToken === undefined || !EPOCH_TOKEN_PATTERN.test(epochToken)) {
		return fail(
			"invalid-shape",
			"Operation identity must carry a durable epoch token.",
			"operation",
		);
	}
	const currentEpochToken = tokenOf(epoch);
	if (epochToken !== currentEpochToken) {
		if (epochToken.startsWith(`${tokenOf(childId)}.`)) {
			return fail("stale-epoch", "The operation belongs to a stale child epoch.", "operation");
		}
		return fail("wrong-child", "The operation belongs to another child.", "operation");
	}
	return token;
}

function isWellFormedUnicode(value: string): boolean {
	for (let index = 0; index < value.length; index++) {
		const codeUnit = value.charCodeAt(index);
		if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
			const next = value.charCodeAt(index + 1);
			if (Number.isNaN(next) || next < 0xdc00 || next > 0xdfff) return false;
			index++;
		} else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
			return false;
		}
	}
	return true;
}

function encodeRawIdentity(raw: string, domain: IdentityDomain): string {
	if (raw.length === 0) return fail("empty", `${domain} identity must not be empty.`, domain);
	if (!isWellFormedUnicode(raw)) {
		return fail(
			"invalid-shape",
			`The server ${domain} identity contains ill-formed Unicode.`,
			domain,
		);
	}
	const bytes = new TextEncoder().encode(raw);
	if (bytes.byteLength > RAW_ID_LIMIT_BYTES || raw.includes("\0")) {
		return fail(
			"invalid-shape",
			`The server ${domain} identity is not a valid wire value.`,
			domain,
		);
	}
	let encoded = "";
	for (const byte of bytes) encoded += byte.toString(16).padStart(2, "0");
	return `s${encoded}`;
}

function encodeRawJsonRpcRequestId(raw: JsonRpcRequestIdWireValue): string {
	if (typeof raw === "string") return encodeRawIdentity(raw, "json-rpc-request");
	if (!Number.isSafeInteger(raw)) {
		return fail(
			"invalid-shape",
			"The server json-rpc-request identity must be a string or integer.",
			"json-rpc-request",
		);
	}
	const encoded = new TextEncoder().encode(Object.is(raw, -0) ? "-0" : String(raw));
	if (encoded.byteLength > RAW_ID_LIMIT_BYTES) {
		return fail(
			"invalid-shape",
			"The server json-rpc-request identity is too large.",
			"json-rpc-request",
		);
	}
	let hex = "";
	for (const byte of encoded) hex += byte.toString(16).padStart(2, "0");
	return `n${hex}`;
}

function assertText(value: unknown, field: string): string {
	if (
		typeof value !== "string" ||
		value.length === 0 ||
		value.trim() !== value ||
		value.length > TEXT_LIMIT
	) {
		return fail("invalid-field", `${field} must be a non-empty bounded string.`);
	}
	if (value.includes("\0")) return fail("invalid-field", `${field} must not contain NUL.`);
	return value;
}

function assertCurrent(
	child: ChildId,
	epoch: ChildEpoch,
	currentChild: ChildId,
	currentEpoch: ChildEpoch,
): void {
	if (child !== currentChild)
		return fail("wrong-child", "The correlation belongs to another child.");
	if (epoch !== currentEpoch) {
		return fail("stale-epoch", "The correlation belongs to a stale child epoch.");
	}
}

function assertIssued<Domain extends IdentityDomain>(
	value: IdentityValue<Domain>,
	domain: Domain,
	issued: ReadonlyMap<IdentityDomain, ReadonlySet<string>>,
): void {
	if (!issued.get(domain)?.has(value)) {
		return fail(
			"unissued",
			`The ${domain} identity was not issued by this workbench session.`,
			domain,
		);
	}
}

function identityDomain(value: unknown): IdentityDomain {
	if (typeof value !== "string") return fail("invalid-shape", "Identity must be a string.");
	const match = WIRE_PATTERN.exec(value);
	if (!match || !IDENTITY_DOMAINS.has(match[1] as IdentityDomain)) {
		return fail("invalid-shape", "Identity is not a canonical workbench identity.");
	}
	return match[1] as IdentityDomain;
}

const CORRELATION_KEYS = ["child", "epoch", "requestId"] as const;
const TOOL_CORRELATION_KEYS = [
	"child",
	"epoch",
	"threadId",
	"turnId",
	"callId",
	"namespace",
	"tool",
	"manifestHash",
] as const;

export interface IdentityValidator {
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly isCurrentEpoch: (child: ChildId, epoch: ChildEpoch) => boolean;
	readonly assertCurrentEpoch: (child: ChildId, epoch: ChildEpoch) => void;
}

/** The only capability ordinary mutation owners need to validate an OperationId. */
export interface OperationIdValidator {
	readonly isCurrentOperationId: (operationId: OperationId) => boolean;
	readonly assertCurrentOperationId: (operationId: OperationId) => void;
}

/** Host-owned IDs are minted here; server-owned IDs can only enter via the trusted decoder. */
export interface IdentityIssuer {
	readonly mintBrowserCommandId: () => BrowserCommandId;
	readonly mintJsonRpcRequestId: () => JsonRpcRequestId;
	readonly mintRealtimeSessionId: () => RealtimeSessionId;
	readonly mintChildEpoch: () => ChildEpoch;
}

/** The only capability that can issue a host-owned OperationId. */
export interface OperationIdIssuer {
	readonly mintOperationId: () => OperationId;
}

/** Raw server identities collected from one decoded app-server response. */
export interface CodexResponseIdentityBatch {
	readonly threadIds?: readonly unknown[];
	readonly turnIds?: readonly unknown[];
	readonly itemIds?: readonly unknown[];
	readonly queuedSubmissionIds?: readonly unknown[];
	readonly loginIds?: readonly unknown[];
}

/** Branded identities returned in the same order as one response batch. */
export interface AdoptedCodexResponseIdentityBatch {
	readonly threadIds: readonly ThreadId[];
	readonly turnIds: readonly TurnId[];
	readonly itemIds: readonly ItemId[];
	readonly queuedSubmissionIds: readonly QueuedSubmissionId[];
	readonly loginIds: readonly LoginId[];
}

/**
 * This capability is passed only to protocol decoders. Its adoption methods
 * are deliberately absent from IdentityValidator and IdentityIssuer.
 */
export interface TrustedIdentityDecoder {
	readonly parseChildId: (value: unknown) => ChildId;
	readonly parseChildEpoch: (value: unknown) => ChildEpoch;
	readonly parseBrowserCommandId: (value: unknown) => BrowserCommandId;
	readonly parseThreadId: (value: unknown) => ThreadId;
	readonly parseTurnId: (value: unknown) => TurnId;
	readonly parseItemId: (value: unknown) => ItemId;
	readonly parseQueuedSubmissionId: (value: unknown) => QueuedSubmissionId;
	readonly parseLoginId: (value: unknown) => LoginId;
	readonly parseJsonRpcRequestId: (value: unknown) => JsonRpcRequestId;
	readonly parseDynamicToolCallId: (value: unknown) => DynamicToolCallId;
	readonly parseRealtimeSessionId: (value: unknown) => RealtimeSessionId;
	readonly parseApprovalId: (value: unknown) => ApprovalId;
	/** Resolves a raw Codex thread id only when this authority already issued it. */
	readonly resolveThreadId: (raw: unknown) => ThreadId;
	/** Resolves a raw Codex item id only when this authority already issued it. */
	readonly resolveItemId: (raw: unknown) => ItemId;
	readonly adoptThreadId: (raw: unknown) => ThreadId;
	readonly adoptTurnId: (raw: unknown) => TurnId;
	readonly adoptItemId: (raw: unknown) => ItemId;
	readonly adoptQueuedSubmissionId: (raw: unknown) => QueuedSubmissionId;
	readonly adoptLoginId: (raw: unknown) => LoginId;
	readonly adoptJsonRpcRequestId: (raw: unknown) => JsonRpcRequestId;
	readonly adoptDynamicToolCallId: (raw: unknown) => DynamicToolCallId;
	readonly adoptApprovalId: (raw: unknown) => ApprovalId;
	/** Validates a complete decoded response before adopting any identity from it. */
	readonly adoptCodexResponseIdentities: (
		batch: CodexResponseIdentityBatch,
	) => AdoptedCodexResponseIdentityBatch;
	readonly serializeCodexIdentity: (identity: CodexIdentity) => string;
	readonly serializeJsonRpcRequestId: (identity: JsonRpcRequestId) => JsonRpcRequestIdWireValue;
	readonly createWireRequestCorrelation: (
		input: WireRequestCorrelationInput,
	) => WireRequestCorrelation;
	readonly parseWireRequestCorrelation: (value: unknown) => WireRequestCorrelation;
	readonly createLogicalToolCallCorrelation: (
		input: LogicalToolCallCorrelationInput,
	) => LogicalToolCallCorrelation;
	readonly parseLogicalToolCallCorrelation: (value: unknown) => LogicalToolCallCorrelation;
}

/** Trusted protocol code may parse and serialize, but never adopt, OperationIds. */
export interface TrustedOperationIdDecoder {
	readonly parseOperationId: (value: unknown) => OperationId;
	readonly serializeOperationId: (identity: OperationId) => string;
}

/** The complete operation capability is composed only at the authority boundary. */
export interface OperationAuthority {
	readonly validator: OperationIdValidator;
	readonly issuer: OperationIdIssuer;
	readonly decoder: TrustedOperationIdDecoder;
}

export interface IdentityAuthority {
	readonly validator: IdentityValidator;
	readonly issuer: IdentityIssuer;
	readonly decoder: TrustedIdentityDecoder;
}

/** The factory return type composes legacy identity capabilities with operation capabilities. */
export interface IdentityAuthorities {
	readonly identity: IdentityAuthority;
	readonly operation: OperationAuthority;
}

/**
 * Process-lifetime identity facts and issuance history. The ledger is data only;
 * every source generation builds fresh validators, issuers, and decoders over it.
 */
export interface IdentityLedger {
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

function createAuthority(ledger: IdentityLedger): IdentityAuthorities {
	const { childId, epoch, issued, rawByIdentity } = ledger;

	const issue = <Domain extends IdentityDomain>(
		domain: Domain,
		token: string,
		raw: JsonRpcRequestIdWireValue,
	): IdentityValue<Domain> => {
		const value = wireValue(domain, token);
		let values = issued.get(domain);
		if (values === undefined) {
			values = new Set<string>();
			issued.set(domain, values);
		}
		values.add(value);
		rawByIdentity.set(value, raw);
		return value;
	};

	const issueExisting = <Domain extends IdentityDomain>(
		domain: Domain,
		value: IdentityValue<Domain>,
		raw: JsonRpcRequestIdWireValue,
	): IdentityValue<Domain> => issue(domain, tokenOf(value as AnyIdentity), raw);

	issueExisting("child", childId, tokenOf(childId));
	issueExisting("epoch", epoch, tokenOf(epoch));

	const mint = <Domain extends IdentityDomain>(domain: Domain): IdentityValue<Domain> => {
		const raw = mintToken();
		return issue(domain, `h${raw}`, raw);
	};
	const mintOperation = (): OperationId => {
		for (let attempt = 0; attempt < OPERATION_ID_MAX_ISSUE_ATTEMPTS; attempt++) {
			const value = operationWireValue(epoch, mintToken());
			if (issued.get("operation")?.has(value) !== true) {
				return issue("operation", tokenOf(value), value);
			}
		}
		return fail(
			"issuance-exhausted",
			`Could not issue a unique operation identity after ${OPERATION_ID_MAX_ISSUE_ATTEMPTS} attempts.`,
			"operation",
		);
	};
	const adopt = <Domain extends AdoptableDomain>(
		domain: Domain,
		rawValue: unknown,
	): IdentityValue<Domain> => {
		if (typeof rawValue !== "string") {
			return fail("invalid-shape", `The server ${domain} identity must be a string.`, domain);
		}
		const token = encodeRawIdentity(rawValue, domain);
		return issue(domain, token, rawValue);
	};
	const adoptJsonRpcRequestId = (rawValue: unknown): JsonRpcRequestId => {
		if (
			(typeof rawValue !== "string" && typeof rawValue !== "number") ||
			(typeof rawValue === "number" && !Number.isSafeInteger(rawValue))
		) {
			return fail(
				"invalid-shape",
				"The server json-rpc-request identity must be a string or integer.",
				"json-rpc-request",
			);
		}
		const token = encodeRawJsonRpcRequestId(rawValue);
		return issue("json-rpc-request", token, rawValue);
	};
	type ResponseAdoptionDomain = "thread" | "turn" | "item" | "queued-submission" | "login";
	interface StagedResponseIdentity<Domain extends ResponseAdoptionDomain> {
		readonly domain: Domain;
		readonly raw: string;
		readonly value: IdentityValue<Domain>;
	}
	const stageResponseIdentity = <Domain extends ResponseAdoptionDomain>(
		domain: Domain,
		rawValue: unknown,
	): StagedResponseIdentity<Domain> => {
		if (typeof rawValue !== "string") {
			return fail("invalid-shape", `The server ${domain} identity must be a string.`, domain);
		}
		return {
			domain,
			raw: rawValue,
			value: wireValue(domain, encodeRawIdentity(rawValue, domain)),
		};
	};
	const stageResponseIdentities = <Domain extends ResponseAdoptionDomain>(
		domain: Domain,
		values: readonly unknown[] | undefined,
	): readonly StagedResponseIdentity<Domain>[] =>
		(values ?? []).map((value) => stageResponseIdentity(domain, value));
	const commitResponseIdentities = <Domain extends ResponseAdoptionDomain>(
		values: readonly StagedResponseIdentity<Domain>[],
	): readonly IdentityValue<Domain>[] =>
		values.map(({ domain, raw, value }) => issueExisting(domain, value, raw));
	const adoptCodexResponseIdentities = (
		batch: CodexResponseIdentityBatch,
	): AdoptedCodexResponseIdentityBatch => {
		const threadIds = stageResponseIdentities("thread", batch.threadIds);
		const turnIds = stageResponseIdentities("turn", batch.turnIds);
		const itemIds = stageResponseIdentities("item", batch.itemIds);
		const queuedSubmissionIds = stageResponseIdentities(
			"queued-submission",
			batch.queuedSubmissionIds,
		);
		const loginIds = stageResponseIdentities("login", batch.loginIds);

		// Staging every domain first makes a hostile late field fail without
		// trusting the valid identities that preceded it in the response.
		return Object.freeze({
			threadIds: Object.freeze(commitResponseIdentities(threadIds)),
			turnIds: Object.freeze(commitResponseIdentities(turnIds)),
			itemIds: Object.freeze(commitResponseIdentities(itemIds)),
			queuedSubmissionIds: Object.freeze(commitResponseIdentities(queuedSubmissionIds)),
			loginIds: Object.freeze(commitResponseIdentities(loginIds)),
		});
	};
	const parseIssued = <Domain extends IdentityDomain>(
		domain: Domain,
		value: unknown,
	): IdentityValue<Domain> => {
		const parsed = parseValue(value, domain);
		assertIssued(parsed, domain, issued);
		return parsed;
	};
	const parseOperation = (value: unknown): OperationId => {
		const parsed = parseValue(value, "operation");
		requireOperationToken(parsed, childId, epoch);
		assertIssued(parsed, "operation", issued);
		return parsed;
	};
	const resolve = <Domain extends "thread" | "item">(
		domain: Domain,
		rawValue: unknown,
	): IdentityValue<Domain> => {
		if (typeof rawValue !== "string") {
			return fail("invalid-shape", `The server ${domain} identity must be a string.`, domain);
		}
		return parseIssued(domain, wireValue(domain, encodeRawIdentity(rawValue, domain)));
	};
	const serialize = (value: CodexIdentity): string => {
		const domain = identityDomain(value);
		if (
			domain !== "thread" &&
			domain !== "turn" &&
			domain !== "item" &&
			domain !== "queued-submission" &&
			domain !== "login" &&
			domain !== "json-rpc-request" &&
			domain !== "dynamic-tool-call" &&
			domain !== "approval"
		) {
			return fail("wrong-domain", "Identity is not a Codex wire identity.", domain);
		}
		assertIssued(value, domain, issued);
		const raw = rawByIdentity.get(value);
		if (raw === undefined) return fail("unissued", "Identity has no trusted wire value.", domain);
		return String(raw);
	};
	const serializeJsonRpc = (value: JsonRpcRequestId): JsonRpcRequestIdWireValue => {
		const domain = identityDomain(value);
		if (domain !== "json-rpc-request")
			return fail("wrong-domain", "Identity is not a JSON-RPC request identity.", domain);
		assertIssued(value, domain, issued);
		const raw = rawByIdentity.get(value);
		if (raw === undefined) return fail("unissued", "Identity has no trusted wire value.", domain);
		return raw;
	};
	const assertCurrentOperationId = (value: OperationId): void => {
		parseOperation(value);
	};
	const isCurrentOperationId = (value: OperationId): boolean => {
		try {
			assertCurrentOperationId(value);
			return true;
		} catch (error) {
			if (error instanceof IdentityValidationError) return false;
			throw error;
		}
	};

	const validator: IdentityValidator = {
		childId,
		epoch,
		isCurrentEpoch: (child, candidateEpoch) => child === childId && candidateEpoch === epoch,
		assertCurrentEpoch: (child, candidateEpoch) =>
			assertCurrent(child, candidateEpoch, childId, epoch),
	};
	Object.freeze(validator);
	const issuer: IdentityIssuer = {
		mintBrowserCommandId: () => mint("browser-command"),
		mintJsonRpcRequestId: () => mint("json-rpc-request"),
		mintRealtimeSessionId: () => mint("realtime-session"),
		mintChildEpoch: () => {
			const nextEpoch = mintEpochValue(childId);
			issueExisting("epoch", nextEpoch, tokenOf(nextEpoch));
			return nextEpoch;
		},
	};
	Object.freeze(issuer);
	const decoder: TrustedIdentityDecoder = {
		parseChildId: (value) => parseIssued("child", value),
		parseChildEpoch: (value) => {
			const parsed = parseEpochValue(value, childId);
			assertIssued(parsed, "epoch", issued);
			return parsed;
		},
		parseBrowserCommandId: (value) => parseIssued("browser-command", value),
		parseThreadId: (value) => parseIssued("thread", value),
		parseTurnId: (value) => parseIssued("turn", value),
		parseItemId: (value) => parseIssued("item", value),
		parseQueuedSubmissionId: (value) => parseIssued("queued-submission", value),
		parseLoginId: (value) => parseIssued("login", value),
		parseJsonRpcRequestId: (value) => parseIssued("json-rpc-request", value),
		parseDynamicToolCallId: (value) => parseIssued("dynamic-tool-call", value),
		parseRealtimeSessionId: (value) => parseIssued("realtime-session", value),
		parseApprovalId: (value) => parseIssued("approval", value),
		resolveThreadId: (raw) => resolve("thread", raw),
		resolveItemId: (raw) => resolve("item", raw),
		adoptThreadId: (raw) => adopt("thread", raw),
		adoptTurnId: (raw) => adopt("turn", raw),
		adoptItemId: (raw) => adopt("item", raw),
		adoptQueuedSubmissionId: (raw) => adopt("queued-submission", raw),
		adoptLoginId: (raw) => adopt("login", raw),
		adoptJsonRpcRequestId,
		adoptDynamicToolCallId: (raw) => adopt("dynamic-tool-call", raw),
		adoptApprovalId: (raw) => adopt("approval", raw),
		adoptCodexResponseIdentities,
		serializeCodexIdentity: serialize,
		serializeJsonRpcRequestId: serializeJsonRpc,
		createWireRequestCorrelation: (input) => {
			const requestId = parseIssued("json-rpc-request", input.requestId);
			return Object.freeze({ child: childId, epoch, requestId });
		},
		parseWireRequestCorrelation: (value) =>
			parseWireRequestCorrelationValue(value, childId, epoch, issued),
		createLogicalToolCallCorrelation: (input) => {
			const threadId = parseIssued("thread", input.threadId);
			const turnId = parseIssued("turn", input.turnId);
			const callId = parseIssued("dynamic-tool-call", input.callId);
			return Object.freeze({
				child: childId,
				epoch,
				threadId,
				turnId,
				callId,
				namespace: assertText(input.namespace, "namespace"),
				tool: assertText(input.tool, "tool"),
				manifestHash: assertText(input.manifestHash, "manifestHash"),
			});
		},
		parseLogicalToolCallCorrelation: (value) =>
			parseLogicalToolCallCorrelationValue(value, childId, epoch, issued),
	};
	Object.freeze(decoder);

	const operationValidator: OperationIdValidator = {
		isCurrentOperationId,
		assertCurrentOperationId,
	};
	Object.freeze(operationValidator);
	const operationIssuer: OperationIdIssuer = { mintOperationId: mintOperation };
	Object.freeze(operationIssuer);
	const operationDecoder: TrustedOperationIdDecoder = {
		parseOperationId: parseOperation,
		serializeOperationId: (value) => parseOperation(value),
	};
	Object.freeze(operationDecoder);

	return {
		identity: Object.freeze({ validator, issuer, decoder }),
		operation: Object.freeze({
			validator: operationValidator,
			issuer: operationIssuer,
			decoder: operationDecoder,
		}),
	};
}

function parseWireRequestCorrelationValue(
	value: unknown,
	childId: ChildId,
	epoch: ChildEpoch,
	issued: ReadonlyMap<IdentityDomain, ReadonlySet<string>>,
): WireRequestCorrelation {
	const record = requireRecord(value, CORRELATION_KEYS);
	const child = parseValue(record["child"], "child");
	const parsedEpoch = parseEpochValue(record["epoch"], child);
	const requestId = parseValue(record["requestId"], "json-rpc-request");
	assertCurrent(child, parsedEpoch, childId, epoch);
	assertIssued(child, "child", issued);
	assertIssued(parsedEpoch, "epoch", issued);
	assertIssued(requestId, "json-rpc-request", issued);
	return Object.freeze({ child, epoch: parsedEpoch, requestId });
}

function parseLogicalToolCallCorrelationValue(
	value: unknown,
	childId: ChildId,
	epoch: ChildEpoch,
	issued: ReadonlyMap<IdentityDomain, ReadonlySet<string>>,
): LogicalToolCallCorrelation {
	const record = requireRecord(value, TOOL_CORRELATION_KEYS);
	const child = parseValue(record["child"], "child");
	const parsedEpoch = parseEpochValue(record["epoch"], child);
	const threadId = parseValue(record["threadId"], "thread");
	const turnId = parseValue(record["turnId"], "turn");
	const callId = parseValue(record["callId"], "dynamic-tool-call");
	assertCurrent(child, parsedEpoch, childId, epoch);
	assertIssued(child, "child", issued);
	assertIssued(parsedEpoch, "epoch", issued);
	assertIssued(threadId, "thread", issued);
	assertIssued(turnId, "turn", issued);
	assertIssued(callId, "dynamic-tool-call", issued);
	return Object.freeze({
		child,
		epoch: parsedEpoch,
		threadId,
		turnId,
		callId,
		namespace: assertText(record["namespace"], "namespace"),
		tool: assertText(record["tool"], "tool"),
		manifestHash: assertText(record["manifestHash"], "manifestHash"),
	});
}

export function createIdentityLedger(): IdentityLedger {
	const childId = mintHostValue("child");
	return {
		childId,
		epoch: mintEpochValue(childId),
		issued: new Map(),
		rawByIdentity: new Map(),
	};
}

export function createIdentityAuthorities(
	ledger: IdentityLedger = createIdentityLedger(),
): IdentityAuthorities {
	return createAuthority(ledger);
}

export function createIdentityAuthority(): IdentityAuthority {
	return createIdentityAuthorities().identity;
}

export function restoreIdentityAuthorities(input: {
	readonly childId: unknown;
	readonly epoch: unknown;
}): IdentityAuthorities {
	const childId = parseValue(input.childId, "child");
	const epoch = parseEpochValue(input.epoch, childId);
	return createAuthority({ childId, epoch, issued: new Map(), rawByIdentity: new Map() });
}

export function restoreIdentityAuthority(input: {
	readonly childId: unknown;
	readonly epoch: unknown;
}): IdentityAuthority {
	return restoreIdentityAuthorities(input).identity;
}
