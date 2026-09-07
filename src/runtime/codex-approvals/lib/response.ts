import type {
	ApprovalFamily,
	CommandApprovalRequest,
	ApprovalRequest,
	ApprovalResponse,
	ApprovalSettlement,
	TerminalApprovalState,
} from "@/runtime/codex-approvals/lib/contract";
import { CodexApprovalError } from "@/runtime/codex-approvals/lib/contract";
import type { ReverseResponse } from "@/runtime/codex-transport/server-requests";
import { CodexServerResponseSchema } from "@/runtime/codex-protocol";
import {
	CodexTransportOwnershipError,
	CodexTransportUsageError,
} from "@/runtime/codex-transport/errors";

type RecordValue = Record<string, unknown>;

/**
 * Whether a value is a plain object whose fields can be read by key.
 * @param value - Any value.
 * @returns True for a non-null, non-array object.
 */
function isRecord(value: unknown): value is RecordValue {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** The reverse request each approval family answers, which is what its response is proven by. */
const APPROVAL_METHODS: Readonly<Record<string, string>> = Object.freeze({
	command_execution: "item/commandExecution/requestApproval",
	file_change: "item/fileChange/requestApproval",
	user_input: "item/tool/requestUserInput",
	elicitation: "mcpServer/elicitation/request",
	permissions: "item/permissions/requestApproval",
	apply_patch: "applyPatchApproval",
	exec_command: "execCommandApproval",
});

/**
 * The reverse request one approval family answers, or undefined when the family is not reviewed.
 * @param approvalKind - The family the response claims.
 * @returns The method, or undefined.
 */
function approvalMethodFor(approvalKind: string): string | undefined {
	return Object.hasOwn(APPROVAL_METHODS, approvalKind) ? APPROVAL_METHODS[approvalKind] : undefined;
}

/**
 * Parse one approval response from whatever a caller supplied, proving it against the schema of
 * the reverse request its own family answers. Nothing else in this module trusts a response that
 * did not come through here.
 * @param value - The claimed response.
 * @returns The parsed response.
 * @throws {CodexApprovalError} When the response is malformed or names no reviewed family.
 */
function parseApprovalResponse(value: unknown): ApprovalResponse {
	if (!isRecord(value) || typeof value["approvalKind"] !== "string") {
		throw new CodexApprovalError("invalid_response", "The approval response is malformed.");
	}

	const { approvalKind, ...result } = value;
	const method = approvalMethodFor(approvalKind);
	if (method === undefined) {
		throw new CodexApprovalError(
			"invalid_response",
			"The approval response family is unsupported.",
		);
	}
	const parsed = CodexServerResponseSchema.safeParse({ method, result });
	if (!parsed.success || !("result" in parsed.data)) {
		throw new CodexApprovalError("invalid_response", "The approval response is malformed.");
	}
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the method was looked up from the response's own approvalKind, and the schema for that method has just accepted the result, so the pair is one member of the response union by construction; TypeScript cannot follow that through a keyed lookup
	return { approvalKind, ...parsed.data.result } as ApprovalResponse;
}

/**
 * Whether a response answers the family it claims to. Family and response kind are the same
 * seven names, so this is their equality; it is named because that correspondence is the contract,
 * not a coincidence.
 * @param family - The request's family.
 * @param response - The parsed response.
 * @returns True when the response belongs to the family.
 */
function responseFamilyMatches(family: ApprovalFamily, response: ApprovalResponse): boolean {
	return family === response.approvalKind;
}

/**
 * Whether two decisions are the same value, compared structurally because a decision may be an
 * object rather than a bare string.
 * @param left - One decision.
 * @param right - The other decision.
 * @returns True when they are the same decision.
 */
function decisionEqual(left: unknown, right: unknown): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

type CommandDecision = NonNullable<CommandApprovalRequest["params"]["availableDecisions"]>[number];

const DEFAULT_COMMAND_DECISIONS: readonly CommandDecision[] = ["accept", "decline", "cancel"];

/**
 * The decisions a command approval actually offers: what Codex advertised, or the reviewed
 * default when it advertised none.
 * @param request - The command approval request.
 * @returns The offered decisions.
 */
function effectiveCommandDecisions(request: CommandApprovalRequest): readonly CommandDecision[] {
	const available = request.params.availableDecisions;
	return available === undefined || available === null ? DEFAULT_COMMAND_DECISIONS : available;
}

/**
 * Whether a response's decision is one the request actually offered. Only command approvals
 * advertise a decision list; every other family is decided by its own schema.
 * @param request - The approval request.
 * @param response - The parsed response.
 * @param respectAvailableDecisions - Whether the advertised list is enforced.
 * @returns True when the decision is allowed.
 */
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

/** How strictly a response is validated against the decisions its request offered. */
interface ApprovalValidationOptions {
	/** Enforce the list of decisions Codex advertised; on by default. */
	readonly respectAvailableDecisions?: boolean;
}

/**
 * Prove a response answers this request: the right family, and a decision the request offered.
 * @param request - The approval request.
 * @param response - The parsed response.
 * @param options - Whether to enforce the list of decisions Codex advertised.
 * @returns The same response.
 * @throws {CodexApprovalError} When the family or decision does not match.
 */
function validateApprovalResponse(
	request: ApprovalRequest,
	response: ApprovalResponse,
	options: ApprovalValidationOptions = {},
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

/**
 * The reverse response for a family whose answer is a single decision.
 * @param request - The approval request, for the refusal.
 * @param response - The parsed response.
 * @returns The reverse response.
 * @throws {CodexApprovalError} When the response does not answer this family.
 */
function decisionServerResponse(
	request: ApprovalRequest,
	response: ApprovalResponse,
): ReverseResponse {
	if (
		response.approvalKind !== "command_execution" &&
		response.approvalKind !== "file_change" &&
		response.approvalKind !== "apply_patch" &&
		response.approvalKind !== "exec_command"
	) {
		throw familyError(request);
	}
	return { result: { decision: response.decision } };
}

/**
 * The reverse response for an elicitation, which answers with an action and its content.
 * @param request - The approval request, for the refusal.
 * @param response - The parsed response.
 * @returns The reverse response.
 * @throws {CodexApprovalError} When the response does not answer this family.
 */
function elicitationServerResponse(
	request: ApprovalRequest,
	response: ApprovalResponse,
): ReverseResponse {
	if (response.approvalKind !== "elicitation") {
		throw familyError(request);
	}
	return {
		result: {
			action: response.action,
			content: response.content,
			["_meta"]: response["_meta"],
		},
	};
}

/**
 * The reverse response for a permissions approval, which answers with the granted permissions and
 * their scope. The strict auto-review flag is only sent when the response carried one.
 * @param request - The approval request, for the refusal.
 * @param response - The parsed response.
 * @returns The reverse response.
 * @throws {CodexApprovalError} When the response does not answer this family.
 */
function permissionsServerResponse(
	request: ApprovalRequest,
	response: ApprovalResponse,
): ReverseResponse {
	if (response.approvalKind !== "permissions") {
		throw familyError(request);
	}
	return {
		result: {
			permissions: response.permissions,
			scope: response.scope,
			...(response.strictAutoReview === undefined
				? {}
				: { strictAutoReview: response.strictAutoReview }),
		},
	};
}

/**
 * The reverse response for a user-input request, which answers with the person's answers.
 * @param request - The approval request, for the refusal.
 * @param response - The parsed response.
 * @returns The reverse response.
 * @throws {CodexApprovalError} When the response does not answer this family.
 */
function userInputServerResponse(
	request: ApprovalRequest,
	response: ApprovalResponse,
): ReverseResponse {
	if (response.approvalKind !== "user_input") {
		throw familyError(request);
	}
	return { result: { answers: response.answers } };
}

/**
 * The reverse response Codex is sent for one answered approval. The shape is decided by the
 * reverse request that was made, not by the response, so a response that does not answer that
 * request is refused rather than reshaped.
 * @param request - The approval request being answered.
 * @param response - The parsed response.
 * @returns The reverse response.
 * @throws {CodexApprovalError} When the response does not answer the request.
 */
function toServerResponse(request: ApprovalRequest, response: ApprovalResponse): ReverseResponse {
	if (request.method === "item/tool/requestUserInput") {
		return userInputServerResponse(request, response);
	}
	if (request.method === "mcpServer/elicitation/request") {
		return elicitationServerResponse(request, response);
	}
	if (request.method === "item/permissions/requestApproval") {
		return permissionsServerResponse(request, response);
	}
	return decisionServerResponse(request, response);
}

/**
 * The refusal for a response that does not answer its request's family.
 * @param request - The approval request.
 * @returns The error to throw.
 */
function familyError(request: ApprovalRequest): CodexApprovalError {
	return new CodexApprovalError(
		"invalid_response",
		`The approval response does not match ${request.family}.`,
		request.requestId,
	);
}

/**
 * The answer Codex is sent when nobody answered: the narrowest one each family has. Every family
 * declines or cancels rather than granting anything, because an unanswered approval must never
 * become permission.
 * @param request - The approval request.
 * @param state - Whether the approval was settled without an answer or expired.
 * @returns The fallback response.
 */
function fallbackResponse(
	request: ApprovalRequest,
	state: TerminalApprovalState,
): ApprovalResponse {
	if (request.family === "file_change") {
		return { approvalKind: "file_change", decision: state === "settled" ? "decline" : "cancel" };
	}
	if (request.family === "apply_patch" || request.family === "exec_command") {
		return {
			approvalKind: request.family,
			decision: state === "expired" ? "timed_out" : "abort",
		};
	}
	return unansweredFallback(request.family);
}

/**
 * The fallback for the families whose narrowest answer does not depend on how the approval ended.
 * @param family - The approval family.
 * @returns The fallback response.
 */
function unansweredFallback(
	family: Exclude<ApprovalFamily, "file_change" | "apply_patch" | "exec_command">,
): ApprovalResponse {
	if (family === "user_input") {
		return { approvalKind: "user_input", answers: {} };
	}
	if (family === "elicitation") {
		return { approvalKind: "elicitation", action: "cancel", content: null, _meta: null };
	}
	if (family === "permissions") {
		return { approvalKind: "permissions", permissions: {}, scope: "turn" };
	}
	return { approvalKind: "command_execution", decision: "cancel" };
}

/**
 * The settlement for an approval whose answer could not be delivered, keeping what it proved
 * about delivery so a caller never treats an undelivered answer as given.
 * @param request - The approval request.
 * @param state - The terminal state the approval reached.
 * @param outcome - What the failure proved about delivery.
 * @param reason - Why it failed.
 * @returns The frozen settlement.
 */
function failedSettlement(
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

/** Transport reasons that prove the answer never went out. */
const UNDELIVERED_TRANSPORT_REASONS: ReadonlySet<unknown> = new Set([
	"backpressure",
	"frame-too-large",
	"shutdown",
	"transport-closed",
]);

/**
 * What a thrown value says about a write that was attempted: its own asserted outcome, whether
 * the transport accepted it, or a transport reason that proves it never went out.
 * @param error - The thrown value.
 * @returns The outcome, or null when the value says nothing.
 */
function assertedFailureOutcome(error: RecordValue): "not_delivered" | "outcome_unknown" | null {
	if (error["outcome"] === "not_delivered" || error["outcome"] === "outcome_unknown") {
		return error["outcome"];
	}
	if (error["accepted"] === false) {
		return "not_delivered";
	}
	if (error["accepted"] === true) {
		return "outcome_unknown";
	}
	return UNDELIVERED_TRANSPORT_REASONS.has(error["reason"]) ? "not_delivered" : null;
}

/**
 * What a failed response proved about delivery. Only a failure that proves the answer never left
 * Archboard is reported as not delivered; anything else leaves the outcome unknown, because Codex
 * may already be acting on the answer.
 * @param error - The thrown value.
 * @param writeAttempted - Whether the write was attempted at all.
 * @returns The settled outcome.
 */
function classifyResponseFailure(
	error: unknown,
	writeAttempted = true,
): "not_delivered" | "outcome_unknown" {
	if (!writeAttempted || isRefusedByTransport(error)) {
		return "not_delivered";
	}
	return isRecord(error) ? (assertedFailureOutcome(error) ?? "outcome_unknown") : "outcome_unknown";
}

/**
 * Whether the transport refused the write outright, which proves nothing was sent.
 * @param error - The thrown value.
 * @returns True when the transport refused it.
 */
function isRefusedByTransport(error: unknown): boolean {
	return error instanceof CodexTransportOwnershipError || error instanceof CodexTransportUsageError;
}

export { effectiveCommandDecisions, isRecord, type RecordValue };
export {
	toSpokenEffectPresentation,
	spokenEligibility,
} from "@/runtime/codex-approvals/lib/spoken-presentation";
export {
	parseApprovalResponse,
	validateApprovalResponse,
	toServerResponse,
	fallbackResponse,
	failedSettlement,
	classifyResponseFailure,
};
