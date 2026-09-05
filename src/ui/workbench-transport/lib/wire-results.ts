// The wire parsers for what a request answers with: the response envelope,
// the pushed event envelope, command results and account results.

import { BROWSER_GATEWAY_ERROR_CODES } from "@/shared/codex-browser-gateway";
import { DeliveryOutcomeSchema, type DeliveryOutcome } from "@/shared/codex-browser-model";
import {
	parseRealtimeCorrelationId,
	parseRealtimeSessionId,
	type AnswerSdp,
} from "@/shared/codex-realtime-host";
import type {
	BrowserGatewayErrorCode,
	BrowserWorkbenchAccountReadResult,
	BrowserWorkbenchCommandResult,
	BrowserWorkbenchGatewayMessage,
} from "@/ui/workbench-transport/contract";
import {
	WIRE_VALUE_MAX_BYTES,
	assertExactKeys,
	assertOptionalKeys,
	boundedString,
	fail,
	freezeDeep,
	nonEmptyString,
	parseBrowserGatewayMessage,
	parseBrowserSnapshot,
	record,
} from "@/ui/workbench-transport/lib/wire";
import { parseIdentity } from "@/ui/workbench-transport/lib/wire-identity";

const GATEWAY_ERROR_CODES: ReadonlySet<string> = new Set(BROWSER_GATEWAY_ERROR_CODES);
const COMMAND_RESULT_KEYS = [
	"kind",
	"commandId",
	"outcome",
	"code",
	"message",
	"snapshot",
	"turnId",
	"realtimeAnswer",
	"realtimeSessionHandle",
] as const;

/** The gateway's answer to one request, matched to it by request id and action. */
type BrowserWorkbenchResponseEnvelope =
	| {
			readonly type: "codex_workbench_result";
			readonly requestId: string | null;
			readonly action: string | null;
			readonly ok: true;
			readonly value: unknown;
	  }
	| {
			readonly type: "codex_workbench_result";
			readonly requestId: string | null;
			readonly action: string | null;
			readonly ok: false;
			readonly error: string;
	  };

/**
 * Parse a delivery outcome.
 * @param value The wire value.
 * @param message The refusal.
 * @returns The outcome.
 */
function parseDeliveryOutcome(value: unknown, message: string): DeliveryOutcome {
	const parsed = DeliveryOutcomeSchema.safeParse(value);
	return parsed.success ? parsed.data : fail(message);
}

/**
 * Whether a value is a gateway error code.
 * @param value The value.
 * @returns True for a known code.
 */
function isGatewayCode(value: unknown): value is BrowserGatewayErrorCode {
	return typeof value === "string" && GATEWAY_ERROR_CODES.has(value);
}

/**
 * Parse a nullable gateway error code.
 * @param value The wire value.
 * @returns The code, or null.
 */
function parseGatewayCode(value: unknown): BrowserGatewayErrorCode | null {
	if (value === null) {
		return null;
	}
	return isGatewayCode(value) ? value : fail("The Codex workbench gateway error code is invalid.");
}

/**
 * Parse a nullable result message.
 * @param value The wire value.
 * @param message The refusal.
 * @returns The text, or null.
 */
function parseResultMessage(value: unknown, message: string): string | null {
	return value === null ? null : boundedString(value, message, true);
}

/**
 * Whether an SDP document is acceptable. SDP uses terminal CRLF (RFC 8866
 * section 5), so it is kept exactly rather than trimmed like an identity.
 * @param value The wire value.
 * @returns True for a non-blank, NUL-free, bounded document.
 */
function isSdp(value: unknown): value is string {
	return (
		typeof value === "string" &&
		value.trim().length > 0 &&
		!value.includes("\0") &&
		new TextEncoder().encode(value).byteLength <= WIRE_VALUE_MAX_BYTES
	);
}

/**
 * Parse a realtime SDP answer.
 * @param value The wire value.
 * @returns The answer.
 */
function parseRealtimeAnswer(value: unknown): AnswerSdp {
	const parsed = record(value, "The Codex workbench realtime answer is malformed.");
	assertExactKeys(
		parsed,
		["sessionId", "correlationId", "sdp"],
		"The Codex workbench realtime answer fields are invalid.",
	);
	const sessionId = boundedString(
		parsed["sessionId"],
		"The Codex workbench realtime session id is invalid.",
	);
	const correlationId = boundedString(
		parsed["correlationId"],
		"The Codex workbench realtime correlation id is invalid.",
	);
	if (!isSdp(parsed["sdp"])) {
		fail("The Codex workbench realtime SDP is invalid.");
	}
	return {
		sessionId: parseRealtimeSessionId(sessionId),
		correlationId: parseRealtimeCorrelationId(correlationId),
		sdp: parsed["sdp"],
	};
}

type OptionalCommandResultFields = Pick<
	BrowserWorkbenchCommandResult,
	"turnId" | "realtimeAnswer" | "realtimeSessionHandle"
>;

/**
 * The optional fields of a command result, each parsed only when present.
 * @param parsed The result record.
 * @returns The fields to add.
 */
