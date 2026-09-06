import {
	DynamicToolEnvelopeSchema,
	DynamicToolOutcomeUnknownEnvelopeSchema,
	DynamicToolResponseSchema,
	UnknownDynamicToolResponseSchema,
	ValidDynamicToolResponseSchema,
	parseCoordinatorToolResult,
	type CoordinatorToolName,
	type DynamicToolRefusalReason,
} from "@/runtime/codex-coordinator-tool-contract";
import type { DynamicToolOkEnvelopeSchema } from "@/runtime/codex-coordinator-tool-contract";
import type {
	CoordinatorToolValueFor,
	DynamicToolResponse,
} from "@/runtime/codex-coordinator-tools/lib/contract";
import { DYNAMIC_TOOL_OUTCOME_UNKNOWN_MESSAGE } from "@/runtime/codex-coordinator-tool-contract";
import type { z } from "zod";

type DynamicToolEnvelope = z.infer<typeof DynamicToolEnvelopeSchema>;
type DynamicToolValue = z.infer<typeof DynamicToolOkEnvelopeSchema>["value"];

/**
 *
 */
function freezeDeep<T>(value: T): T {
	if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
		return value;
	}
	for (const child of Object.values(value as Record<string, unknown>)) {
		freezeDeep(child);
	}
	return Object.freeze(value);
}

/**
 *
 */
function boundedMessage(message: string): string {
	const value = message.length === 0 ? "The coordinator tool call was refused." : message;
	return value.length <= 4_096 ? value : `${value.slice(0, 4_093)}...`;
}

/**
 *
 */
function requireOperationId(operationId: string | null | undefined): string {
	if (typeof operationId !== "string" || operationId.length === 0 || operationId.length > 128) {
		throw new TypeError(
			"A coordinator tool response requires one host-supplied operation identity.",
		);
	}
	return operationId;
}

/**
 *
 */
function canonicalValue<Name extends CoordinatorToolName>(
	name: Name,
	value: CoordinatorToolValueFor<Name>,
): DynamicToolValue {
	const record = value as Record<string, unknown>;
	switch (name) {
		case "inspect_workhorse":
			return {
				threadId: record["threadId"],
				status: record["status"],
				activeTurnId: record["activeTurnId"],
				queuedSubmissionIds: [...(record["queuedSubmissionIds"] as readonly unknown[])],
			} as DynamicToolValue;
		case "delegate_to_workhorse":
			return {
				mode: record["mode"],
				clientUserMessageId: record["clientUserMessageId"],
				queuedSubmissionId: record["queuedSubmissionId"],
				turnId: record["turnId"],
			} as DynamicToolValue;
		case "manage_workhorse_queue":
			return {
				operation: record["operation"],
				queuedSubmissionIds: [...(record["queuedSubmissionIds"] as readonly unknown[])],
			} as DynamicToolValue;
		case "steer_workhorse":
			return { turnId: record["turnId"], delivery: record["delivery"] } as DynamicToolValue;
		case "resolve_spoken_approval":
			return { verdict: record["verdict"], settlement: record["settlement"] } as DynamicToolValue;
	}
}

/**
 *
 */
function responseForEnvelope(envelope: DynamicToolEnvelope, success: boolean): DynamicToolResponse {
	const text = JSON.stringify(DynamicToolEnvelopeSchema.parse(envelope));
	const candidate = {
		contentItems: [{ type: "inputText" as const, text }],
		success,
	};
	const parsed = success
		? ValidDynamicToolResponseSchema.parse(candidate)
		: UnknownDynamicToolResponseSchema.parse(candidate);
	return freezeDeep(parsed);
}

/**
 *
 */
function okResponse<Name extends CoordinatorToolName>(
	name: Name,
	operationId: string,
	value: CoordinatorToolValueFor<Name>,
): DynamicToolResponse {
	const canonical = canonicalValue(name, value);
	parseCoordinatorToolResult(name, canonical);
	return responseForEnvelope(
		{
			tag: "ok",
			operationId: requireOperationId(operationId),
			value: canonical,
		},
		true,
	);
}

/**
 *
 */
function refusedResponse(
	reason: DynamicToolRefusalReason,
	message: string,
	outerFailure = false,
): DynamicToolResponse {
	return responseForEnvelope(
		{ tag: "refused", reason, message: boundedMessage(message) },
		!outerFailure,
	);
}

/**
 *
 */
function approvalRequiredResponse(operationId: string, summary: string): DynamicToolResponse {
	return responseForEnvelope(
		{
			tag: "approval_required",
			operationId: requireOperationId(operationId),
			summary: boundedMessage(summary),
		},
		true,
	);
}

/**
 *
 */
function outcomeUnknownResponse(operationId: string): DynamicToolResponse {
	const envelope = DynamicToolOutcomeUnknownEnvelopeSchema.parse({
		tag: "outcome_unknown",
		operationId: requireOperationId(operationId),
		message: DYNAMIC_TOOL_OUTCOME_UNKNOWN_MESSAGE,
	});
	return responseForEnvelope(envelope, true);
}

/**
 *
 */
function parseResponseText(response: DynamicToolResponse): DynamicToolResponse {
	const parsed = response.success
		? DynamicToolResponseSchema.parse(response)
		: UnknownDynamicToolResponseSchema.parse(response);
	return freezeDeep(parsed);
}

export {
	type DynamicToolEnvelope,
	okResponse,
	refusedResponse,
	approvalRequiredResponse,
	outcomeUnknownResponse,
	parseResponseText,
};
