const WIRE_PREFIX = "archboard";
const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/;
const WIRE_PATTERN = /^archboard:([a-z-]+):([A-Za-z0-9][A-Za-z0-9._~-]{0,127})$/;
const EPOCH_TOKEN_PATTERN =
	/^([A-Za-z0-9][A-Za-z0-9._~-]{0,127})\.([A-Za-z0-9][A-Za-z0-9._~-]{0,127})$/;
const TEXT_LIMIT = 256;
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
]);

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
	| "approval";

type BrandedIdentity<Domain extends IdentityDomain> = string & {
	readonly [identityBrand]: Domain;
};

export type ChildId = BrandedIdentity<"child">;
export type ChildEpoch = BrandedIdentity<"epoch">;
export type BrowserCommandId = BrandedIdentity<"browser-command">;
export type ThreadId = BrandedIdentity<"thread">;
export type TurnId = BrandedIdentity<"turn">;
export type ItemId = BrandedIdentity<"item">;
export type QueuedSubmissionId = BrandedIdentity<"queued-submission">;
export type LoginId = BrandedIdentity<"login">;
export type JsonRpcRequestId = BrandedIdentity<"json-rpc-request">;
export type JSONRPCRequestId = JsonRpcRequestId;
export type DynamicToolCallId = BrandedIdentity<"dynamic-tool-call">;
export type RealtimeSessionId = BrandedIdentity<"realtime-session">;
export type ApprovalId = BrandedIdentity<"approval">;

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
	const actual = Object.keys(record);
	for (const key of actual) {
		if (!keys.includes(key)) fail("extra-field", `Unexpected correlation field "${key}".`);
	}
	for (const key of keys) {
		if (!(key in record)) fail("invalid-shape", `Missing correlation field "${key}".`);
	}
	return record;
}

function requireToken(value: unknown, domain: IdentityDomain): string {
	if (typeof value !== "string")
		return fail("invalid-shape", `${domain} identity must be a string.`, domain);
	if (value.length === 0) return fail("empty", `${domain} identity must not be empty.`, domain);
	if (value.trim() !== value)
		return fail(
			"invalid-shape",
			`${domain} identity must not have surrounding whitespace.`,
			domain,
		);
	const match = WIRE_PATTERN.exec(value);
	if (!match) return fail("invalid-shape", `Invalid ${domain} identity wire value.`, domain);
	if (match[1] !== domain) return fail("wrong-domain", `Expected a ${domain} identity.`, domain);
	return match[2] as string;
}

function wireValue<Domain extends IdentityDomain>(
	domain: Domain,
	token: string,
): IdentityValue<Domain> {
	if (!TOKEN_PATTERN.test(token))
		fail("invalid-shape", `Invalid ${domain} identity token.`, domain);
	return `${WIRE_PREFIX}:${domain}:${token}` as IdentityValue<Domain>;
}

function mintToken(): string {
	return crypto.randomUUID().replaceAll("-", "");
}

function mintValue<Domain extends IdentityDomain>(domain: Domain): IdentityValue<Domain> {
	return wireValue(domain, mintToken());
}

function parseValue<Domain extends IdentityDomain>(
	value: unknown,
	domain: Domain,
): IdentityValue<Domain> {
	requireToken(value, domain);
	return value as IdentityValue<Domain>;
}

function tokenOf(value: AnyIdentity): string {
	const match = WIRE_PATTERN.exec(value);
	if (!match) return fail("invalid-shape", "Identity is not a canonical wire value.");
	return match[2] as string;
}

function parseEpochValue(value: unknown, expectedChild?: ChildId): ChildEpoch {
	const token = requireToken(value, "epoch");
	const match = EPOCH_TOKEN_PATTERN.exec(token);
	if (!match) return fail("invalid-shape", "A child epoch must bind to a child identity.", "epoch");
	if (expectedChild !== undefined && match[1] !== tokenOf(expectedChild)) {
		return fail("wrong-child", "The child epoch belongs to another child.", "epoch");
	}
	return value as ChildEpoch;
}

