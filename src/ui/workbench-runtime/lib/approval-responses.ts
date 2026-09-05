// The wire response one approval choice becomes. The presentation offers only
// what the model allows; this is where a chosen decision is spelled in the
// app-server method's own response shape. A choice that does not fit the
// approval's family yields null, never a guessed response.

import type { BrowserApproval } from "@/shared/codex-browser-model";
import type { ApprovalChoice } from "@/ui/workbench/contracts";
import type { BrowserApprovalResponse } from "@/ui/workbench-transport";

const DEFAULT_DECLINE_REASON = "Declined at the Archboard workbench.";

type Approval<Kind extends BrowserApproval["approvalKind"]> = Extract<
	BrowserApproval,
	{ readonly approvalKind: Kind }
>;

/**
 * The response to a question approval.
 * @param choice The choice.
 * @returns The response, or null.
 */
function userInputResponse(choice: ApprovalChoice): BrowserApprovalResponse | null {
	if (choice.kind === "decline") {
		return { approvalKind: "user_input", answers: {} };
	}
	if (choice.kind !== "answer") {
		return null;
	}
	return {
		approvalKind: "user_input",
		answers: { [choice.questionId]: { answers: [choice.answer] } },
	};
}

/**
 * The response to an elicitation.
 * @param choice The choice.
 * @returns The response, or null.
 */
function elicitationResponse(choice: ApprovalChoice): BrowserApprovalResponse | null {
	if (choice.kind === "decline") {
		return { approvalKind: "elicitation", action: "decline", content: null, _meta: null };
	}
	return choice.kind === "approve"
		? { approvalKind: "elicitation", action: "accept", content: null, _meta: null }
		: null;
}

/**
 * The response to a permissions request: the requested network grant on
 * approve, nothing on decline.
 * @param approval The approval.
 * @param choice The choice.
 * @returns The response, or null.
 */
function permissionsResponse(
	approval: Approval<"permissions">,
	choice: ApprovalChoice,
): BrowserApprovalResponse | null {
	if (choice.kind === "decline") {
		return { approvalKind: "permissions", permissions: {}, scope: "turn" };
	}
	if (choice.kind !== "approve") {
		return null;
	}
	const network = approval.requestedScope.network === true;
	return {
		approvalKind: "permissions",
		permissions: network ? { network: { enabled: true } } : {},
		scope: "turn",
	};
}

/**
 * The review decision of an exec or patch approval.
 * @param choice The choice.
 * @returns The decision, or null.
 */
function reviewDecision(
	choice: ApprovalChoice,
): "approved" | { readonly denied: { readonly rejection: string } } | null {
	if (choice.kind === "approve") {
		return "approved";
	}
	return choice.kind === "decline" ? { denied: { rejection: DEFAULT_DECLINE_REASON } } : null;
}

/**
 * The response to an exec or patch approval on the older approval methods.
 * @param kind The approval family.
 * @param choice The choice.
 * @returns The response, or null.
 */
function reviewResponse(
	kind: "apply_patch" | "exec_command",
	choice: ApprovalChoice,
): BrowserApprovalResponse | null {
	const decision = reviewDecision(choice);
	if (decision === null) {
		return null;
	}
	return kind === "apply_patch"
		? { approvalKind: "apply_patch", decision }
		: { approvalKind: "exec_command", decision };
}

/**
 * The response of a decision the model listed for a command or file change.
 * @param choice The choice.
 * @returns The response, or null.
 */
function decisionResponse(choice: ApprovalChoice): BrowserApprovalResponse | null {
	if (choice.kind === "command_decision") {
		return { approvalKind: "command_execution", decision: choice.decision };
	}
	return choice.kind === "file_change_decision"
		? { approvalKind: "file_change", decision: choice.decision }
		: null;
}

/**
 * The response one choice makes on one approval.
 * @param approval The approval.
 * @param choice The choice.
 * @returns The response, or null when the choice does not fit the family.
 */
function approvalResponse(
	approval: BrowserApproval,
	choice: ApprovalChoice,
): BrowserApprovalResponse | null {
	switch (approval.approvalKind) {
		case "command_execution":
		case "file_change":
			return decisionResponse(choice);
		case "user_input":
			return userInputResponse(choice);
		case "elicitation":
			return elicitationResponse(choice);
		case "permissions":
			return permissionsResponse(approval, choice);
		default:
			return reviewResponse(approval.approvalKind, choice);
	}
}

export { approvalResponse };
