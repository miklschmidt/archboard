import type {
	BrowserAccount,
	BrowserCommandLease,
	BrowserLogin,
	BrowserReadiness,
	BrowserSnapshot,
	BrowserThreadLink,
} from "../../../shared/codex-browser-model/index.js";
import type {
	BrowserGatewayErrorCode,
	BrowserWorkbenchAccountReadResult,
	BrowserWorkbenchCommandResult,
	BrowserWorkbenchDeltaMessage,
	BrowserWorkbenchGatewayMessage,
	BrowserWorkbenchSnapshotDelta,
	BrowserWorkbenchSnapshotMessage,
} from "./contract.js";

const SNAPSHOT_KEYS = [
	"kind",
	"version",
	"readiness",
	"account",
	"login",
	"threadLink",
	"timeline",
	"queue",
	"settings",
	"approvals",
	"dynamicApprovals",
	"semantic",
	"coordinator",
	"voice",
	"lease",
	"operation",
] as const;

const DELTA_KEYS = new Set([
	"readiness",
	"account",
	"login",
	"threadLink",
	"timeline",
	"queue",
	"settings",
	"approvals",
	"dynamicApprovals",
	"semantic",
	"coordinator",
	"voice",
	"lease",
	"operation",
]);

const GATEWAY_ERROR_CODES = new Set<BrowserGatewayErrorCode>([
	"disposed",
	"invalid_input",
	"invalid_command",
	"invalid_projection",
	"not_ready",
	"thread_capability_required",
	"link_required",
	"link_changed",
	"lease_required",
	"lease_expired",
	"lease_released",
	"lease_transferred",
	"child_disconnected",
	"approval_not_pending",
	"dynamic_approval_not_pending",
	"unsupported_command",
	"command_failed",
	"outcome_unknown",
]);

const READINESS_KEYS: Record<BrowserReadiness["state"], readonly string[]> = {
	stopped: ["kind", "state", "reason"],
	backoff: ["kind", "state", "retryAtMs", "reason"],
	initialized: ["kind", "state"],
	storage_mismatch: ["kind", "state", "reason"],
	login_capable: ["kind", "state"],
	signed_out: ["kind", "state"],
	login_pending: ["kind", "state", "loginId"],
	account_ready: ["kind", "state"],
	thread_capable: ["kind", "state"],
	reconnecting: ["kind", "state", "reason"],
	incompatible_contract: ["kind", "state", "reason"],
};

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

