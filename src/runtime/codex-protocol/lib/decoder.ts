import { z } from "zod";

import { normalizeCodexJsonWire } from "@/shared/codex-app-server-contract";
import {
	CODEX_PROTOCOL_VERSION,
	isSupportedCodexUserAgent,
} from "@/runtime/codex-protocol/lib/version";
import {
	CLIENT_REQUEST_PARAM_SCHEMAS,
	type ClientRequestParams,
} from "@/runtime/codex-protocol/lib/client-request-schemas";
import {
	CLIENT_NOTIFICATION_SCHEMAS,
	JsonRpcErrorSchema,
	LoginAccountParamsSchema,
	SERVER_REQUEST_SCHEMAS,
} from "@/runtime/codex-protocol/lib/request-schemas";
import {
	CLIENT_NOTIFICATION_METHODS,
	CLIENT_REQUEST_METHODS,
	type ClientRequestMethod,
	type ResponseMethod,
	RESPONSE_METHODS,
	type ServerRequestMethod,
} from "@/runtime/codex-protocol/lib/methods";
import { RESPONSE_SCHEMAS } from "@/runtime/codex-protocol/lib/response-schemas";
import {
	ServerNotificationEnvelopeSchema,
	SERVER_NOTIFICATION_SCHEMAS,
} from "@/runtime/codex-protocol/lib/notification-schemas";
import { JsonValueSchema, RequestIdSchema } from "@/runtime/codex-protocol/lib/scalars";
import { formatIssues, normalizeIssues } from "@/runtime/codex-protocol/lib/issue-normalization";

export type ProtocolDirection =
	| "response"
	| "client-request"
	| "client-notification"
	| "server-notification"
	| "server-request"
	| "json-rpc-error";

export const PROTOCOL_RECOVERY_ACTION =
	"confirm the child runs Codex 0.151.0, review the incompatible payload, and reconnect the session";

export interface ProtocolDecodeErrorInit {
	readonly method: string;
	readonly direction: ProtocolDirection;
	readonly issues?: readonly unknown[];
	readonly recoveryAction?: string;
}

/** A versioned wire contract failed before an untyped payload could escape. */
export class ProtocolDecodeError extends Error {
	readonly method: string;
	readonly direction: ProtocolDirection;
	readonly expectedVersion = CODEX_PROTOCOL_VERSION;
	readonly recoveryAction: string;
	readonly issues: readonly unknown[];

	/**
	 * Builds the error with a message that names the version, direction, method, every
	 * normalized issue and the recovery step, so a log line alone is actionable.
	 * @param init - The failing method and direction, with optional issues and recovery text.
	 */
	constructor(init: ProtocolDecodeErrorInit) {
		const recoveryAction = init.recoveryAction ?? PROTOCOL_RECOVERY_ACTION;
		const issues = init.issues ?? [];
		const issueText = formatIssues(issues);
		super(
			`Codex ${CODEX_PROTOCOL_VERSION} ${init.direction} ${init.method} decode failed${
				issueText ? `: ${issueText}` : ""
			}. Recovery: ${recoveryAction}.`,
		);
		this.name = "ProtocolDecodeError";
		this.method = init.method;
		this.direction = init.direction;
		this.recoveryAction = recoveryAction;
		this.issues = issues;
	}
}

/**
 * Normalizes a wire value and validates it against one schema, converting every failure into
 * a ProtocolDecodeError so callers never see raw zod or normalization errors.
 * @param method - The protocol method the value belongs to.
 * @param direction - Which side of the protocol the value travelled.
 * @param schema - The schema that owns the value.
 * @param value - The raw wire value.
 * @returns The decoded value.
 */
function decodeSchema<T extends z.ZodType>(
	method: string,
	direction: ProtocolDirection,
	schema: T,
	value: unknown,
): z.infer<T> {
	let normalized: unknown;
	try {
		normalized = normalizeCodexJsonWire(value);
	} catch (error) {
		throw new ProtocolDecodeError({
			method,
			direction,
			issues: [{ path: [], message: error instanceof Error ? error.message : String(error) }],
		});
	}
	const result = schema.safeParse(normalized);
	if (!result.success) {
		throw new ProtocolDecodeError({
			method,
			direction,
			issues: normalizeIssues(result.error.issues, normalized),
		});
	}
	return result.data;
}

