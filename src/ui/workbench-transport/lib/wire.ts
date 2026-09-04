import { z } from "zod";

import {
	createCodexBrowserModel,
	type BrowserCommand,
	type BrowserCommandLease,
	type BrowserSnapshot,
	type IdentityContext,
} from "../../../shared/codex-browser-model/index.js";
import { BROWSER_GATEWAY_ERROR_CODES } from "../../../shared/codex-browser-gateway/index.js";
import type { AnswerSdp } from "../../../shared/codex-realtime-host/index.js";
import type {
	BrowserGatewayErrorCode,
	BrowserWorkbenchAccountReadResult,
	BrowserWorkbenchCommandResult,
	BrowserWorkbenchDeltaMessage,
	BrowserWorkbenchGatewayMessage,
	BrowserWorkbenchSnapshotDelta,
	BrowserWorkbenchSnapshotMessage,
} from "./contract.js";

const GATEWAY_ERROR_CODES = new Set<BrowserGatewayErrorCode>(BROWSER_GATEWAY_ERROR_CODES);

const WIRE_IDENTITY_MAX_BYTES = 16_384;
const WIRE_VALUE_MAX_BYTES = 16_384;

export class BrowserWorkbenchWireError extends Error {
	override readonly name = "BrowserWorkbenchWireError";
}

export interface BrowserWorkbenchResponseEnvelope {
	readonly type: "codex_workbench_result";
	readonly requestId: string | null;
	readonly action: string | null;
	readonly ok: boolean;
	readonly value?: unknown;
	readonly error?: string;
}

