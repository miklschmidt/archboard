import type {
	ApprovalFamily,
	CommandApprovalRequest,
	ApprovalRequest,
	ApprovalResponse,
	ApprovalSettlement,
	SpokenApprovalEffectPresentation,
	SpokenEligibility,
	SpokenEligibilityFacts,
	TerminalApprovalState,
} from "./contract.js";
import { CodexApprovalError } from "./contract.js";
import type { ReverseResponse } from "../../codex-transport/server-requests.js";
import { CodexServerResponseSchema } from "../../codex-protocol/index.js";
import {
	CodexTransportOwnershipError,
	CodexTransportUsageError,
} from "../../codex-transport/errors.js";

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseApprovalResponse(value: unknown): ApprovalResponse {
	if (!isRecord(value) || typeof value["approvalKind"] !== "string")
		throw new CodexApprovalError("invalid_response", "The approval response is malformed.");

	const { approvalKind, ...result } = value;
	const method = (() => {
		switch (approvalKind) {
			case "command_execution":
				return "item/commandExecution/requestApproval";
			case "file_change":
				return "item/fileChange/requestApproval";
			case "user_input":
				return "item/tool/requestUserInput";
			case "elicitation":
				return "mcpServer/elicitation/request";
			case "permissions":
				return "item/permissions/requestApproval";
			case "apply_patch":
				return "applyPatchApproval";
			case "exec_command":
				return "execCommandApproval";
			default:
				throw new CodexApprovalError(
					"invalid_response",
					"The approval response family is unsupported.",
				);
		}
	})();
	const parsed = CodexServerResponseSchema.safeParse({ method, result });
	if (!parsed.success || !("result" in parsed.data))
		throw new CodexApprovalError("invalid_response", "The approval response is malformed.");
	return { approvalKind, ...parsed.data.result } as ApprovalResponse;
}

function responseFamilyMatches(family: ApprovalFamily, response: ApprovalResponse): boolean {
	return (
		(family === "command_execution" && response.approvalKind === "command_execution") ||
		(family === "file_change" && response.approvalKind === "file_change") ||
		(family === "user_input" && response.approvalKind === "user_input") ||
		(family === "elicitation" && response.approvalKind === "elicitation") ||
		(family === "permissions" && response.approvalKind === "permissions") ||
		(family === "apply_patch" && response.approvalKind === "apply_patch") ||
		(family === "exec_command" && response.approvalKind === "exec_command")
	);
}

function decisionEqual(left: unknown, right: unknown): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

type CommandDecision = NonNullable<CommandApprovalRequest["params"]["availableDecisions"]>[number];

const DEFAULT_COMMAND_DECISIONS: readonly CommandDecision[] = ["accept", "decline", "cancel"];

function effectiveCommandDecisions(request: CommandApprovalRequest): readonly CommandDecision[] {
	const available = request.params.availableDecisions;
	return available === undefined || available === null ? DEFAULT_COMMAND_DECISIONS : available;
}

function decisionAllowed(
	request: ApprovalRequest,
	response: ApprovalResponse,
	respectAvailableDecisions: boolean,
): boolean {
	if (
		respectAvailableDecisions &&
		request.family === "command_execution" &&
		response.approvalKind === "command_execution"
	) {
		return effectiveCommandDecisions(request).some((decision) =>
			decisionEqual(decision, response.decision),
		);
	}
	return true;
}

export function validateApprovalResponse(
	request: ApprovalRequest,
	response: ApprovalResponse,
	options: { readonly respectAvailableDecisions?: boolean } = {},
): ApprovalResponse {
	if (!responseFamilyMatches(request.family, response)) {
		throw new CodexApprovalError(
			"invalid_response",
			`The approval response family does not match ${request.family}.`,
			request.requestId,
		);
	}
	if (!decisionAllowed(request, response, options.respectAvailableDecisions !== false)) {
		throw new CodexApprovalError(
			"invalid_response",
			"The approval decision is not one of the decisions offered by Codex.",
			request.requestId,
		);
	}
	return response;
}

