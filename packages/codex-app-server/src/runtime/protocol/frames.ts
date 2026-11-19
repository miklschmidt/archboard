import {
	ProtocolDecodeError,
	decodeJsonRpcError,
	decodeResponseEnvelope,
	decodeServerNotification,
	decodeServerRequest,
	isSupportedClientNotificationMethod,
	isSupportedResponseMethod,
	isSupportedServerRequestMethod,
	parseServerRequestParams,
	type DecodedJsonRpcError,
	type DecodedServerNotification,
	type DecodedServerRequest,
	type ResponsePayloads,
} from "#runtime/protocol/protocol-decoder.ts";
import {
	isClientRequestMethodWithoutParams,
	type ResponseMethod,
} from "#runtime/protocol/protocol-methods.ts";
import { jsonRpcErrorCode, type JsonRpcErrorKind } from "#runtime/protocol/request-schemas.ts";
import {
	JsonFrameDecodeError,
	isRecord,
	isWireId,
	parseJsonText,
	wireKey,
	type WireId,
} from "#runtime/protocol/wire.ts";

export type { WireId } from "#runtime/protocol/wire.ts";
export type { JsonRpcErrorKind } from "#runtime/protocol/request-schemas.ts";

/** A frame carries its parsed JSON object; only decodeFrameBody reads it. */
interface ParsedFrame {
	readonly body: Readonly<Record<string, unknown>>;
}

/** Why a reverse request's envelope is refused, in the order the rules apply. */
export type RequestEnvelopeProblem =
	| "method-invalid"
	| "envelope-fields"
	| "unsupported-method"
	| "no-params";

/**
 * A frame's id and the key that tables hold it by, present only when the id is a non-empty
 * string or a safe integer.
 */
export type FrameIdentity =
	| { readonly id: WireId; readonly key: string }
	| { readonly id?: undefined; readonly key?: undefined };

/** A frame with a method and an id: a request from the server. */
export type RequestFrame = ParsedFrame &
	FrameIdentity & {
		readonly kind: "request";
		/** The first envelope rule the frame breaks, if any. */
		readonly problem?: RequestEnvelopeProblem;
	};

/** A frame with a method and no id: a notification from the server. */
export interface NotificationFrame extends ParsedFrame {
	readonly kind: "notification";
}

/** A frame with an id and a result or an error member. */
export type ResponseFrame = ParsedFrame &
	FrameIdentity & {
		readonly kind: "response";
		/** Which outcome the frame carries; "malformed" when it carries both or neither. */
		readonly outcome: "result" | "error" | "malformed";
	};

/** A frame with a valid id and neither a method nor an outcome. */
export interface BareIdFrame {
	readonly kind: "bare-id";
	readonly id: WireId;
	readonly key: string;
}

/** A line that repeats an object key, with the top-level id and method it showed first. */
export type DuplicateKeyFrame = FrameIdentity & {
	readonly kind: "duplicate-key";
	readonly methodPresent: boolean;
};

/** One stdout line, classified by its envelope alone. */
export type InboundFrame =
	| { readonly kind: "empty" }
	| { readonly kind: "malformed" }
	| DuplicateKeyFrame
	| { readonly kind: "not-object" }
	| RequestFrame
	| NotificationFrame
	| ResponseFrame
	| BareIdFrame
	| { readonly kind: "unknown" };

/** A decoded frame body, or why it did not decode. */
export type FrameBody<Value> =
	| { readonly ok: true; readonly value: Value }
	| { readonly ok: false; readonly error: unknown };

/** What a response frame decodes to for the method that was asked. */
export type ResponseBody<Method extends ResponseMethod> =
	| { readonly outcome: "result"; readonly result: ResponsePayloads[Method] }
	| { readonly outcome: "error"; readonly error: DecodedJsonRpcError["error"] };

/** A request the client sends. */
export interface OutboundRequest {
	readonly kind: "request";
	/**
	 * Allocates the request's serialised JSON-RPC id, once its method and params are accepted.
	 * The caller may throw here to refuse the request before any id exists.
	 */
	readonly allocateId: () => WireId;
	readonly method: string;
	readonly params: unknown;
}

/** A notification the client sends. */
export interface OutboundNotification {
	readonly kind: "notification";
	readonly method: string;
}