function fail(message: string): never {
	throw new BrowserWorkbenchWireError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function record(value: unknown, message: string): Record<string, unknown> {
	if (!isRecord(value)) fail(message);
	return value;
}

function nonEmptyString(value: unknown, message: string): asserts value is string {
	if (typeof value !== "string" || value.length === 0) fail(message);
}

function boundedString(
	value: unknown,
	message: string,
	maximum = WIRE_VALUE_MAX_BYTES,
	allowEmpty = false,
): asserts value is string {
	if (typeof value !== "string" || (!allowEmpty && value.length === 0)) fail(message);
	if (value.includes("\0") || value.trim() !== value)
		fail(`${message} (the value is not a valid wire string)`);
	if (new TextEncoder().encode(value).byteLength > maximum) fail(message);
}

function nonNegativeSafeInteger(value: unknown, message: string): asserts value is number {
	if (!Number.isSafeInteger(value) || (value as number) < 0) fail(message);
}

function assertExactKeys(
	value: Record<string, unknown>,
	keys: readonly string[],
	message: string,
): void {
	const actual = Object.keys(value);
	if (actual.length !== keys.length || keys.some((key) => !Object.hasOwn(value, key)))
		fail(message);
}

function assertOptionalKeys(
	value: Record<string, unknown>,
	keys: readonly string[],
	message: string,
): void {
	for (const key of Object.keys(value)) if (!keys.includes(key)) fail(message);
}

function parseIdentity(value: unknown, domain: string): string {
	boundedString(
		value,
		`The Codex workbench ${domain} identity is invalid.`,
		WIRE_IDENTITY_MAX_BYTES,
	);
	return value;
}

function parseOperationIdentity(value: unknown): string {
	return parseIdentity(value, "operation");
}

/*
 * The browser receives identities already issued by the server, but it does
 * not own the server's issuance ledger. This inert context lets the public
 * shared browser model validate every closed DTO while leaving authority and
 * current-epoch checks to the gateway. It deliberately validates strings and
 * preserves the model's exact object, enum, cross-field, and bounded-text
 * checks instead of copying those schemas into the UI.
 */
const wireIdentityContext = {
	validator: {
		childId: "wire-child",
		epoch: "wire-epoch",
		assertCurrentEpoch: () => undefined,
	},
	decoder: {
		parseChildId: (value: unknown) => parseIdentity(value, "child"),
		parseChildEpoch: (value: unknown) => parseIdentity(value, "epoch"),
		parseBrowserCommandId: (value: unknown) => parseIdentity(value, "browser-command"),
		parseThreadId: (value: unknown) => parseIdentity(value, "thread"),
		parseTurnId: (value: unknown) => parseIdentity(value, "turn"),
		parseItemId: (value: unknown) => parseIdentity(value, "item"),
		parseQueuedSubmissionId: (value: unknown) => parseIdentity(value, "queued-submission"),
		parseLoginId: (value: unknown) => parseIdentity(value, "login"),
		parseJsonRpcRequestId: (value: unknown) => parseIdentity(value, "json-rpc-request"),
		parseDynamicToolCallId: (value: unknown) => parseIdentity(value, "dynamic-tool-call"),
		parseRealtimeSessionId: (value: unknown) => parseIdentity(value, "realtime-session"),
		parseApprovalId: (value: unknown) => parseIdentity(value, "approval"),
	},
	operation: {
		decoder: { parseOperationId: parseOperationIdentity },
		validator: { assertCurrentOperationId: () => undefined },
	},
} as unknown as IdentityContext;

const browserModel = createCodexBrowserModel(wireIdentityContext);

function cloneImmutable<T>(value: T): T {
	if (Array.isArray(value))
		return Object.freeze(value.map((entry) => cloneImmutable(entry))) as unknown as T;
	if (isRecord(value)) {
		const clone: Record<string, unknown> = {};
		for (const [key, entry] of Object.entries(value)) clone[key] = cloneImmutable(entry);
		return Object.freeze(clone) as T;
	}
	return value;
}

function parseModel<T>(description: string, parse: () => T): T {
	try {
		return parse();
	} catch (error) {
		if (error instanceof BrowserWorkbenchWireError) throw error;
		const detail = error instanceof Error ? error.message : "the value failed validation";
		fail(`${description}: ${detail}`);
	}
}

export function parseBrowserSnapshot(value: unknown): BrowserSnapshot {
	const parsed = parseModel("The Codex workbench snapshot is malformed", () =>
		browserModel.BrowserSnapshotSchema.parse(value),
	);
	return cloneImmutable(parsed) as BrowserSnapshot;
}

export function parseBrowserCommandLease(value: unknown): BrowserCommandLease | null {
	if (value === null) return null;
	const parsed = parseModel("The Codex workbench lease is malformed", () =>
		browserModel.BrowserCommandLeaseSchema.parse(value),
	);
	return cloneImmutable(parsed) as BrowserCommandLease;
}

export function parseRequiredBrowserCommandLease(value: unknown): BrowserCommandLease {
	const parsed = parseBrowserCommandLease(value);
	if (parsed === null) fail("The Codex workbench returned no command lease.");
	return parsed;
}

export function parseBrowserDynamicApprovalResponse(
	pending: unknown,
	value: unknown,
): Extract<BrowserCommand, { readonly command: "dynamicApprovalRespond" }> {
	const parsed = parseModel(
		"The Codex workbench dynamic approval response is malformed or no longer pending",
		() => browserModel.parseDynamicApprovalResponse(pending, value),
	);
	return cloneImmutable(parsed) as Extract<
		BrowserCommand,
		{ readonly command: "dynamicApprovalRespond" }
	>;
}

/**
 * One parser per snapshot field a delta may carry. Keyed by the delta type
 * itself, so adding a field to the shared BrowserSnapshot is a compile error
 * here rather than a delta the browser silently rejects at runtime.
 */
const DELTA_PARSERS = {
	readiness: (value) => browserModel.BrowserReadinessSchema.parse(value),
	account: (value) => browserModel.BrowserAccountSchema.parse(value),
	login: (value) => browserModel.BrowserLoginSchema.parse(value),
	threadLink: (value) => browserModel.BrowserThreadLinkSchema.parse(value),
	threadCandidates: (value) => browserModel.BrowserThreadCandidatesSchema.parse(value),
	timeline: (value) => browserModel.BrowserTimelineSchema.nullable().parse(value),
	queue: (value) => browserModel.BrowserQueueSchema.parse(value),
	settings: (value) => z.array(browserModel.BrowserSettingsSchema).parse(value),
	approvals: (value) => z.array(browserModel.BrowserApprovalSchema).parse(value),
	dynamicApprovals: (value) => z.array(browserModel.BrowserDynamicApprovalSchema).parse(value),
	semantic: (value) => browserModel.BrowserSemanticDeliverySchema.nullable().parse(value),
	coordinator: (value) => browserModel.BrowserCoordinatorSchema.parse(value),
	voice: (value) => browserModel.BrowserVoiceSchema.parse(value),
	lease: (value) => browserModel.BrowserCommandLeaseSchema.nullable().parse(value),
	operation: (value) => browserModel.BrowserOperationOutcomeSchema.nullable().parse(value),
} satisfies {
	readonly [Key in keyof Required<BrowserWorkbenchSnapshotDelta>]: (
		value: unknown,
	) => Required<BrowserWorkbenchSnapshotDelta>[Key];
};

type DeltaKey = keyof typeof DELTA_PARSERS;

function isDeltaKey(key: string): key is DeltaKey {
	return Object.hasOwn(DELTA_PARSERS, key);
}

function parseDeltaValue(key: DeltaKey, value: unknown): unknown {
	return parseModel(`The Codex workbench ${key} delta is malformed`, () =>
		DELTA_PARSERS[key](value),
	);
}

export function parseBrowserGatewayMessage(value: unknown): BrowserWorkbenchGatewayMessage {
	const parsed = record(value, "The Codex workbench event message is malformed.");
	if (parsed.kind !== "snapshot" && parsed.kind !== "delta")
		fail("The Codex workbench event message kind is invalid.");
	nonNegativeSafeInteger(parsed.sequence, "The Codex workbench sequence is invalid.");
	if (parsed.kind === "snapshot") {
		assertExactKeys(
			parsed,
			["kind", "sequence", "snapshot"],
			"The Codex workbench snapshot message fields are invalid.",
		);
		return cloneImmutable({
			kind: "snapshot",
			sequence: parsed.sequence,
			snapshot: parseBrowserSnapshot(parsed.snapshot),
		}) satisfies BrowserWorkbenchSnapshotMessage;
	}
	assertExactKeys(
		parsed,
		["kind", "sequence", "delta"],
		"The Codex workbench delta message fields are invalid.",
	);
	const deltaRecord = record(parsed.delta, "The Codex workbench delta is malformed.");
	const delta: Record<string, unknown> = {};
	for (const key of Object.keys(deltaRecord)) {
		if (!isDeltaKey(key)) fail(`The Codex workbench delta key ${JSON.stringify(key)} is invalid.`);
		if (deltaRecord[key] === undefined) fail("The Codex workbench delta cannot contain undefined.");
		delta[key] = parseDeltaValue(key, deltaRecord[key]);
	}
	return cloneImmutable({
		kind: "delta",
		sequence: parsed.sequence,
		delta: delta as BrowserWorkbenchSnapshotDelta,
	}) satisfies BrowserWorkbenchDeltaMessage;
}

export function parseBrowserSnapshotMessage(value: unknown): BrowserWorkbenchSnapshotMessage {
	const parsed = parseBrowserGatewayMessage(value);
	if (parsed.kind !== "snapshot") fail("The Codex workbench response is not a snapshot.");
	return parsed;
}

function parseDeliveryOutcome(
	value: unknown,
): value is "delivered" | "not_delivered" | "outcome_unknown" {
	return value === "delivered" || value === "not_delivered" || value === "outcome_unknown";
}

function parseGatewayCode(value: unknown): BrowserGatewayErrorCode | null {
	if (value === null) return null;
	if (typeof value !== "string" || !GATEWAY_ERROR_CODES.has(value as BrowserGatewayErrorCode))
		fail("The Codex workbench gateway error code is invalid.");
	return value as BrowserGatewayErrorCode;
}

function parseRealtimeAnswer(value: unknown): AnswerSdp {
	const parsed = record(value, "The Codex workbench realtime answer is malformed.");
	assertExactKeys(
		parsed,
		["sessionId", "correlationId", "sdp"],
		"The Codex workbench realtime answer fields are invalid.",
	);
	boundedString(parsed.sessionId, "The Codex workbench realtime session id is invalid.");
	boundedString(parsed.correlationId, "The Codex workbench realtime correlation id is invalid.");
	boundedString(parsed.sdp, "The Codex workbench realtime SDP is invalid.");
	return cloneImmutable(parsed) as unknown as AnswerSdp;
}

export function parseBrowserCommandResult(value: unknown): BrowserWorkbenchCommandResult {
	const parsed = record(value, "The Codex workbench command result is malformed.");
	assertOptionalKeys(
		parsed,
		[
			"kind",
			"commandId",
			"outcome",
			"code",
			"message",
			"snapshot",
			"realtimeAnswer",
			"realtimeSessionHandle",
		],
		"The Codex workbench command result fields are invalid.",
	);
	if (parsed.kind !== "command_result") fail("The Codex workbench command result kind is invalid.");
	if (parsed.commandId !== null) parseIdentity(parsed.commandId, "browser-command");
	if (!parseDeliveryOutcome(parsed.outcome))
		fail("The Codex workbench command result outcome is invalid.");
	parseGatewayCode(parsed.code);
	if (parsed.message !== null)
		boundedString(
			parsed.message,
			"The Codex workbench command result message is invalid.",
			16_384,
			true,
		);
	const snapshot = parseBrowserSnapshot(parsed.snapshot);
	const result: Record<string, unknown> = { ...parsed, snapshot };
	if (Object.hasOwn(parsed, "realtimeAnswer"))
		result.realtimeAnswer = parseRealtimeAnswer(parsed.realtimeAnswer);
	if (Object.hasOwn(parsed, "realtimeSessionHandle"))
		parseIdentity(parsed.realtimeSessionHandle, "browser-command");
	return cloneImmutable(result) as unknown as BrowserWorkbenchCommandResult;
}

export function parseBrowserAccountReadResult(value: unknown): BrowserWorkbenchAccountReadResult {
	const parsed = record(value, "The Codex workbench account result is malformed.");
	assertExactKeys(
		parsed,
		["kind", "outcome", "code", "message", "snapshot"],
		"The Codex workbench account result fields are invalid.",
	);
	if (parsed.kind !== "account_read") fail("The Codex workbench account result kind is invalid.");
	if (!parseDeliveryOutcome(parsed.outcome))
		fail("The Codex workbench account result outcome is invalid.");
	parseGatewayCode(parsed.code);
	if (parsed.message !== null)
		boundedString(
			parsed.message,
			"The Codex workbench account result message is invalid.",
			16_384,
			true,
		);
	return cloneImmutable({
		...parsed,
		snapshot: parseBrowserSnapshot(parsed.snapshot),
	}) as BrowserWorkbenchAccountReadResult;
}

export function parseBrowserResponse(value: unknown): BrowserWorkbenchResponseEnvelope {
	const parsed = record(value, "The Codex workbench response is malformed.");
	if (parsed.type !== "codex_workbench_result")
		fail("The Codex workbench response type is invalid.");
	if (parsed.requestId !== null)
		nonEmptyString(parsed.requestId, "The Codex workbench response id is invalid.");
	if (parsed.action !== null)
		nonEmptyString(parsed.action, "The Codex workbench response action is invalid.");
	if (parsed.ok === true) {
		assertExactKeys(
			parsed,
			["type", "requestId", "action", "ok", "value"],
			"The Codex workbench success response fields are invalid.",
		);
		return cloneImmutable(parsed) as unknown as BrowserWorkbenchResponseEnvelope;
	}
	if (parsed.ok === false) {
		assertExactKeys(
			parsed,
			["type", "requestId", "action", "ok", "error"],
			"The Codex workbench failure response fields are invalid.",
		);
		nonEmptyString(parsed.error, "The Codex workbench failure message is invalid.");
		return cloneImmutable(parsed) as unknown as BrowserWorkbenchResponseEnvelope;
	}
	fail("The Codex workbench response success flag is invalid.");
}

export function parseBrowserEvent(value: unknown): BrowserWorkbenchGatewayMessage {
	const parsed = record(value, "The Codex workbench event is malformed.");
	if (parsed.type !== "codex_workbench_event") fail("The Codex workbench event type is invalid.");
	assertExactKeys(parsed, ["type", "message"], "The Codex workbench event fields are invalid.");
	return parseBrowserGatewayMessage(parsed.message);
}