export function toServerResponse(
	request: ApprovalRequest,
	response: ApprovalResponse,
): ReverseResponse {
	switch (request.method) {
		case "item/commandExecution/requestApproval":
			if (response.approvalKind !== "command_execution") throw familyError(request);
			return { result: { decision: response.decision } };
		case "item/fileChange/requestApproval":
			if (response.approvalKind !== "file_change") throw familyError(request);
			return { result: { decision: response.decision } };
		case "item/tool/requestUserInput":
			if (response.approvalKind !== "user_input") throw familyError(request);
			return { result: { answers: response.answers } };
		case "mcpServer/elicitation/request":
			if (response.approvalKind !== "elicitation") throw familyError(request);
			return {
				result: {
					action: response.action,
					content: response.content,
					["_meta"]: response["_meta"],
				},
			};
		case "item/permissions/requestApproval":
			if (response.approvalKind !== "permissions") throw familyError(request);
			return {
				result: {
					permissions: response.permissions,
					scope: response.scope,
					...(response.strictAutoReview === undefined
						? {}
						: { strictAutoReview: response.strictAutoReview }),
				},
			};
		case "applyPatchApproval":
			if (response.approvalKind !== "apply_patch") throw familyError(request);
			return { result: { decision: response.decision } };
		case "execCommandApproval":
			if (response.approvalKind !== "exec_command") throw familyError(request);
			return { result: { decision: response.decision } };
	}
}

function familyError(request: ApprovalRequest): CodexApprovalError {
	return new CodexApprovalError(
		"invalid_response",
		`The approval response does not match ${request.family}.`,
		request.requestId,
	);
}

export function fallbackResponse(
	request: ApprovalRequest,
	state: TerminalApprovalState,
): ApprovalResponse {
	switch (request.family) {
		case "command_execution":
			return { approvalKind: "command_execution", decision: "cancel" };
		case "file_change":
			return { approvalKind: "file_change", decision: state === "settled" ? "decline" : "cancel" };
		case "user_input":
			return { approvalKind: "user_input", answers: {} };
		case "elicitation":
			return { approvalKind: "elicitation", action: "cancel", content: null, _meta: null };
		case "permissions":
			return { approvalKind: "permissions", permissions: {}, scope: "turn" };
		case "apply_patch":
			return {
				approvalKind: "apply_patch",
				decision: state === "expired" ? "timed_out" : "abort",
			};
		case "exec_command":
			return {
				approvalKind: "exec_command",
				decision: state === "expired" ? "timed_out" : "abort",
			};
	}
}

function supportsSpokenFormSchema(schema: unknown): boolean {
	if (!isRecord(schema) || !isRecord(schema["properties"])) return false;
	return Object.entries(schema["properties"]).every(([name, definition]) => {
		if (name.length === 0 || name.includes("\0") || !isRecord(definition)) return false;
		if (["string", "number", "integer", "boolean"].includes(String(definition["type"]))) return true;
		if (Array.isArray(definition["enum"]))
			return definition["enum"].every((entry) => typeof entry === "string");
		if (Array.isArray(definition["oneOf"]))
			return definition["oneOf"].every((entry) => isRecord(entry) && typeof entry["const"] === "string");
		if (definition["type"] !== "array" || !isRecord(definition["items"])) return false;
		if (Array.isArray(definition["items"]["enum"]))
			return definition["items"]["enum"].every((entry) => typeof entry === "string");
		return (
			Array.isArray(definition["items"]["anyOf"]) &&
			definition["items"]["anyOf"].every((entry) => isRecord(entry) && typeof entry["const"] === "string")
		);
	});
}

function spokenText(value: unknown): string | null {
	if (typeof value !== "string") return null;
	if (value.length === 0 || value.length > 256) return null;
	if (value.includes("\r") || value.includes("\n")) return null;
	return value;
}

function spokenCommandEffectSummary(request: CommandApprovalRequest): string {
	if (request.params.command === undefined || request.params.command === null)
		throw new CodexApprovalError(
			"unsupported_schema",
			"The command approval has no executable command for spoken presentation.",
			request.requestId,
		);
	const command = spokenText(request.params.command);
	const cwd = spokenText(request.params.cwd);
	if (command === null || cwd === null)
		throw new CodexApprovalError(
			"unsupported_schema",
			"The command approval has no safe one-line executable effect presentation.",
			request.requestId,
		);
	if (request.params.environmentId !== undefined && request.params.environmentId !== null)
		throw new CodexApprovalError(
			"unsupported_schema",
			"The command approval targets an undisclosed execution environment.",
			request.requestId,
		);
	if (
		request.params.networkApprovalContext !== undefined &&
		request.params.networkApprovalContext !== null
	)
		throw new CodexApprovalError(
			"unsupported_schema",
			"The command approval includes an undisclosed network effect.",
			request.requestId,
		);
	const summary = `Run ${command} in ${cwd}`;
	const bounded = spokenText(summary);
	if (bounded === null)
		throw new CodexApprovalError(
			"unsupported_schema",
			"The command approval has no safe one-line spoken effect presentation.",
			request.requestId,
		);
	return bounded;
}