/** The client's answer to a server request, or the JSON-RPC error that refuses a frame. */
export type OutboundAnswer =
	| {
			readonly kind: "reply";
			readonly id: WireId;
			readonly outcome: { readonly result: unknown } | { readonly error: unknown };
	  }
	| {
			readonly kind: "error";
			readonly id: WireId;
			readonly code: JsonRpcErrorKind;
			readonly message: string;
	  };

/** A frame the client writes. */
export type OutboundFrame = OutboundRequest | OutboundNotification | OutboundAnswer;

/** Why a frame has no JSON line within its bound. */
export type EncodingRefusal = "unencodable" | "too-large";

/** Why a frame was not encoded, in the order the rules apply. */
export type FrameRefusal =
	| "unsupported-method"
	| "params-present"
	| "params-not-object"
	| EncodingRefusal;

/** An encoded line, with the table key of the frame's id when it has one. */
export type EncodedFrame<Refusal extends FrameRefusal, Line> =
	| ({ readonly ok: true; readonly line: Buffer } & Line)
	| { readonly ok: false; readonly reason: Refusal };

const REQUEST_ENVELOPE_KEYS: readonly string[] = Object.freeze(["id", "method", "params"]);
const DISABLED_CAPABILITY = "capability was explicitly disabled by this client";

/**
 * The first envelope rule a server request breaks: a string method, only the request keys, a
 * supported method, then params.
 * @param body The parsed frame.
 * @returns The problem, or undefined when the envelope is sound.
 */
function requestProblem(
	body: Readonly<Record<string, unknown>>,
): RequestEnvelopeProblem | undefined {
	const method = body["method"];
	if (typeof method !== "string") return "method-invalid";
	if (!Object.keys(body).every((name) => REQUEST_ENVELOPE_KEYS.includes(name)))
		return "envelope-fields";
	if (!isSupportedServerRequestMethod(method)) return "unsupported-method";
	if (!Object.hasOwn(body, "params")) return "no-params";
	return undefined;
}

/**
 * The id and its table key, when the id is a non-empty string or a safe integer.
 * @param id The candidate id.
 * @returns The id and key, or nothing.
 */
function frameId(id: unknown): FrameIdentity {
	return isWireId(id) ? { id, key: wireKey(id) } : {};
}

/**
 * Classifies an object with a method: a request when it has an id, else a notification.
 * @param body The parsed frame.
 * @returns The frame.
 */
function classifyMethodFrame(body: Readonly<Record<string, unknown>>): InboundFrame {
	if (!Object.hasOwn(body, "id")) return { kind: "notification", body };
	const problem = requestProblem(body);
	return { kind: "request", body, ...frameId(body["id"]), ...(problem ? { problem } : {}) };
}

/**
 * Which outcome member a response carries.
 * @param body The parsed frame.
 * @returns The outcome, "malformed" for both, or undefined for neither.
 */
function outcomeOf(body: Readonly<Record<string, unknown>>): ResponseFrame["outcome"] | undefined {
	const hasResult = Object.hasOwn(body, "result");
	const hasError = Object.hasOwn(body, "error");
	if (hasResult && hasError) return "malformed";
	if (hasResult) return "result";
	return hasError ? "error" : undefined;
}

/**
 * Classifies a parsed object by its envelope keys.
 * @param body The parsed frame.
 * @returns The frame.
 */
function classify(body: Readonly<Record<string, unknown>>): InboundFrame {
	if (Object.hasOwn(body, "method")) return classifyMethodFrame(body);
	if (!Object.hasOwn(body, "id")) return { kind: "unknown" };
	const outcome = outcomeOf(body);
	if (outcome) return { kind: "response", body, outcome, ...frameId(body["id"]) };
	const id = body["id"];
	return isWireId(id) ? { kind: "bare-id", id, key: wireKey(id) } : { kind: "unknown" };
}

/**
 * Reads one stdout line as one strict JSON object and classifies it by its envelope. The line
 * must be UTF-8 and may not repeat an object key. Only syntax decides the class: which request
 * owns an id, and whether the transport is closing, are the caller's.
 * @param line The line without its newline.
 * @returns The classified frame.
 */
