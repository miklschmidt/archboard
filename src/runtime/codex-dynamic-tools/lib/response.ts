import {
	parseToolResultEnvelope,
	type DynamicToolCallResponse,
	type GeneralThreadToolName,
} from "../../codex-thread-tools/index.js";
import type { DynamicRefusalReason } from "./contract.js";

const OUTCOME_UNKNOWN_MESSAGE =
	"The request may have taken effect. Inspect authoritative state before another mutation." as const;

function truncateUtf8(value: string, maximum: number): string {
	if (Buffer.byteLength(value, "utf8") <= maximum) {
		return value;
	}
	const ellipsis = "…";
	const budget = maximum - Buffer.byteLength(ellipsis, "utf8");
	let result = "";
	for (const character of value) {
		if (Buffer.byteLength(result + character, "utf8") > budget) {
			break;
		}
		result += character;
	}
	return `${result}${ellipsis}`;
}

function messageOf(value: string): string {
	const normalized = value.trim();
	return truncateUtf8(normalized.length === 0 ? "The dynamic call was refused." : normalized, 512);
}

export function dynamicResponse(
	name: GeneralThreadToolName,
	envelope: unknown,
	success = true,
): DynamicToolCallResponse {
	const text = JSON.stringify(envelope);
	if (text === undefined) {
		throw new TypeError("The dynamic response envelope could not be encoded.");
	}
	const parsed = parseToolResultEnvelope(name, text);
	const canonicalText = JSON.stringify(parsed);
	if (canonicalText === undefined) {
		throw new TypeError("The dynamic response could not be encoded.");
	}
	const response: DynamicToolCallResponse = {
		contentItems: [{ type: "inputText", text: canonicalText }],
		success,
	};
	return Object.freeze(response);
}

export function invalidDynamicResponse(
	reason: Extract<DynamicRefusalReason, "invalid_call" | "unsupported">,
	message: string,
): DynamicToolCallResponse {
	const envelope = JSON.stringify({ tag: "refused", reason, message: messageOf(message) });
	const response: DynamicToolCallResponse = {
		contentItems: [{ type: "inputText", text: envelope }],
		success: false,
	};
	return Object.freeze(response);
}

export function refusedDynamicResponse(
	name: GeneralThreadToolName,
	reason: DynamicRefusalReason,
	message: string,
): DynamicToolCallResponse {
	return dynamicResponse(name, {
		tag: "refused",
		reason,
		message: messageOf(message),
	});
}

export function approvalRequiredDynamicResponse(
	name: GeneralThreadToolName,
	operationId: string,
	summary: string,
): DynamicToolCallResponse {
	return dynamicResponse(name, {
		tag: "approval_required",
		operationId,
		summary: truncateUtf8(summary, 512),
	});
}

export function outcomeUnknownDynamicResponse(
	name: GeneralThreadToolName,
	operationId: string,
): DynamicToolCallResponse {
	return dynamicResponse(name, {
		tag: "outcome_unknown",
		operationId,
		message: OUTCOME_UNKNOWN_MESSAGE,
	});
}

export function outcomeUnknownMessage(): typeof OUTCOME_UNKNOWN_MESSAGE {
	return OUTCOME_UNKNOWN_MESSAGE;
}
