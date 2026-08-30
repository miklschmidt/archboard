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

type IssuePath = readonly (string | number)[];
type IssueRecord = Record<string, unknown>;

function isIssueRecord(value: unknown): value is IssueRecord {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function issuePath(issue: unknown): IssuePath {
	if (!isIssueRecord(issue) || !Array.isArray(issue.path)) return [];
	return issue.path.map((segment) =>
		typeof segment === "string" || typeof segment === "number" ? segment : String(segment),
	);
}

function unionBranches(issue: IssueRecord): unknown[][] | undefined {
	if (issue.code !== "invalid_union" || !Array.isArray(issue.errors)) return undefined;
	const branches: unknown[][] = [];
	for (const branch of issue.errors) {
		if (!Array.isArray(branch)) return undefined;
		branches.push(branch);
	}
	return branches;
}

function valueAtPath(value: unknown, path: IssuePath): unknown {
	let current = value;
	for (const segment of path) {
		if (Array.isArray(current)) {
			const index = typeof segment === "number" ? segment : Number(segment);
			if (!Number.isInteger(index)) return undefined;
			current = current[index];
		} else if (isIssueRecord(current)) {
			current = current[String(segment)];
		} else {
			return undefined;
		}
	}
	return current;
}

function issuePaths(issue: unknown, prefix: IssuePath = []): IssuePath[] {
	if (!isIssueRecord(issue)) return [prefix];
	const path = [...prefix, ...issuePath(issue)];
	const branches = unionBranches(issue);
	if (!branches?.length) return [path];
	return branches.flatMap((branch) =>
		branch.length ? branch.flatMap((child) => issuePaths(child, path)) : [path],
	);
}

interface UnionBranchScore {
	readonly depth: number;
	readonly inputKeyMatches: number;
	readonly index: number;
}

function branchScore(
	branch: readonly unknown[],
	unionValue: unknown,
	index: number,
): UnionBranchScore {
	const paths = branch.flatMap((issue) => issuePaths(issue));
	const depth = Math.max(0, ...paths.map((path) => path.length));
	const inputKeys = isIssueRecord(unionValue) ? new Set(Object.keys(unionValue)) : undefined;
	const inputKeyMatches = inputKeys
		? paths.reduce(
				(matches, path) =>
					matches + (path[0] !== undefined && inputKeys.has(String(path[0])) ? 1 : 0),
				0,
			)
		: 0;
	return { depth, inputKeyMatches, index };
}

function isBetterBranch(candidate: UnionBranchScore, current: UnionBranchScore): boolean {
	if (candidate.depth !== current.depth) return candidate.depth > current.depth;
	if (candidate.inputKeyMatches !== current.inputKeyMatches)
		return candidate.inputKeyMatches > current.inputKeyMatches;
	return candidate.index > current.index;
}

function deepestBranch(
	branches: readonly (readonly unknown[])[],
	unionValue: unknown,
): readonly unknown[] | undefined {
	let selected: readonly unknown[] | undefined;
	let selectedScore: UnionBranchScore | undefined;
	for (const [index, branch] of branches.entries()) {
		const score = branchScore(branch, unionValue, index);
		if (!selectedScore || isBetterBranch(score, selectedScore)) {
			selected = branch;
			selectedScore = score;
		}
	}
	return selected;
}

function withIssuePath(issue: IssueRecord, path: IssuePath): IssueRecord {
	return { ...issue, path };
}

function isFunctionCallOutputBodyUnion(issue: IssueRecord): boolean {
	// FunctionCallOutputBodySchema is the one intentional regular union at an
	// output field; retain its containing issue for the documented exception.
	const path = issuePath(issue);
	return path[path.length - 1] === "output";
}

function normalizeIssue(issue: unknown, prefix: IssuePath, rootValue: unknown): unknown[] {
	if (!isIssueRecord(issue)) return [issue];
	const path = [...prefix, ...issuePath(issue)];
	const branches = unionBranches(issue);
	if (!branches || isFunctionCallOutputBodyUnion(issue)) return [withIssuePath(issue, path)];
	const selected = deepestBranch(branches, valueAtPath(rootValue, path));
	if (!selected) return [withIssuePath(issue, path)];
	return selected.flatMap((child) => normalizeIssue(child, path, rootValue));
}

function normalizeIssues(issues: readonly unknown[], value: unknown): readonly unknown[] {
	return issues.flatMap((issue) => normalizeIssue(issue, [], value));
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
		throw new ProtocolDecodeError({
			method,
			direction,
			issues: normalizeIssues(result.error.issues, value),
		});
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