/**
 * Builds the refusal for a method the bound protocol version does not declare.
 * @param method - The unknown method name.
 * @param direction - Which side of the protocol it arrived on.
 * @returns The error to throw.
 */
function unknownMethodError(method: string, direction: ProtocolDirection): ProtocolDecodeError {
	return new ProtocolDecodeError({
		method,
		direction,
		recoveryAction: `${PROTOCOL_RECOVERY_ACTION}; do not handle this unknown method until Codex 0.151.0 is reviewed`,
	});
}

type MethodSchemas = Readonly<Record<string, z.ZodType>>;

/**
 * Looks up the schema for a method by its own key only, so inherited names such as
 * `constructor` can never resolve to a schema.
 * @param schemas - The per-method schema table.
 * @param method - The method name from the wire.
 * @param direction - Which side of the protocol the value travelled.
 * @returns The schema that owns the method.
 */
function methodSchema(
	schemas: MethodSchemas,
	method: string,
	direction: ProtocolDirection,
): z.ZodType {
	const schema = Object.hasOwn(schemas, method) ? schemas[method] : undefined;
	if (!schema) {
		throw unknownMethodError(method, direction);
	}
	return schema;
}

/**
 * Reads the method name out of an undecoded envelope for error messages only.
 * @param value - The raw envelope.
 * @returns The method name, or a placeholder when there is none.
 */
function methodHint(value: unknown): string {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return "<unknown>";
	}
	const method = (value as { method?: unknown }).method;
	return typeof method === "string" ? method : "<unknown>";
}

export type ResponsePayloads = {
	[M in ResponseMethod]: z.infer<(typeof RESPONSE_SCHEMAS)[M]>;
};

export function decodeClientRequestParams<Method extends ClientRequestMethod>(
	method: Method,
	params: unknown,
): ClientRequestParams<Method>;
/**
 * Decodes the params of a request Archboard is about to send, so nothing leaves the process
 * that the bound protocol version would not accept.
 * @param method - The client request method.
 * @param params - The candidate params.
 * @returns The decoded params.
 */
export function decodeClientRequestParams(method: string, params: unknown): unknown {
	const schema = methodSchema(CLIENT_REQUEST_PARAM_SCHEMAS, method, "client-request");
	return decodeSchema(method, "client-request", schema, params);
}

/**
 * Refuses an initialize response from any Codex other than the bound version.
 * @param userAgent - The server's reported user agent.
 */
function assertSupportedUserAgent(userAgent: string): void {
	if (!isSupportedCodexUserAgent(userAgent)) {
		throw new ProtocolDecodeError({
			method: "initialize",
			direction: "response",
			issues: [{ path: ["userAgent"], message: `expected Codex ${CODEX_PROTOCOL_VERSION}` }],
			recoveryAction:
				"stop the child, run the recorded Codex 0.151.0 binary, and reconnect after reviewing the incompatible payload",
		});
	}
}

export function decodeResponse<M extends ResponseMethod>(
	method: M,
	payload: unknown,
): ResponsePayloads[M];
export function decodeResponse(method: string, payload: unknown): unknown;
/**
 * Decodes a response result by its request method, with the version handshake enforced on
 * the initialize response.
 * @param method - The request method the response answers.
 * @param payload - The raw result.
 * @returns The decoded result.
 */
export function decodeResponse(method: string, payload: unknown): unknown {
	if (method === "initialize") {
		const initialized = decodeSchema(method, "response", RESPONSE_SCHEMAS.initialize, payload);
		assertSupportedUserAgent(initialized.userAgent);
		return initialized;
	}
	const schema = methodSchema(RESPONSE_SCHEMAS, method, "response");
	return decodeSchema(method, "response", schema, payload);
}