function mintEpochValue(child: ChildId): ChildEpoch {
	return wireValue("epoch", `${tokenOf(child)}.${mintToken()}`);
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
	if (epoch !== currentEpoch)
		return fail("stale-epoch", "The correlation belongs to a stale child epoch.");
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

export interface IdentityAuthority {
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly parseChildId: (value: unknown) => ChildId;
	readonly parseChildEpoch: (value: unknown) => ChildEpoch;
	readonly mintBrowserCommandId: () => BrowserCommandId;
	readonly mintThreadId: () => ThreadId;
	readonly mintTurnId: () => TurnId;
	readonly mintItemId: () => ItemId;
	readonly mintQueuedSubmissionId: () => QueuedSubmissionId;
	readonly mintLoginId: () => LoginId;
	readonly mintJsonRpcRequestId: () => JsonRpcRequestId;
	readonly mintDynamicToolCallId: () => DynamicToolCallId;
	readonly mintRealtimeSessionId: () => RealtimeSessionId;
	readonly mintApprovalId: () => ApprovalId;
	readonly adoptThreadId: (wireValue: unknown) => ThreadId;
	readonly adoptTurnId: (wireValue: unknown) => TurnId;
	readonly adoptItemId: (wireValue: unknown) => ItemId;
	readonly adoptQueuedSubmissionId: (wireValue: unknown) => QueuedSubmissionId;
	readonly adoptLoginId: (wireValue: unknown) => LoginId;
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
	readonly createWireRequestCorrelation: (
		input: WireRequestCorrelationInput,
	) => WireRequestCorrelation;
	readonly parseWireRequestCorrelation: (value: unknown) => WireRequestCorrelation;
	readonly createLogicalToolCallCorrelation: (
		input: LogicalToolCallCorrelationInput,
	) => LogicalToolCallCorrelation;
	readonly parseLogicalToolCallCorrelation: (value: unknown) => LogicalToolCallCorrelation;
}

type AdoptableDomain = "thread" | "turn" | "item" | "queued-submission" | "login";

function createAuthority(childId: ChildId, epoch: ChildEpoch): IdentityAuthority {
	const issued = new Map<IdentityDomain, Set<string>>();
	const issue = <Domain extends IdentityDomain>(
		domain: Domain,
		value: IdentityValue<Domain>,
	): IdentityValue<Domain> => {
		let values = issued.get(domain);
		if (values === undefined) {
			values = new Set<string>();
			issued.set(domain, values);
		}
		values.add(value);
		return value;
	};

	issue("child", childId);
	issue("epoch", epoch);

	const mint = <Domain extends IdentityDomain>(domain: Domain): IdentityValue<Domain> =>
		issue(domain, mintValue(domain));
	const adopt = <Domain extends AdoptableDomain>(
		domain: Domain,
		raw: unknown,
	): IdentityValue<Domain> => {
		if (
			typeof raw !== "string" ||
			raw.length === 0 ||
			raw.trim() !== raw ||
			!TOKEN_PATTERN.test(raw)
		) {
			return fail(
				"invalid-shape",
				`The server ${domain} identity is not a valid wire token.`,
				domain,
			);
		}
		return issue(domain, wireValue(domain, raw));
	};
	const parseIssued = <Domain extends IdentityDomain>(
		domain: Domain,
		value: unknown,
	): IdentityValue<Domain> => {
		const parsed = parseValue(value, domain);
		assertIssued(parsed, domain, issued);
		return parsed;
	};

	return {
		childId,
		epoch,
		parseChildId: (value) => parseIssued("child", value),
		parseChildEpoch: (value) => {
			const parsed = parseEpochValue(value, childId);
			assertIssued(parsed, "epoch", issued);
			return parsed;
		},
		mintBrowserCommandId: () => mint("browser-command"),
		mintThreadId: () => mint("thread"),
		mintTurnId: () => mint("turn"),
		mintItemId: () => mint("item"),
		mintQueuedSubmissionId: () => mint("queued-submission"),
		mintLoginId: () => mint("login"),
		mintJsonRpcRequestId: () => mint("json-rpc-request"),
		mintDynamicToolCallId: () => mint("dynamic-tool-call"),
		mintRealtimeSessionId: () => mint("realtime-session"),
		mintApprovalId: () => mint("approval"),
		adoptThreadId: (raw) => adopt("thread", raw),
		adoptTurnId: (raw) => adopt("turn", raw),
		adoptItemId: (raw) => adopt("item", raw),
		adoptQueuedSubmissionId: (raw) => adopt("queued-submission", raw),
		adoptLoginId: (raw) => adopt("login", raw),
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
}

function parseWireRequestCorrelationValue(
	value: unknown,
	childId: ChildId,
	epoch: ChildEpoch,
	issued: ReadonlyMap<IdentityDomain, ReadonlySet<string>>,
): WireRequestCorrelation {
	const record = requireRecord(value, CORRELATION_KEYS);
	const child = parseValue(record.child, "child");
	const parsedEpoch = parseEpochValue(record.epoch, child);
	const requestId = parseValue(record.requestId, "json-rpc-request");
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
	const child = parseValue(record.child, "child");
	const parsedEpoch = parseEpochValue(record.epoch, child);
	const threadId = parseValue(record.threadId, "thread");
	const turnId = parseValue(record.turnId, "turn");
	const callId = parseValue(record.callId, "dynamic-tool-call");
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
		namespace: assertText(record.namespace, "namespace"),
		tool: assertText(record.tool, "tool"),
		manifestHash: assertText(record.manifestHash, "manifestHash"),
	});
}