function record(value: unknown, message: string): Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) fail(message);
	return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, message: string): asserts value is string {
	if (typeof value !== "string" || value.length === 0) fail(message);
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

function parseReadiness(value: unknown): BrowserReadiness {
	const parsed = record(value, "The Codex workbench readiness is malformed.");
	if (parsed.kind !== "readiness") fail("The Codex workbench readiness kind is invalid.");
	const state = parsed.state;
	if (typeof state !== "string" || !(state in READINESS_KEYS))
		fail("The Codex workbench readiness state is invalid.");
	assertExactKeys(
		parsed,
		READINESS_KEYS[state as BrowserReadiness["state"]],
		"The Codex workbench readiness fields are invalid.",
	);
	if (state === "backoff")
		nonNegativeSafeInteger(parsed.retryAtMs, "The Codex workbench retry time is invalid.");
	if (
		state === "stopped" ||
		state === "storage_mismatch" ||
		state === "reconnecting" ||
		state === "incompatible_contract"
	)
		nonEmptyString(parsed.reason, "The Codex workbench readiness reason is invalid.");
	if (state === "login_pending")
		nonEmptyString(parsed.loginId, "The Codex workbench login id is invalid.");
	return parsed as unknown as BrowserReadiness;
}

function parseAccount(value: unknown): BrowserAccount {
	const parsed = record(value, "The Codex workbench account is malformed.");
	if (parsed.kind !== "account") fail("The Codex workbench account kind is invalid.");
	switch (parsed.state) {
		case "unknown":
			assertExactKeys(
				parsed,
				["kind", "state", "reason"],
				"The Codex workbench account fields are invalid.",
			);
			nonEmptyString(parsed.reason, "The Codex workbench account reason is invalid.");
			break;
		case "signed_out":
			assertExactKeys(parsed, ["kind", "state"], "The Codex workbench account fields are invalid.");
			break;
		case "login_pending":
			assertExactKeys(
				parsed,
				["kind", "state", "loginId", "variant"],
				"The Codex workbench account fields are invalid.",
			);
			nonEmptyString(parsed.loginId, "The Codex workbench account login id is invalid.");
			nonEmptyString(parsed.variant, "The Codex workbench account variant is invalid.");
			break;
		case "ready":
			assertExactKeys(
				parsed,
				["kind", "state", "accountType"],
				"The Codex workbench account fields are invalid.",
			);
			nonEmptyString(parsed.accountType, "The Codex workbench account type is invalid.");
			break;
		case "failed":
			assertExactKeys(
				parsed,
				["kind", "state", "reason"],
				"The Codex workbench account fields are invalid.",
			);
			nonEmptyString(parsed.reason, "The Codex workbench account reason is invalid.");
			break;
		default:
			fail("The Codex workbench account state is invalid.");
	}
	return parsed as unknown as BrowserAccount;
}

function parseLogin(value: unknown): BrowserLogin {
	const parsed = record(value, "The Codex workbench login is malformed.");
	if (parsed.kind !== "login") fail("The Codex workbench login kind is invalid.");
	switch (parsed.state) {
		case "idle":
			assertExactKeys(parsed, ["kind", "state"], "The Codex workbench login fields are invalid.");
			break;
		case "pending":
			assertExactKeys(
				parsed,
				["kind", "state", "loginId", "variant"],
				"The Codex workbench login fields are invalid.",
			);
			nonEmptyString(parsed.loginId, "The Codex workbench login id is invalid.");
			nonEmptyString(parsed.variant, "The Codex workbench login variant is invalid.");
			break;
		case "completed":
		case "cancelled":
			assertExactKeys(
				parsed,
				["kind", "state", "loginId"],
				"The Codex workbench login fields are invalid.",
			);
			nonEmptyString(parsed.loginId, "The Codex workbench login id is invalid.");
			break;
		case "failed":
			assertExactKeys(
				parsed,
				["kind", "state", "loginId", "reason"],
				"The Codex workbench login fields are invalid.",
			);
			if (parsed.loginId !== null)
				nonEmptyString(parsed.loginId, "The Codex workbench login id is invalid.");
			nonEmptyString(parsed.reason, "The Codex workbench login reason is invalid.");
			break;
		default:
			fail("The Codex workbench login state is invalid.");
	}
	return parsed as unknown as BrowserLogin;
}

function parseThreadLink(value: unknown): BrowserThreadLink {
	const parsed = record(value, "The Codex workbench thread link is malformed.");
	if (parsed.kind !== "thread_link") fail("The Codex workbench thread link kind is invalid.");
	if (
		parsed.state !== "unbound" &&
		parsed.state !== "inspect_only" &&
		parsed.state !== "executable"
	)
		fail("The Codex workbench thread link state is invalid.");
	assertExactKeys(
		parsed,
		[
			"kind",
			"state",
			"childId",
			"epoch",
			"threadId",
			"source",
			"status",
			"loaded",
			"canAcceptDirectInput",
			"reason",
		],
		"The Codex workbench thread link fields are invalid.",
	);
	if (parsed.state === "unbound") {
		if (
			parsed.childId !== null ||
			parsed.epoch !== null ||
			parsed.threadId !== null ||
			parsed.source !== null
		)
			fail("The unbound workbench thread link contains a target.");
		if (
			parsed.status !== "notLoaded" ||
			parsed.loaded !== false ||
			parsed.canAcceptDirectInput !== false
		)
			fail("The unbound workbench thread link flags are invalid.");
	}
	if (parsed.state === "inspect_only") {
		if (parsed.childId !== null || parsed.epoch !== null || typeof parsed.threadId !== "string")
			fail("The inspect-only workbench thread link target is invalid.");
		if (parsed.loaded !== true && parsed.loaded !== false)
			fail("The inspect-only workbench thread link load flag is invalid.");
		if (parsed.canAcceptDirectInput !== false)
			fail("The inspect-only workbench thread link input flag is invalid.");
	}
	if (parsed.state === "executable") {
		nonEmptyString(parsed.childId, "The executable workbench child id is invalid.");
		nonEmptyString(parsed.epoch, "The executable workbench epoch is invalid.");
		nonEmptyString(parsed.threadId, "The executable workbench thread id is invalid.");
		if (parsed.loaded !== true || parsed.canAcceptDirectInput !== true)
			fail("The executable workbench thread link flags are invalid.");
	}
	return parsed as unknown as BrowserThreadLink;
}

export function parseBrowserCommandLease(value: unknown): BrowserCommandLease | null {
	if (value === null) return null;
	const parsed = record(value, "The Codex workbench lease is malformed.");
	assertExactKeys(
		parsed,
		["kind", "commandId", "paneId", "childId", "epoch", "state", "expiresAtMs"],
		"The Codex workbench lease fields are invalid.",
	);
	if (parsed.kind !== "command_lease") fail("The Codex workbench lease kind is invalid.");
	nonEmptyString(parsed.commandId, "The Codex workbench lease command id is invalid.");
	nonEmptyString(parsed.paneId, "The Codex workbench lease pane id is invalid.");
	nonEmptyString(parsed.childId, "The Codex workbench lease child id is invalid.");
	nonEmptyString(parsed.epoch, "The Codex workbench lease epoch is invalid.");
	if (parsed.state !== "active" && parsed.state !== "expired" && parsed.state !== "released")
		fail("The Codex workbench lease state is invalid.");
	nonNegativeSafeInteger(parsed.expiresAtMs, "The Codex workbench lease expiry is invalid.");
	return parsed as unknown as BrowserCommandLease;
}

export function parseRequiredBrowserCommandLease(value: unknown): BrowserCommandLease {
	const parsed = parseBrowserCommandLease(value);
	if (parsed === null) fail("The Codex workbench returned no command lease.");
	return parsed;
}

function assertSnapshotShape(value: Record<string, unknown>): void {
	assertExactKeys(value, SNAPSHOT_KEYS, "The Codex workbench snapshot fields are invalid.");
	if (value.kind !== "snapshot" || value.version !== 1)
		fail("The Codex workbench snapshot version is incompatible.");
	parseReadiness(value.readiness);
	parseAccount(value.account);
	parseLogin(value.login);
	parseThreadLink(value.threadLink);
	if (value.timeline !== null) record(value.timeline, "The Codex workbench timeline is malformed.");
	record(value.queue, "The Codex workbench queue is malformed.");
	if (!Array.isArray(value.settings)) fail("The Codex workbench settings are malformed.");
	if (!Array.isArray(value.approvals)) fail("The Codex workbench approvals are malformed.");
	if (!Array.isArray(value.dynamicApprovals))
		fail("The Codex workbench dynamic approvals are malformed.");
	if (value.semantic !== null)
		record(value.semantic, "The Codex workbench semantic state is malformed.");
	record(value.coordinator, "The Codex workbench coordinator is malformed.");
	record(value.voice, "The Codex workbench voice state is malformed.");
	parseBrowserCommandLease(value.lease);
	if (value.operation !== null)
		record(value.operation, "The Codex workbench operation is malformed.");
}

export function parseBrowserSnapshot(value: unknown): BrowserSnapshot {
	const parsed = record(value, "The Codex workbench snapshot is malformed.");
	assertSnapshotShape(parsed);
	return parsed as unknown as BrowserSnapshot;
}

function parseDeltaValue(key: string, value: unknown): unknown {
	if (value === undefined) fail("The Codex workbench delta cannot contain undefined.");
	switch (key) {
		case "readiness":
			return parseReadiness(value);
		case "account":
			return parseAccount(value);
		case "login":
			return parseLogin(value);
		case "threadLink":
			return parseThreadLink(value);
		case "timeline":
			if (value !== null) record(value, "The Codex workbench timeline delta is malformed.");
			return value;
		case "queue":
			return record(value, "The Codex workbench queue delta is malformed.");
		case "settings":
		case "approvals":
		case "dynamicApprovals":
			if (!Array.isArray(value)) fail(`The Codex workbench ${key} delta is malformed.`);
			return value;
		case "semantic":
			if (value !== null) record(value, "The Codex workbench semantic delta is malformed.");
			return value;
		case "coordinator":
			return record(value, "The Codex workbench coordinator delta is malformed.");
		case "voice":
			return record(value, "The Codex workbench voice delta is malformed.");
		case "lease":
			return parseBrowserCommandLease(value);
		case "operation":
			if (value !== null) record(value, "The Codex workbench operation delta is malformed.");
			return value;
		default:
			fail(`The Codex workbench delta key ${JSON.stringify(key)} is invalid.`);
	}
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
		return Object.freeze({
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
		if (!DELTA_KEYS.has(key))
			fail(`The Codex workbench delta key ${JSON.stringify(key)} is invalid.`);
		delta[key] = parseDeltaValue(key, deltaRecord[key]);
	}
	return Object.freeze({
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
	if (parsed.commandId !== null)
		nonEmptyString(parsed.commandId, "The Codex workbench command result id is invalid.");
	if (!parseDeliveryOutcome(parsed.outcome))
		fail("The Codex workbench command result outcome is invalid.");
	parseGatewayCode(parsed.code);
	if (parsed.message !== null && typeof parsed.message !== "string")
		fail("The Codex workbench command result message is invalid.");
	const snapshot = parseBrowserSnapshot(parsed.snapshot);
	if (Object.hasOwn(parsed, "realtimeSessionHandle"))
		nonEmptyString(parsed.realtimeSessionHandle, "The Codex workbench realtime handle is invalid.");
	if (Object.hasOwn(parsed, "realtimeAnswer"))
		record(parsed.realtimeAnswer, "The Codex workbench realtime answer is malformed.");
	return { ...parsed, snapshot } as unknown as BrowserWorkbenchCommandResult;
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
	if (parsed.message !== null && typeof parsed.message !== "string")
		fail("The Codex workbench account result message is invalid.");
	return {
		...parsed,
		snapshot: parseBrowserSnapshot(parsed.snapshot),
	} as unknown as BrowserWorkbenchAccountReadResult;
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
		return parsed as unknown as BrowserWorkbenchResponseEnvelope;
	}
	if (parsed.ok === false) {
		assertExactKeys(
			parsed,
			["type", "requestId", "action", "ok", "error"],
			"The Codex workbench failure response fields are invalid.",
		);
		nonEmptyString(parsed.error, "The Codex workbench failure message is invalid.");
		return parsed as unknown as BrowserWorkbenchResponseEnvelope;
	}
	fail("The Codex workbench response success flag is invalid.");
}

export function parseBrowserEvent(value: unknown): BrowserWorkbenchGatewayMessage {
	const parsed = record(value, "The Codex workbench event is malformed.");
	if (parsed.type !== "codex_workbench_event") fail("The Codex workbench event type is invalid.");
	assertExactKeys(parsed, ["type", "message"], "The Codex workbench event fields are invalid.");
	return parseBrowserGatewayMessage(parsed.message);
}
