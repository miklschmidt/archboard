// The wire vocabulary of workbench identities: which domains exist, how a
// canonical value is spelled, how a raw server id is encoded into one, and the
// single place a validated string is branded. A value is
// `<record prefix>:<domain>:<token>`. The record prefix is the host's: its
// ledger mints the child with it, and every value spelled after that copies
// the child's.

// 16 keeps the longest operation id, `<prefix>:operation:h<32>.h<32>.h<32>`, within its 128 bytes.
const RECORD_PREFIX_LIMIT = 16;
const RECORD_PREFIX_SOURCE = `[a-z][a-z0-9-]{0,${RECORD_PREFIX_LIMIT - 1}}`;
const RECORD_PREFIX_PATTERN = new RegExp(`^${RECORD_PREFIX_SOURCE}$`, "u");
const WIRE_TOKEN_LIMIT = 8193;
const RAW_ID_LIMIT_BYTES = 4096;
const CANONICAL_ITEM_ID_MAX_LENGTH = RECORD_PREFIX_LIMIT + ":item:".length + WIRE_TOKEN_LIMIT;
const TOKEN_PATTERN = new RegExp(`^[A-Za-z0-9][A-Za-z0-9._~-]{0,${WIRE_TOKEN_LIMIT - 1}}$`, "u");
const WIRE_PATTERN = new RegExp(
	`^(${RECORD_PREFIX_SOURCE}):([a-z-]+):([A-Za-z0-9][A-Za-z0-9._~-]{0,${WIRE_TOKEN_LIMIT - 1}})$`,
	"u",
);
const EPOCH_TOKEN_PATTERN = new RegExp(
	`^([A-Za-z0-9][A-Za-z0-9._~-]{0,${WIRE_TOKEN_LIMIT - 1}})\\.([A-Za-z0-9][A-Za-z0-9._~-]{0,${WIRE_TOKEN_LIMIT - 1}})$`,
	"u",
);

declare const identityBrand: unique symbol;

type IdentityDomain =
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