export function createIdentityAuthority(): IdentityAuthority {
	const childId = mintValue("child");
	return createAuthority(childId, mintEpochValue(childId));
}

export function restoreIdentityAuthority(input: {
	readonly childId: unknown;
	readonly epoch: unknown;
}): IdentityAuthority {
	const childId = parseChildId(input.childId);
	const epoch = parseChildEpoch(input.epoch, childId);
	return createAuthority(childId, epoch);
}

export function mintChildId(): ChildId {
	return mintValue("child");
}

export function mintChildEpoch(childId: ChildId): ChildEpoch {
	parseChildId(childId);
	return mintEpochValue(childId);
}

export function parseChildId(value: unknown): ChildId {
	return parseValue(value, "child");
}

export function parseChildEpoch(value: unknown, expectedChild?: ChildId): ChildEpoch {
	if (expectedChild !== undefined) parseChildId(expectedChild);
	return parseEpochValue(value, expectedChild);
}

export function parseBrowserCommandId(value: unknown): BrowserCommandId {
	return parseValue(value, "browser-command");
}

export function parseThreadId(value: unknown): ThreadId {
	return parseValue(value, "thread");
}

export function parseTurnId(value: unknown): TurnId {
	return parseValue(value, "turn");
}

export function parseItemId(value: unknown): ItemId {
	return parseValue(value, "item");
}

export function parseQueuedSubmissionId(value: unknown): QueuedSubmissionId {
	return parseValue(value, "queued-submission");
}

export function parseLoginId(value: unknown): LoginId {
	return parseValue(value, "login");
}

export function parseJsonRpcRequestId(value: unknown): JsonRpcRequestId {
	return parseValue(value, "json-rpc-request");
}

export function parseDynamicToolCallId(value: unknown): DynamicToolCallId {
	return parseValue(value, "dynamic-tool-call");
}

export function parseRealtimeSessionId(value: unknown): RealtimeSessionId {
	return parseValue(value, "realtime-session");
}

export function parseApprovalId(value: unknown): ApprovalId {
	return parseValue(value, "approval");
}

export function isCurrentEpoch(
	child: ChildId,
	epoch: ChildEpoch,
	current: Pick<IdentityAuthority, "childId" | "epoch">,
): boolean {
	return child === current.childId && epoch === current.epoch;
}

export function assertCurrentEpoch(
	child: ChildId,
	epoch: ChildEpoch,
	current: Pick<IdentityAuthority, "childId" | "epoch">,
): void {
	assertCurrent(child, epoch, current.childId, current.epoch);
}

export function parseIdentityDomain(value: unknown): IdentityDomain {
	if (typeof value !== "string") return fail("invalid-shape", "Identity domain must be a string.");
	const match = WIRE_PATTERN.exec(value);
	if (!match) return fail("invalid-shape", "Identity is not a canonical wire value.");
	if (!IDENTITY_DOMAINS.has(match[1] as IdentityDomain)) {
		return fail("wrong-domain", "Identity uses an unknown domain.");
	}
	return match[1] as IdentityDomain;
}

export function createWireRequestCorrelation(
	authority: IdentityAuthority,
	input: WireRequestCorrelationInput,
): WireRequestCorrelation {
	return authority.createWireRequestCorrelation(input);
}

export function parseWireRequestCorrelation(
	authority: IdentityAuthority,
	value: unknown,
): WireRequestCorrelation {
	return authority.parseWireRequestCorrelation(value);
}

export function createLogicalToolCallCorrelation(
	authority: IdentityAuthority,
	input: LogicalToolCallCorrelationInput,
): LogicalToolCallCorrelation {
	return authority.createLogicalToolCallCorrelation(input);
}

export function parseLogicalToolCallCorrelation(
	authority: IdentityAuthority,
	value: unknown,
): LogicalToolCallCorrelation {
	return authority.parseLogicalToolCallCorrelation(value);
}