export function decodeFrame(line: Uint8Array): InboundFrame {
	if (line.byteLength === 0) return { kind: "empty" };
	let parsed: unknown;
	try {
		parsed = parseJsonText(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(line));
	} catch (error) {
		if (!(error instanceof JsonFrameDecodeError) || error.kind !== "duplicate-key")
			return { kind: "malformed" };
		return {
			kind: "duplicate-key",
			methodPresent: error.methodPresent,
			...frameId(error.wireId),
		};
	}
	return isRecord(parsed) ? classify(parsed) : { kind: "not-object" };
}

/**
 * Whether a decode failure is the refusal of a capability this client disabled at initialize.
 * @param error The decode failure.
 * @returns True for the disabled-capability refusal.
 */
function isDisabledCapabilityError(error: unknown): boolean {
	return (
		error instanceof ProtocolDecodeError &&
		error.issues.some(
			(issue) =>
				isRecord(issue) &&
				Array.isArray(issue["path"]) &&
				issue["path"].length === 1 &&
				issue["path"][0] === "method" &&
				issue["message"] === DISABLED_CAPABILITY,
		)
	);
}

/**
 * Decodes a request whose capability this client disabled by its params alone, so its owner
 * can answer it.
 * @param frame The request frame.
 * @param error What the full decode threw.
 * @returns The request, or undefined when the failure was not the disabled capability or the
 * params do not fit the method.
 */
function disabledCapabilityRequest(
	frame: RequestFrame,
	error: unknown,
): DecodedServerRequest | undefined {
	const method = frame.body["method"];
	if (!isDisabledCapabilityError(error) || frame.id === undefined) return undefined;
	if (typeof method !== "string" || !isSupportedServerRequestMethod(method)) return undefined;
	const parsed = parseServerRequestParams(method, frame.body["params"]);
	// The params were parsed by the schema registered for this same method, so the pair is
	// correlated; TypeScript cannot relate an indexed schema's output back to its key.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- params parsed by this method's own schema
	return parsed && ({ id: frame.id, method, params: parsed.params } as DecodedServerRequest);
}

/**
 * Decodes a server request, keeping a request whose capability this client disabled
 * decodable by its params alone.
 * @param frame The request frame.
 * @returns The request.
 */
function requestBody(frame: RequestFrame): DecodedServerRequest {
	try {
		return decodeServerRequest(frame.body);
	} catch (error) {
		const disabled = disabledCapabilityRequest(frame, error);
		if (disabled === undefined) throw error;
		return disabled;
	}
}

/**
 * Decodes a response frame for the method that was asked.
 * @param frame The response frame.
 * @param method The method of the request it answers.
 * @returns The result or the JSON-RPC error.
 */
function responseBody<Method extends ResponseMethod>(
	frame: ResponseFrame,
	method: Method,
): ResponseBody<Method> {
	if (frame.outcome === "result")
		return { outcome: "result", result: decodeResponseEnvelope(method, frame.body).result };
	if (frame.outcome === "error")
		return { outcome: "error", error: decodeJsonRpcError(frame.body, method).error };
	throw new ProtocolDecodeError({
		method,
		direction: "response",
		issues: [{ path: [], message: "a response must contain exactly one result or error" }],
	});
}

/**
 * Runs one decoder and returns its value, or the failure it threw.
 * @param decode The decoder.
 * @returns The body.
 */
function attempt<Value>(decode: () => Value): FrameBody<Value> {
	try {
		return { ok: true, value: decode() };
	} catch (error) {
		return { ok: false, error };
	}
}

export function decodeFrameBody(frame: NotificationFrame): FrameBody<DecodedServerNotification>;
export function decodeFrameBody(frame: RequestFrame): FrameBody<DecodedServerRequest>;
export function decodeFrameBody<Method extends ResponseMethod>(
	frame: ResponseFrame,
	method: Method,
): FrameBody<ResponseBody<Method>>;
/**
 * Decodes what a frame carries by the generated Codex schemas: a notification, a server
 * request, or a response by the method of the request it answers. The caller decides first
 * whether it wants the body at all, such as whether a request fits its capacity.
 * @param frame The frame.
 * @param method The method of the request a response answers.
 * @returns The decoded body, or the decoder's failure.
 */
export function decodeFrameBody(
	frame: NotificationFrame | RequestFrame | ResponseFrame,
	method?: ResponseMethod,
): FrameBody<unknown> {
	if (frame.kind === "notification") return attempt(() => decodeServerNotification(frame.body));
	if (frame.kind === "request") return attempt(() => requestBody(frame));
	if (method === undefined) throw new TypeError("a response decodes for its request's method");
	return attempt(() => responseBody(frame, method));
}

