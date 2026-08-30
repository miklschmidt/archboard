import { z } from "zod";

import { CODEX_PROTOCOL_VERSION, isSupportedCodexUserAgent } from "../manifest.js";
import {
	CLIENT_NOTIFICATION_SCHEMAS,
	InitializeParamsSchema,
	JsonRpcErrorSchema,
	LoginAccountParamsSchema,
	SERVER_REQUEST_SCHEMAS,
} from "./request-schemas.js";
import {
	CLIENT_NOTIFICATION_METHODS,
	type ResponseMethod,
	RESPONSE_METHODS,
	type ServerRequestMethod,
} from "./methods.js";
import { RESPONSE_SCHEMAS } from "./response-schemas.js";
import {
	ServerNotificationEnvelopeSchema,
	SERVER_NOTIFICATION_SCHEMAS,
} from "./notification-schemas.js";
import { JsonValueSchema, RequestIdSchema } from "./scalars.js";

export type ProtocolDirection =
	| "response"
	| "client-request"
	| "client-notification"
	| "server-notification"
	| "server-request"
	| "json-rpc-error";

export const PROTOCOL_RECOVERY_ACTION =
	"regenerate the ignored 0.151.0 bindings with the recorded Codex binary, verify the manifest digest, and reconnect the session";

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

function formatIssues(issues: readonly unknown[]): string {
	return issues
		.map((issue) => {
			if (!issue || typeof issue !== "object") return String(issue);
			const candidate = issue as { path?: unknown; message?: unknown };
			const path = Array.isArray(candidate.path) ? candidate.path.join(".") : "payload";
			return `${path}: ${String(candidate.message ?? "invalid value")}`;
		})
		.join("; ");
}

function decodeSchema<T extends z.ZodTypeAny>(
	method: string,
	direction: ProtocolDirection,
	schema: T,
	value: unknown,
): z.infer<T> {
	const result = schema.safeParse(value);
	if (!result.success)
		throw new ProtocolDecodeError({ method, direction, issues: result.error.issues });
	return result.data;
}

function methodSchema<T extends Record<string, z.ZodTypeAny>>(
	schemas: T,
	method: string,
	direction: ProtocolDirection,
) {
	const schema = schemas[method as keyof T];
	if (!schema)
		throw new ProtocolDecodeError({
			method,
			direction,
			recoveryAction: `${PROTOCOL_RECOVERY_ACTION}; do not handle this unknown method until Codex 0.151.0 is reviewed`,
		});
	return schema;
}

function methodHint(value: unknown): string {
	if (!value || typeof value !== "object" || Array.isArray(value)) return "<unknown>";
	const method = (value as { method?: unknown }).method;
	return typeof method === "string" ? method : "<unknown>";
}

export type ResponsePayloads = {
	[M in ResponseMethod]: z.infer<(typeof RESPONSE_SCHEMAS)[M]>;
};

export function decodeResponse<M extends ResponseMethod>(
	method: M,
	payload: unknown,
): ResponsePayloads[M];
export function decodeResponse(method: string, payload: unknown): unknown;
export function decodeResponse(method: string, payload: unknown): unknown {
	const schema = methodSchema(RESPONSE_SCHEMAS, method, "response");
	const decoded = decodeSchema(method, "response", schema, payload);
	if (method === "initialize") {
		const userAgent = (decoded as { userAgent: string }).userAgent;
		if (!isSupportedCodexUserAgent(userAgent))
			throw new ProtocolDecodeError({
				method,
				direction: "response",
				issues: [{ path: ["userAgent"], message: `expected Codex ${CODEX_PROTOCOL_VERSION}` }],
				recoveryAction:
					"stop the child, run the recorded Codex binary, regenerate the ignored bindings, and reconnect",
			});
	}
	return decoded;
}

export function decodeInitializeParams(value: unknown) {
	return decodeSchema("initialize", "client-request", InitializeParamsSchema, value);
}

export function decodeLoginAccountParams(value: unknown) {
	const decoded = decodeSchema(
		"account/login/start",
		"client-request",
		LoginAccountParamsSchema,
		value,
	);
	if (decoded.type === "chatgptDeviceCode" || decoded.type === "chatgptAuthTokens")
		throw new ProtocolDecodeError({
			method: "account/login/start",
			direction: "client-request",
			issues: [{ path: ["type"], message: `${decoded.type} is not supported by Archboard` }],
			recoveryAction:
				"use hosted ChatGPT login, an API key, or explicit Bedrock credentials through the visual login flow",
		});
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

export function decodeClientNotification(value: unknown): DecodedClientNotification {
	const envelope = decodeSchema(
		methodHint(value),
		"client-notification",
		ClientNotificationEnvelopeSchema,
		value,
	);
	const method = envelope.method;
	const schema = methodSchema(CLIENT_NOTIFICATION_SCHEMAS, method, "client-notification");
	return decodeSchema(method, "client-notification", schema, value) as DecodedClientNotification;
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

export function decodeServerNotification(value: unknown): DecodedServerNotification {
	const envelope = decodeSchema(
		methodHint(value),
		"server-notification",
		ServerNotificationEnvelopeSchema,
		value,
	);
	const schema = methodSchema(SERVER_NOTIFICATION_SCHEMAS, envelope.method, "server-notification");
	const params = decodeSchema(envelope.method, "server-notification", schema, envelope.params);
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

export function decodeServerRequest(value: unknown): DecodedServerRequest;
export function decodeServerRequest(value: unknown): DecodedServerRequest {
	const envelope = decodeSchema(
		methodHint(value),
		"server-request",
		ServerRequestEnvelopeSchema,
		value,
	);
	const schema = methodSchema(SERVER_REQUEST_SCHEMAS, envelope.method, "server-request");
	const params = decodeSchema(envelope.method, "server-request", schema, envelope.params);
	if (
		envelope.method === "account/chatgptAuthTokens/refresh" ||
		envelope.method === "attestation/generate"
	)
		throw new ProtocolDecodeError({
			method: envelope.method,
			direction: "server-request",
			issues: [{ path: ["method"], message: "capability was explicitly disabled by Archboard" }],
			recoveryAction:
				envelope.method === "attestation/generate"
					? "reply with JSON-RPC -32601 Attestation is not supported by this client"
					: "reply with JSON-RPC -32601 Client-managed ChatGPT token refresh is not supported",
		});
	return {
		id: envelope.id,
		method: envelope.method as ServerRequestMethod,
		params,
	} as DecodedServerRequest;
}

export type DecodedJsonRpcError = z.infer<typeof JsonRpcErrorSchema>;

export function decodeJsonRpcError(value: unknown, method = "<unknown>"): DecodedJsonRpcError {
	return decodeSchema(method, "json-rpc-error", JsonRpcErrorSchema, value);
}

const JsonRpcResultEnvelopeSchema = z.strictObject({
	id: RequestIdSchema,
	error: z.never().optional(),
	/** The generic result is narrowed immediately by the response method schema. */
	result: JsonValueSchema,
});

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
		result: decodeResponse(method, envelope.result) as ResponsePayloads[M],
	};
}

export function isSupportedResponseMethod(method: string): method is ResponseMethod {
	return (RESPONSE_METHODS as readonly string[]).includes(method);
}

export function isSupportedServerRequestMethod(method: string): method is ServerRequestMethod {
	return (Object.keys(SERVER_REQUEST_SCHEMAS) as readonly string[]).includes(method);
}

export function isSupportedClientNotificationMethod(
	method: string,
): method is (typeof CLIENT_NOTIFICATION_METHODS)[number] {
	return (CLIENT_NOTIFICATION_METHODS as readonly string[]).includes(method);
}