/**
 * Decodes login params and refuses the two ChatGPT variants Archboard does not implement.
 * @param value - The candidate login params.
 * @returns The decoded, supported login params.
 */
export function decodeLoginAccountParams(value: unknown) {
	const decoded = decodeSchema(
		"account/login/start",
		"client-request",
		LoginAccountParamsSchema,
		value,
	);
	if (decoded.type === "chatgptDeviceCode" || decoded.type === "chatgptAuthTokens") {
		throw new ProtocolDecodeError({
			method: "account/login/start",
			direction: "client-request",
			issues: [{ path: ["type"], message: `${decoded.type} is not supported by Archboard` }],
			recoveryAction:
				"use hosted ChatGPT login, an API key, or explicit Bedrock credentials through the visual login flow",
		});
	}
	return decoded;
}

const ClientNotificationEnvelopeSchema = z.strictObject({ method: z.string() });
const ServerRequestEnvelopeSchema = z.strictObject({
	id: RequestIdSchema,
	method: z.string(),
	/** The generic JSON-RPC envelope is narrowed immediately by method schema. */
	params: JsonValueSchema,
});

export type DecodedClientNotification = z.infer<
	(typeof CLIENT_NOTIFICATION_SCHEMAS)["initialized"]
>;

/**
 * Decodes a notification Archboard is about to send.
 * @param value - The candidate notification envelope.
 * @returns The decoded notification.
 */
export function decodeClientNotification(value: unknown): DecodedClientNotification {
	const envelope = decodeSchema(
		methodHint(value),
		"client-notification",
		ClientNotificationEnvelopeSchema,
		value,
	);
	const method = envelope.method;
	const schema = methodSchema(CLIENT_NOTIFICATION_SCHEMAS, method, "client-notification");
	return decodeSchema(method, "client-notification", schema, value);
}

export type ServerNotificationPayloads = {
	[M in keyof typeof SERVER_NOTIFICATION_SCHEMAS]: z.infer<(typeof SERVER_NOTIFICATION_SCHEMAS)[M]>;
};
export type DecodedServerNotification = {
	[M in keyof ServerNotificationPayloads]: {
		method: M;
		params: ServerNotificationPayloads[M];
		emittedAtMs?: number;
	};
}[keyof ServerNotificationPayloads];

/**
 * Decodes a notification received from the server: envelope first, then the params by the
 * schema the method owns.
 * @param value - The raw notification envelope.
 * @returns The decoded notification, correlated by method.
 */
export function decodeServerNotification(value: unknown): DecodedServerNotification {
	const envelope = decodeSchema(
		methodHint(value),
		"server-notification",
		ServerNotificationEnvelopeSchema,
		value,
	);
	const schema = methodSchema(SERVER_NOTIFICATION_SCHEMAS, envelope.method, "server-notification");
	const params = decodeSchema(envelope.method, "server-notification", schema, envelope.params);
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- methodSchema resolved the schema by envelope.method from SERVER_NOTIFICATION_SCHEMAS, whose keys are exactly the union's methods, so method and params correlate by construction; TypeScript cannot express that for a string-keyed lookup
	return { ...envelope, params } as DecodedServerNotification;
}

export type ServerRequestPayloads = {
	[M in ServerRequestMethod]: z.infer<(typeof SERVER_REQUEST_SCHEMAS)[M]>;
};
export type DecodedServerRequest = {
	[M in ServerRequestMethod]: {
		id: z.infer<typeof RequestIdSchema>;
		method: M;
		params: ServerRequestPayloads[M];
	};
}[ServerRequestMethod];

/**
 * Refuses the two server requests whose capability Archboard explicitly disabled at
 * initialize, naming the JSON-RPC reply the caller must send instead.
 * @param method - The decoded server request method.
 */
function assertServerRequestCapability(method: ServerRequestMethod): void {
	if (method === "account/chatgptAuthTokens/refresh" || method === "attestation/generate") {
		throw new ProtocolDecodeError({
			method,
			direction: "server-request",
			issues: [{ path: ["method"], message: "capability was explicitly disabled by Archboard" }],
			recoveryAction:
				method === "attestation/generate"
					? "reply with JSON-RPC -32601 Attestation is not supported by this client"
					: "reply with JSON-RPC -32601 Client-managed ChatGPT token refresh is not supported",
		});
	}
}