/**
 * Why a request's method or params are refused, if they are.
 * @param method The request method.
 * @param params The params.
 * @returns The refusal, or undefined.
 */
function requestRefusal(method: string, params: unknown): FrameRefusal | undefined {
	if (!isSupportedResponseMethod(method)) return "unsupported-method";
	if (isClientRequestMethodWithoutParams(method))
		return params === undefined ? undefined : "params-present";
	return isRecord(params) ? undefined : "params-not-object";
}

/** A frame's JSON value and its id, or the refusal of its method or params. */
type FrameValue = { readonly value: unknown; readonly id?: WireId } | FrameRefusal;

/**
 * The JSON value a request is written as, without params for a method that takes none. Its id
 * is allocated only once the method and params are accepted.
 * @param frame The request.
 * @returns The value and its id, or the refusal of its method or params.
 */
function requestValue(frame: OutboundRequest): FrameValue {
	const refused = requestRefusal(frame.method, frame.params);
	if (refused) return refused;
	const { method, params } = frame;
	const id = frame.allocateId();
	return {
		id,
		value: isClientRequestMethodWithoutParams(method) ? { id, method } : { id, method, params },
	};
}

/**
 * The JSON value a notification is written as.
 * @param frame The notification.
 * @returns The value, or the refusal of its method.
 */
function notificationValue(frame: OutboundNotification): FrameValue {
	return isSupportedClientNotificationMethod(frame.method)
		? { value: { method: frame.method } }
		: "unsupported-method";
}

/**
 * The JSON value an answer is written as.
 * @param frame The reply or error.
 * @returns The value.
 */
function answerValue(frame: OutboundAnswer): FrameValue {
	if (frame.kind === "reply") return { id: frame.id, value: { id: frame.id, ...frame.outcome } };
	const error = { code: jsonRpcErrorCode(frame.code), message: frame.message };
	return { id: frame.id, value: { id: frame.id, error } };
}

/**
 * The JSON value a frame is written as.
 * @param frame The frame.
 * @returns The value, or the refusal of its method or params.
 */
function frameValue(frame: OutboundFrame): FrameValue {
	if (frame.kind === "request") return requestValue(frame);
	if (frame.kind === "notification") return notificationValue(frame);
	return answerValue(frame);
}

/**
 * JSON.stringify, typed with the undefined it returns for a value that has no JSON form.
 */
const stringifyJson: (value: unknown) => string | undefined = JSON.stringify;

export function encodeFrame(
	frame: OutboundRequest,
	maximumBytes: number,
): EncodedFrame<FrameRefusal, { readonly key: string }>;
export function encodeFrame(
	frame: OutboundNotification,
	maximumBytes: number,
): EncodedFrame<"unsupported-method" | EncodingRefusal, object>;
export function encodeFrame(
	frame: OutboundAnswer,
	maximumBytes: number,
): EncodedFrame<EncodingRefusal, { readonly key: string }>;
/**
 * Encodes a frame as one newline-terminated JSON line within a byte bound, refusing a method
 * or params the bound protocol does not accept. A request's id is allocated only after its
 * method and params are accepted, and whatever the allocator throws, this throws.
 * @param frame The frame.
 * @param maximumBytes The largest payload allowed, before the newline.
 * @returns The line, with the table key of its id, or the refusal.
 */
export function encodeFrame(
	frame: OutboundFrame,
	maximumBytes: number,
): EncodedFrame<FrameRefusal, { readonly key?: string }> {
	const value = frameValue(frame);
	if (typeof value === "string") return { ok: false, reason: value };
	let encoded: string | undefined;
	try {
		encoded = stringifyJson(value.value);
	} catch {
		return { ok: false, reason: "unencodable" };
	}
	if (encoded === undefined) return { ok: false, reason: "unencodable" };
	if (Buffer.byteLength(encoded, "utf8") > maximumBytes) return { ok: false, reason: "too-large" };
	return {
		ok: true,
		line: Buffer.from(`${encoded}\n`, "utf8"),
		...(value.id === undefined ? {} : { key: wireKey(value.id) }),
	};
}