function optionalCommandResultFields(parsed: Record<string, unknown>): OptionalCommandResultFields {
	return {
		...(Object.hasOwn(parsed, "turnId") ? { turnId: parseIdentity(parsed["turnId"], "turn") } : {}),
		...(Object.hasOwn(parsed, "realtimeAnswer")
			? { realtimeAnswer: parseRealtimeAnswer(parsed["realtimeAnswer"]) }
			: {}),
		...(Object.hasOwn(parsed, "realtimeSessionHandle")
			? {
					realtimeSessionHandle: parseIdentity(parsed["realtimeSessionHandle"], "browser-command"),
				}
			: {}),
	};
}

/**
 * Parse a command result.
 * @param value The wire value.
 * @returns The frozen result.
 */
function parseBrowserCommandResult(value: unknown): BrowserWorkbenchCommandResult {
	const parsed = record(value, "The Codex workbench command result is malformed.");
	assertOptionalKeys(
		parsed,
		COMMAND_RESULT_KEYS,
		"The Codex workbench command result fields are invalid.",
	);
	if (parsed["kind"] !== "command_result") {
		fail("The Codex workbench command result kind is invalid.");
	}
	const result: BrowserWorkbenchCommandResult = {
		kind: "command_result",
		commandId:
			parsed["commandId"] === null ? null : parseIdentity(parsed["commandId"], "browser-command"),
		outcome: parseDeliveryOutcome(
			parsed["outcome"],
			"The Codex workbench command result outcome is invalid.",
		),
		code: parseGatewayCode(parsed["code"]),
		message: parseResultMessage(
			parsed["message"],
			"The Codex workbench command result message is invalid.",
		),
		snapshot: parseBrowserSnapshot(parsed["snapshot"]),
		...optionalCommandResultFields(parsed),
	};
	return freezeDeep(result);
}

/**
 * Parse an account read result.
 * @param value The wire value.
 * @returns The frozen result.
 */
function parseBrowserAccountReadResult(value: unknown): BrowserWorkbenchAccountReadResult {
	const parsed = record(value, "The Codex workbench account result is malformed.");
	assertExactKeys(
		parsed,
		["kind", "outcome", "code", "message", "snapshot"],
		"The Codex workbench account result fields are invalid.",
	);
	if (parsed["kind"] !== "account_read") {
		fail("The Codex workbench account result kind is invalid.");
	}
	const result: BrowserWorkbenchAccountReadResult = {
		kind: "account_read",
		outcome: parseDeliveryOutcome(
			parsed["outcome"],
			"The Codex workbench account result outcome is invalid.",
		),
		code: parseGatewayCode(parsed["code"]),
		message: parseResultMessage(
			parsed["message"],
			"The Codex workbench account result message is invalid.",
		),
		snapshot: parseBrowserSnapshot(parsed["snapshot"]),
	};
	return freezeDeep(result);
}

/**
 * The request id and action a response names.
 * @param parsed The response record.
 * @returns The two fields, each nullable.
 */
function responseIdentity(parsed: Record<string, unknown>): {
	readonly requestId: string | null;
	readonly action: string | null;
} {
	return {
		requestId:
			parsed["requestId"] === null
				? null
				: nonEmptyString(parsed["requestId"], "The Codex workbench response id is invalid."),
		action:
			parsed["action"] === null
				? null
				: nonEmptyString(parsed["action"], "The Codex workbench response action is invalid."),
	};
}

/**
 * Parse a response envelope.
 * @param value The wire value.
 * @returns The frozen envelope.
 */
function parseBrowserResponse(value: unknown): BrowserWorkbenchResponseEnvelope {
	const parsed = record(value, "The Codex workbench response is malformed.");
	if (parsed["type"] !== "codex_workbench_result") {
		fail("The Codex workbench response type is invalid.");
	}
	const identity = responseIdentity(parsed);
	if (parsed["ok"] === true) {
		assertExactKeys(
			parsed,
			["type", "requestId", "action", "ok", "value"],
			"The Codex workbench success response fields are invalid.",
		);
		return freezeDeep({
			type: "codex_workbench_result",
			...identity,
			ok: true,
			value: parsed["value"],
		});
	}
	if (parsed["ok"] !== false) {
		fail("The Codex workbench response success flag is invalid.");
	}
	assertExactKeys(
		parsed,
		["type", "requestId", "action", "ok", "error"],
		"The Codex workbench failure response fields are invalid.",
	);
	const error = nonEmptyString(parsed["error"], "The Codex workbench failure message is invalid.");
	return freezeDeep({ type: "codex_workbench_result", ...identity, ok: false, error });
}

/**
 * Parse a gateway event envelope.
 * @param value The wire value.
 * @returns The frozen message it carries.
 */
function parseBrowserEvent(value: unknown): BrowserWorkbenchGatewayMessage {
	const parsed = record(value, "The Codex workbench event is malformed.");
	if (parsed["type"] !== "codex_workbench_event") {
		fail("The Codex workbench event type is invalid.");
	}
	assertExactKeys(parsed, ["type", "message"], "The Codex workbench event fields are invalid.");
	return parseBrowserGatewayMessage(parsed["message"]);
}

export {
	parseBrowserAccountReadResult,
	parseBrowserCommandResult,
	parseBrowserEvent,
	parseBrowserResponse,
	type BrowserWorkbenchResponseEnvelope,
};