export function decodeServerRequest(value: unknown): DecodedServerRequest;
/**
 * Decodes a request received from the server: envelope, then params by method, then the
 * capability check so a disabled request is refused with the reply the caller must send.
 * @param value - The raw request envelope.
 * @returns The decoded request, correlated by method.
 */
export function decodeServerRequest(value: unknown): DecodedServerRequest {
	const envelope = decodeSchema(
		methodHint(value),
		"server-request",
		ServerRequestEnvelopeSchema,
		value,
	);
	const method = envelope.method;
	if (!isSupportedServerRequestMethod(method)) {
		throw unknownMethodError(method, "server-request");
	}
	const params = decodeSchema(
		method,
		"server-request",
		SERVER_REQUEST_SCHEMAS[method],
		envelope.params,
	);
	assertServerRequestCapability(method);
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- params were decoded by SERVER_REQUEST_SCHEMAS[method], so method and params correlate by construction; TypeScript cannot narrow a generic indexed lookup to one member of the distributed union
	return { id: envelope.id, method, params } as DecodedServerRequest;
}

export type DecodedJsonRpcError = z.infer<typeof JsonRpcErrorSchema>;

/**
 * Decodes a JSON-RPC error envelope.
 * @param value - The raw error envelope.
 * @param method - The method the error answers, when known.
 * @returns The decoded error.
 */
export function decodeJsonRpcError(value: unknown, method = "<unknown>"): DecodedJsonRpcError {
	return decodeSchema(method, "json-rpc-error", JsonRpcErrorSchema, value);
}

const JsonRpcResultEnvelopeSchema = z.strictObject({
	id: RequestIdSchema,
	error: z.never().optional(),
	/** The generic result is narrowed immediately by the response method schema. */
	result: JsonValueSchema,
});

/**
 * Decodes a whole JSON-RPC result envelope for a known request method.
 * @param method - The request method the envelope answers.
 * @param value - The raw envelope.
 * @returns The request id and the decoded result.
 */
export function decodeResponseEnvelope<M extends ResponseMethod>(
	method: M,
	value: unknown,
): {
	id: z.infer<typeof RequestIdSchema>;
	result: ResponsePayloads[M];
} {
	const envelope = decodeSchema(method, "response", JsonRpcResultEnvelopeSchema, value);
	return {
		id: envelope.id,
		result: decodeResponse(method, envelope.result),
	};
}

/**
 * Narrows a method name to the responses this protocol decodes.
 * @param method - Any method name.
 * @returns Whether a response decoder exists for it.
 */
export function isSupportedResponseMethod(method: string): method is ResponseMethod {
	return (RESPONSE_METHODS as readonly string[]).includes(method);
}

/**
 * Narrows a method name to the requests Archboard may send.
 * @param method - Any method name.
 * @returns Whether the request is part of the bound contract.
 */
export function isSupportedClientRequestMethod(method: string): method is ClientRequestMethod {
	return (CLIENT_REQUEST_METHODS as readonly string[]).includes(method);
}

/**
 * Narrows a method name to the requests the server may send to Archboard.
 * @param method - Any method name.
 * @returns Whether a server request decoder exists for it.
 */
export function isSupportedServerRequestMethod(method: string): method is ServerRequestMethod {
	return (Object.keys(SERVER_REQUEST_SCHEMAS) as readonly string[]).includes(method);
}

/**
 * Narrows a method name to the notifications Archboard may send.
 * @param method - Any method name.
 * @returns Whether the notification is part of the bound contract.
 */
export function isSupportedClientNotificationMethod(
	method: string,
): method is (typeof CLIENT_NOTIFICATION_METHODS)[number] {
	return (CLIENT_NOTIFICATION_METHODS as readonly string[]).includes(method);
}