const IDENTITY_DOMAINS: ReadonlySet<string> = new Set<IdentityDomain>([
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

type JsonRpcRequestIdWireValue = string | number;

type ChildId = BrandedIdentity<"child">;
type ChildEpoch = BrandedIdentity<"epoch">;
type BrowserCommandId = BrandedIdentity<"browser-command">;
type ThreadId = BrandedIdentity<"thread">;
type TurnId = BrandedIdentity<"turn">;
type ItemId = BrandedIdentity<"item">;
type QueuedSubmissionId = BrandedIdentity<"queued-submission">;
type LoginId = BrandedIdentity<"login">;
type JsonRpcRequestId = BrandedIdentity<"json-rpc-request">;
type DynamicToolCallId = BrandedIdentity<"dynamic-tool-call">;
type RealtimeSessionId = BrandedIdentity<"realtime-session">;
type ApprovalId = BrandedIdentity<"approval">;
/** A server-issued workbench mutation correlation, bound to one child epoch. */
type OperationId = BrandedIdentity<"operation">;

type AnyIdentity =
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
type CodexIdentity =
	| ThreadId
	| TurnId
	| ItemId
	| QueuedSubmissionId
	| LoginId
	| JsonRpcRequestId
	| DynamicToolCallId
	| ApprovalId;

type IdentityValidationCode =
	| "invalid-shape"
	| "empty"
	| "wrong-domain"
	| "unissued"
	| "stale-epoch"
	| "wrong-child"
	| "issuance-exhausted"
	| "extra-field"
	| "invalid-field";

class IdentityValidationError extends Error {
	readonly code: IdentityValidationCode;
	readonly domain: IdentityDomain | undefined;

	/**
	 * Creates a refusal that names both the rule broken and, when known, the
	 * identity domain it was broken in.
	 * @param code - Which validation rule refused the value.
	 * @param message - The human-readable reason.
	 * @param domain - The identity domain being validated, when one applies.
	 */
	constructor(code: IdentityValidationCode, message: string, domain?: IdentityDomain) {
		super(message);
		this.name = "IdentityValidationError";
		this.code = code;
		this.domain = domain;
	}
}

type IdentityValue<Domain extends IdentityDomain> = BrandedIdentity<Domain>;

/**
 * Refuses a value with a typed validation error. Declared `never` so a caller
 * can `return fail(...)` inside a function that must otherwise produce a value.
 * @param code - Which validation rule refused the value.
 * @param message - The human-readable reason.
 * @param domain - The identity domain being validated, when one applies.
 * @throws {IdentityValidationError} Always.
 */
function fail(code: IdentityValidationCode, message: string, domain?: IdentityDomain): never {
	throw new IdentityValidationError(code, message, domain);
}

/**
 * Tells whether a string names one of the identity domains.
 * @param value - The domain segment of a wire value.
 * @returns True when it is a declared identity domain.
 */
function isIdentityDomain(value: string): value is IdentityDomain {
	return IDENTITY_DOMAINS.has(value);
}

/**
 * Brands a string that has already been validated as a canonical wire value
 * of `domain`. This is the one site that manufactures a branded identity; every
 * other path reaches a brand only by validating first.
 * @param value - A string already checked against the wire pattern for `domain`.
 * @returns The same string, carrying the domain brand.
 */
function brand<Domain extends IdentityDomain>(value: string): IdentityValue<Domain> {
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the brand is nominal-only; the callers validate the wire shape before branding
	return value as IdentityValue<Domain>;
}

/**
 * Splits a canonical wire value into its record prefix, domain and token segments.
 * @param value - The string to match.
 * @returns The three segments, or null when the string is not a wire value.
 */
function wireSegments(
	value: string,
): { readonly prefix: string; readonly domain: string; readonly token: string } | null {
	const match = WIRE_PATTERN.exec(value);
	if (match === null) {
		return null;
	}
	const [, prefix, domain, token] = match;
	if (prefix === undefined || domain === undefined || token === undefined) {
		return null;
	}
	return { prefix, domain, token };
}

/**
 * Validates that a value is a canonical wire identity of `domain` and returns
 * its token, refusing with the most specific code available.
 * @param value - The untrusted value.
 * @param domain - The domain the caller expects.
 * @returns The token segment after the domain.
 * @throws {IdentityValidationError} When the value is not a wire identity of that domain.
 */
function requireToken(value: unknown, domain: IdentityDomain): string {
	if (typeof value !== "string") {
		return fail("invalid-shape", `${domain} identity must be a string.`, domain);
	}
	if (value.length === 0) {
		return fail("empty", `${domain} identity must not be empty.`, domain);
	}
	if (value.trim() !== value) {
		return fail(
			"invalid-shape",
			`${domain} identity must not have surrounding whitespace.`,
			domain,
		);
	}
	const segments = wireSegments(value);
	if (segments === null) {
		return fail("invalid-shape", `Invalid ${domain} identity wire value.`, domain);
	}
	if (segments.domain !== domain) {
		return fail("wrong-domain", `Expected a ${domain} identity.`, domain);
	}
	return segments.token;
}

/**
 * Spells a canonical wire value from a record prefix, a domain and a token.
 * @param prefix - A valid record prefix: `prefixOf` an identity, or one `requireRecordPrefix` passed.
 * @param domain - The identity domain.
 * @param token - The token, which must match the token grammar.
 * @returns The branded `<prefix>:<domain>:<token>` value.
 * @throws {IdentityValidationError} When the token does not fit the grammar.
 */
function wireValue<Domain extends IdentityDomain>(
	prefix: string,
	domain: Domain,
	token: string,
): IdentityValue<Domain> {
	if (!TOKEN_PATTERN.test(token)) {
		return fail("invalid-shape", `Invalid ${domain} identity token.`, domain);
	}
	return brand<Domain>(`${prefix}:${domain}:${token}`);
}

/**
 * Checks a host's record prefix, which every identity its ledger spells begins with.
 * @param prefix - The untrusted prefix.
 * @returns The same prefix.
 * @throws {TypeError} When it is not 1 to 16 characters of `[a-z][a-z0-9-]*`.
 */
function requireRecordPrefix(prefix: unknown): string {
	if (typeof prefix !== "string" || !RECORD_PREFIX_PATTERN.test(prefix)) {
		throw new TypeError(`A record prefix must match ^${RECORD_PREFIX_SOURCE}$.`);
	}
	return prefix;
}

/**
 * Mints a fresh random token for a server-owned identity.
 * @returns Thirty-two lowercase hexadecimal characters.
 */
function mintToken(): string {
	return crypto.randomUUID().replaceAll("-", "");
}

/**
 * Reads the token segment back out of a branded identity.
 * @param value - A branded identity of any domain.
 * @returns The token after the domain segment.
 * @throws {IdentityValidationError} When the string is not canonical after all.
 */
function tokenOf(value: BrandedIdentity<IdentityDomain>): string {
	const segments = wireSegments(value);
	if (segments === null) {
		return fail("invalid-shape", "Identity is not a canonical wire value.");
	}
	return segments.token;
}

/**
 * Reads the record prefix back out of a branded identity.
 * @param value - A branded identity of any domain.
 * @returns The prefix before the domain segment.
 * @throws {IdentityValidationError} When the string is not canonical after all.
 */
function prefixOf(value: BrandedIdentity<IdentityDomain>): string {
	const segments = wireSegments(value);
	if (segments === null) {
		return fail("invalid-shape", "Identity is not a canonical wire value.");
	}
	return segments.prefix;
}

/**
 * Mints a server-owned identity whose token is marked with the `h` prefix.
 * @param prefix - The host's record prefix.
 * @param domain - The identity domain to mint in.
 * @returns A fresh branded identity.
 * @throws {TypeError} When the record prefix is not of its shape.
 */
function mintServerValue<Domain extends IdentityDomain>(
	prefix: string,
	domain: Domain,
): IdentityValue<Domain> {
	return wireValue(requireRecordPrefix(prefix), domain, `h${mintToken()}`);
}

/**
 * Validates an untrusted value as a wire identity of `domain` and brands it.
 * @param value - The untrusted value.
 * @param domain - The domain the caller expects.
 * @returns The value, branded.
 * @throws {IdentityValidationError} When the value is not a wire identity of that domain.
 */
function parseValue<Domain extends IdentityDomain>(
	value: unknown,
	domain: Domain,
): IdentityValue<Domain> {
	requireToken(value, domain);
	return brand<Domain>(String(value));
}

/**
 * Validates a child epoch, whose token is `<child token>.<epoch token>`, and
 * optionally checks that it belongs to one particular child.
 * @param value - The untrusted value.
 * @param expectedChild - When given, the child the epoch must belong to.
 * @returns The value, branded as an epoch.
 * @throws {IdentityValidationError} When it is not an epoch or belongs to another child.
 */
function parseEpochValue(value: unknown, expectedChild?: ChildId): ChildEpoch {
	const token = requireToken(value, "epoch");
	const match = EPOCH_TOKEN_PATTERN.exec(token);
	if (!match) {
		return fail("invalid-shape", "A child epoch must bind to a child identity.", "epoch");
	}
	const epoch = brand<"epoch">(String(value));
	if (
		expectedChild !== undefined &&
		(match[1] !== tokenOf(expectedChild) || prefixOf(epoch) !== prefixOf(expectedChild))
	) {
		return fail("wrong-child", "The child epoch belongs to another child.", "epoch");
	}
	return epoch;
}

/**
 * Mints a new epoch bound to `child`.
 * @param child - The child the epoch belongs to.
 * @returns A fresh branded epoch.
 */
function mintEpochValue(child: ChildId): ChildEpoch {
	return wireValue(prefixOf(child), "epoch", `${tokenOf(child)}.h${mintToken()}`);
}

/**
 * Tells whether a UTF-16 code unit opens a surrogate pair.
 * @param codeUnit - The code unit.
 * @returns True for a high surrogate.
 */
function isHighSurrogate(codeUnit: number): boolean {
	return codeUnit >= 0xd8_00 && codeUnit <= 0xdb_ff;
}

/**
 * Tells whether a UTF-16 code unit closes a surrogate pair.
 * @param codeUnit - The code unit, or NaN past the end of the string.
 * @returns True for a low surrogate.
 */
function isLowSurrogate(codeUnit: number): boolean {
	return codeUnit >= 0xdc_00 && codeUnit <= 0xdf_ff;
}

/**
 * Tells whether a string has no lone surrogates, so its UTF-8 encoding is a
 * faithful and reversible spelling of it.
 * @param value - The string to check.
 * @returns True when every surrogate is part of a complete pair.
 */
function isWellFormedUnicode(value: string): boolean {
	for (let index = 0; index < value.length; index++) {
		const codeUnit = value.charCodeAt(index);
		if (isHighSurrogate(codeUnit)) {
			if (!isLowSurrogate(value.charCodeAt(index + 1))) {
				return false;
			}
			index++;
		} else if (isLowSurrogate(codeUnit)) {
			return false;
		}
	}
	return true;
}

/**
 * Spells bytes as lowercase hexadecimal.
 * @param bytes - The bytes to spell.
 * @returns Two hexadecimal characters per byte.
 */
function hex(bytes: Uint8Array): string {
	let encoded = "";
	for (const byte of bytes) {
		encoded += byte.toString(16).padStart(2, "0");
	}
	return encoded;
}

/**
 * Encodes a raw server-issued id into a token that fits the wire grammar
 * whatever characters the server used: hex of its UTF-8 bytes, marked `s`.
 * @param raw - The id exactly as the server sent it.
 * @param domain - The domain it belongs to, for error messages.
 * @returns The `s`-prefixed hexadecimal token.
 * @throws {IdentityValidationError} When the id is empty, ill-formed, too large or contains NUL.
 */
function encodeRawIdentity(raw: string, domain: IdentityDomain): string {
	if (raw.length === 0) {
		return fail("empty", `${domain} identity must not be empty.`, domain);
	}
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
	return `s${hex(bytes)}`;
}

/**
 * Encodes a JSON-RPC request id, which the protocol allows to be a string or
 * an integer, keeping the two kinds apart with different token markers so
 * the original can be given back unchanged.
 * @param raw - The id as the server sent it.
 * @returns An `s`-prefixed token for a string, an `n`-prefixed one for an integer.
 * @throws {IdentityValidationError} When the id is neither, or too large.
 */
function encodeRawJsonRpcRequestId(raw: JsonRpcRequestIdWireValue): string {
	if (typeof raw === "string") {
		return encodeRawIdentity(raw, "json-rpc-request");
	}
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
	return `n${hex(encoded)}`;
}

/**
 * Reads the domain of an untrusted value that should be a wire identity.
 * @param value - The untrusted value.
 * @returns The identity domain the value names.
 * @throws {IdentityValidationError} When the value is not a canonical workbench identity.
 */
function identityDomain(value: unknown): IdentityDomain {
	if (typeof value !== "string") {
		return fail("invalid-shape", "Identity must be a string.");
	}
	const segments = wireSegments(value);
	if (segments === null || !isIdentityDomain(segments.domain)) {
		return fail("invalid-shape", "Identity is not a canonical workbench identity.");
	}
	return segments.domain;
}

export {
	CANONICAL_ITEM_ID_MAX_LENGTH,
	EPOCH_TOKEN_PATTERN,
	WIRE_TOKEN_LIMIT,
	type IdentityDomain,
	type BrandedIdentity,
	type IdentityValue,
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
	type IdentityValidationCode,
	IdentityValidationError,
	fail,
	requireToken,
	wireValue,
	mintToken,
	tokenOf,
	prefixOf,
	mintServerValue,
	parseValue,
	parseEpochValue,
	mintEpochValue,
	encodeRawIdentity,
	encodeRawJsonRpcRequestId,
	identityDomain,
};
