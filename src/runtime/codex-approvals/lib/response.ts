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
import {
	CodexTransportOwnershipError,
	CodexTransportUsageError,
} from "../../codex-transport/errors.js";

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
	return value !== null && typeof value === "object" && !Array.isArray(value);
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

function fieldType(value: unknown): "string" | "number" | "integer" | "boolean" | "enum" | null {
	if (!isRecord(value)) return null;
	if (Array.isArray(value.enum) && value.enum.every((entry) => typeof entry === "string"))
		return "enum";
	if (
		Array.isArray(value.oneOf) &&
		value.oneOf.every((entry) => isRecord(entry) && typeof entry.const === "string")
	)
		return "enum";
	if (value.type === "array" && isRecord(value.items)) {
		if (
			Array.isArray(value.items.enum) &&
			value.items.enum.every((entry) => typeof entry === "string")
		)
			return "enum";
		if (
			Array.isArray(value.items.anyOf) &&
			value.items.anyOf.every((entry) => isRecord(entry) && typeof entry.const === "string")
		)
			return "enum";
	}
	return value.type === "string" ||
		value.type === "number" ||
		value.type === "integer" ||
		value.type === "boolean"
		? value.type
		: null;
}

interface ProjectedElicitationField {
	readonly name: string;
	readonly type: "string" | "number" | "integer" | "boolean" | "enum";
	readonly required: boolean;
	readonly secret: boolean;
	readonly title: string | null;
	readonly description: string | null;
	readonly format: "email" | "uri" | "date" | "date-time" | null;
	readonly minimum: number | null;
	readonly maximum: number | null;
	readonly minLength: number | null;
	readonly maxLength: number | null;
	readonly minimumItems: number | null;
	readonly maximumItems: number | null;
	readonly options: readonly string[] | null;
	readonly defaultValue: unknown;
}

function stringValue(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

function numberValue(value: unknown): number | null {
	return typeof value === "number" ? value : null;
}

function enumOptions(definition: RecordValue): readonly string[] | null {
	if (Array.isArray(definition.enum) && definition.enum.every((entry) => typeof entry === "string"))
		return definition.enum;
	if (Array.isArray(definition.oneOf))
		return definition.oneOf.flatMap((entry) =>
			isRecord(entry) && typeof entry.const === "string" ? [entry.const] : [],
		);
	if (definition.type === "array" && isRecord(definition.items)) {
		if (
			Array.isArray(definition.items.enum) &&
			definition.items.enum.every((entry) => typeof entry === "string")
		)
			return definition.items.enum;
		if (Array.isArray(definition.items.anyOf))
			return definition.items.anyOf.flatMap((entry) =>
				isRecord(entry) && typeof entry.const === "string" ? [entry.const] : [],
			);
	}
	return null;
}

function formFields(schema: unknown): ProjectedElicitationField[] | null {
	if (!isRecord(schema) || !isRecord(schema.properties)) return null;
	const required = new Set(
		Array.isArray(schema.required) && schema.required.every((entry) => typeof entry === "string")
			? schema.required
			: [],
	);
	const fields: ProjectedElicitationField[] = [];
	for (const [name, definition] of Object.entries(schema.properties)) {
		const type = fieldType(definition);
		if (type === null || !isRecord(definition) || name.length === 0 || name.includes("\0"))
			return null;
		const secret = definition.secret === true;
		const format =
			definition.format === "email" ||
			definition.format === "uri" ||
			definition.format === "date" ||
			definition.format === "date-time"
				? definition.format
				: null;
		fields.push({
			name,
			type,
			required: required.has(name),
			secret,
			title: stringValue(definition.title),
			description: stringValue(definition.description),
			format,
			minimum: numberValue(definition.minimum),
			maximum: numberValue(definition.maximum),
			minLength: numberValue(definition.minLength),
			maxLength: numberValue(definition.maxLength),
			minimumItems: numberValue(definition.minItems),
			maximumItems: numberValue(definition.maxItems),
			options: enumOptions(definition),
			defaultValue: secret ? null : (definition.default ?? null),
		});
	}
	return fields;
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
				formFields(request.params.requestedSchema) === null
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
	if (error.outcome === "not_delivered" || error.outcome === "outcome_unknown")
		return error.outcome;
	if (error.accepted === false) return "not_delivered";
	if (error.accepted === true) return "outcome_unknown";
	if (
		error.reason === "backpressure" ||
		error.reason === "frame-too-large" ||
		error.reason === "shutdown" ||
		error.reason === "transport-closed"
	)
		return "not_delivered";
	return "outcome_unknown";
}