export function toSpokenEffectPresentation(
	request: ApprovalRequest,
): SpokenApprovalEffectPresentation {
	if (request.family !== "command_execution")
		throw new CodexApprovalError(
			"unsupported_request",
			"Only command approvals have a spoken effect presentation.",
			request.requestId,
		);
	return Object.freeze({
		requestId: request.requestId,
		family: request.family,
		child: request.child,
		epoch: request.epoch,
		threadId: request.threadId,
		turnId: request.turnId,
		itemId: request.itemId,
		approvalId: request.approvalId,
		binding: request.binding,
		effectSummary: spokenCommandEffectSummary(request),
	});
}

export function spokenEligibility(
	request: ApprovalRequest,
	currentBinding: boolean,
	facts: SpokenEligibilityFacts,
	effectPresentation: SpokenApprovalEffectPresentation | null,
): SpokenEligibility {
	if (
		request.family === "user_input" &&
		request.params.questions.some((question) => question.isSecret)
	)
		return { eligible: false, reason: "secret" };
	if (facts.secret === true) return { eligible: false, reason: "secret" };
	if (facts.coordinatorBlocking === true)
		return { eligible: false, reason: "coordinator_blocking" };
	if (facts.unsupportedSchema === true) return { eligible: false, reason: "unsupported_schema" };
	if (facts.broaderGrant === true) return { eligible: false, reason: "broader_grant" };
	if (request.family === "command_execution" && effectPresentation === null)
		return { eligible: false, reason: "unsupported_schema" };
	if (!currentBinding) return { eligible: false, reason: "stale_ownership" };

	switch (request.family) {
		case "command_execution": {
			if (request.params.kind !== "command") return { eligible: false, reason: "not_binary" };
			const available = effectiveCommandDecisions(request);
			if (
				request.params.additionalPermissions !== undefined &&
				request.params.additionalPermissions !== null
			)
				return { eligible: false, reason: "broader_grant" };
			if (
				(request.params.proposedExecpolicyAmendment?.length ?? 0) > 0 ||
				(request.params.proposedNetworkPolicyAmendments?.length ?? 0) > 0
			)
				return { eligible: false, reason: "broader_grant" };
			if (available.length === 2 && available.includes("accept") && available.includes("decline"))
				return { eligible: true, reason: "eligible" };
			return { eligible: false, reason: "broader_grant" };
		}
		case "file_change":
			return { eligible: false, reason: "broader_grant" };
		case "user_input":
			if (request.params.isBlocking) return { eligible: false, reason: "coordinator_blocking" };
			if (request.params.questions.length !== 1)
				return { eligible: false, reason: "multi_question" };
			return { eligible: false, reason: "not_binary" };
		case "elicitation":
			if (
				request.params.mode === "openai/form" &&
				!supportsSpokenFormSchema(request.params.requestedSchema)
			)
				return { eligible: false, reason: "unsupported_schema" };
			return {
				eligible: false,
				reason: request.params.mode === "url" ? "url" : "form",
			};
		case "permissions":
			return { eligible: false, reason: "permission_scope" };
		case "apply_patch":
		case "exec_command":
			return { eligible: false, reason: "not_binary" };
	}
}

export function failedSettlement(
	request: ApprovalRequest,
	state: TerminalApprovalState,
	outcome: "not_delivered" | "outcome_unknown",
	reason: string,
): ApprovalSettlement {
	return Object.freeze({
		requestId: request.requestId,
		family: request.family,
		state,
		outcome,
		reason,
	});
}

export function classifyResponseFailure(
	error: unknown,
	writeAttempted = true,
): "not_delivered" | "outcome_unknown" {
	if (!writeAttempted) return "not_delivered";
	if (error instanceof CodexTransportOwnershipError || error instanceof CodexTransportUsageError)
		return "not_delivered";
	if (!isRecord(error)) return "outcome_unknown";
	if (error["outcome"] === "not_delivered" || error["outcome"] === "outcome_unknown")
		return error["outcome"];
	if (error["accepted"] === false) return "not_delivered";
	if (error["accepted"] === true) return "outcome_unknown";
	if (
		error["reason"] === "backpressure" ||
		error["reason"] === "frame-too-large" ||
		error["reason"] === "shutdown" ||
		error["reason"] === "transport-closed"
	)
		return "not_delivered";
	return "outcome_unknown";
}
