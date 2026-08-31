import type {
	BrowserApproval,
	BrowserApprovalResponse,
	CodexBrowserModel,
} from "../../../shared/codex-browser-model/index.js";
import type {
	ApprovalFamily,
	CommandApprovalRequest,
	ApprovalRequest,
	ApprovalSettlement,
	SpokenEligibility,
	SpokenEligibilityFacts,
	TerminalApprovalState,
} from "./contract.js";
import { CodexApprovalError } from "./contract.js";
import type { ReverseResponse } from "../../codex-transport/server-requests.js";

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function responseFamilyMatches(family: ApprovalFamily, response: BrowserApprovalResponse): boolean {
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
	response: BrowserApprovalResponse,
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

export function validateBrowserResponse(
	model: CodexBrowserModel,
	request: ApprovalRequest,
	response: BrowserApprovalResponse,
	options: { readonly respectAvailableDecisions?: boolean } = {},
): BrowserApprovalResponse {
	const parsed = model.BrowserApprovalResponseSchema.safeParse(response);
	if (!parsed.success) {
		throw new CodexApprovalError(
			"invalid_response",
			`The ${request.family} approval response does not match the browser contract.`,
			request.requestId,
		);
	}
	if (!responseFamilyMatches(request.family, parsed.data)) {
		throw new CodexApprovalError(
			"invalid_response",
			`The approval response family does not match ${request.family}.`,
			request.requestId,
		);
	}
	if (!decisionAllowed(request, parsed.data, options.respectAvailableDecisions !== false)) {
		throw new CodexApprovalError(
			"invalid_response",
			"The approval decision is not one of the decisions offered by Codex.",
			request.requestId,
		);
	}
	return parsed.data;
}

export function toServerResponse(
	request: ApprovalRequest,
	response: BrowserApprovalResponse,
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
): BrowserApprovalResponse {
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

function safeUrl(value: string): string {
	try {
		const parsed = new URL(value);
		if (parsed.protocol === "http:" || parsed.protocol === "https:") return value;
	} catch {
		// Fall through to the bounded, user-visible refusal.
	}
	throw new CodexApprovalError("unsafe_url", "Only http and https elicitation URLs are supported.");
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

function formFields(schema: unknown): Array<{
	readonly name: string;
	readonly type: "string" | "number" | "integer" | "boolean" | "enum";
	readonly required: boolean;
	readonly secret: boolean;
}> | null {
	if (!isRecord(schema) || !isRecord(schema.properties)) return null;
	const required = new Set(
		Array.isArray(schema.required) && schema.required.every((entry) => typeof entry === "string")
			? schema.required
			: [],
	);
	const fields: Array<{
		readonly name: string;
		readonly type: "string" | "number" | "integer" | "boolean" | "enum";
		readonly required: boolean;
		readonly secret: boolean;
	}> = [];
	for (const [name, definition] of Object.entries(schema.properties)) {
		const type = fieldType(definition);
		if (type === null || name.length === 0 || name.includes("\0")) return null;
		fields.push({
			name,
			type,
			required: required.has(name),
			secret: isRecord(definition) && definition.secret === true,
		});
	}
	return fields;
}

function fileSystemMode(value: RecordValue | null): "read" | "write" | "deny" | null {
	if (value === null) return null;
	if (value.write !== null && value.write !== undefined) return "write";
	if (value.read !== null && value.read !== undefined) return "read";
	if (
		Array.isArray(value.entries) &&
		value.entries.some((entry) => isRecord(entry) && entry.access === "deny")
	)
		return "deny";
	return null;
}

export function toBrowserApproval(
	model: CodexBrowserModel,
	request: ApprovalRequest,
): BrowserApproval {
	const envelope = {
		kind: "approval" as const,
		requestId: request.requestId,
		threadId: request.threadId,
		turnId: request.turnId,
		itemId: request.itemId,
		approvalId: request.approvalId,
		expiresAtMs: request.expiresAtMs,
	};
	let candidate: RecordValue;
	switch (request.family) {
		case "command_execution":
			candidate = {
				...envelope,
				approvalKind: "command_execution",
				reason: request.params.reason ?? null,
				command: request.params.command ?? null,
				cwd: request.params.cwd ?? null,
				availableDecisions: effectiveCommandDecisions(request),
			};
			break;
		case "file_change":
			candidate = {
				...envelope,
				approvalKind: "file_change",
				reason: request.params.reason ?? null,
				grantRoot: request.params.grantRoot ?? null,
				availableDecisions: ["accept", "acceptForSession", "decline", "cancel"],
			};
			break;
		case "user_input":
			candidate = {
				...envelope,
				approvalKind: "user_input",
				questions: request.params.questions,
			};
			break;
		case "elicitation": {
			const url = request.params.mode === "url" ? safeUrl(request.params.url) : null;
			candidate = {
				...envelope,
				approvalKind: "elicitation",
				serverName: request.params.serverName,
				mode: request.params.mode,
				message: request.params.message,
				url,
				fields: request.params.mode === "url" ? null : formFields(request.params.requestedSchema),
			};
			break;
		}
		case "permissions":
			candidate = {
				...envelope,
				approvalKind: "permissions",
				reason: request.params.reason,
				cwd: request.params.cwd,
				network: request.params.permissions.network?.enabled ?? null,
				fileSystem: fileSystemMode(request.params.permissions.fileSystem),
			};
			break;
		case "apply_patch":
			candidate = {
				...envelope,
				approvalKind: "apply_patch",
				reason: request.params.reason,
				grantRoot: request.params.grantRoot,
				fileCount: Object.keys(request.params.fileChanges).length,
			};
			break;
		case "exec_command":
			candidate = {
				...envelope,
				approvalKind: "exec_command",
				reason: request.params.reason,
				command: request.params.command,
				cwd: request.params.cwd,
			};
			break;
	}
	const parsed = model.BrowserApprovalSchema.safeParse(candidate);
	if (!parsed.success) {
		throw new CodexApprovalError(
			"unsupported_schema",
			`The ${request.family} approval cannot be represented safely in the browser contract.`,
			request.requestId,
		);
	}
	return parsed.data;
}

export function spokenEligibility(
	request: ApprovalRequest,
	currentBinding: boolean,
	facts: SpokenEligibilityFacts,
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
