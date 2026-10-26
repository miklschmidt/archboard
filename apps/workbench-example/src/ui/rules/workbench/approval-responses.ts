import type {
	VoiceApproval as ExampleApproval,
	VoiceApprovalResponse as ApprovalResponse,
} from "@archboard/codex-realtime-voice/browser";
interface ApprovalChoice {
	readonly label: string;
	readonly response: ApprovalResponse;
}
const DECISION_LABELS: Readonly<Record<string, string>> = {
	accept: "Allow once",
	acceptForSession: "Allow for this session",
	decline: "Decline",
	cancel: "Cancel",
};

/**
 * Offer explicit decisions that this example can present clearly.
 * @param approval The request that the user sees.
 * @returns The operation result or its completion.
 */
function approvalChoices(approval: ExampleApproval): readonly ApprovalChoice[] {
	if (approval.approvalKind === "command_execution")
		return approval.availableDecisions.flatMap((decision) =>
			typeof decision === "string" && DECISION_LABELS[decision] !== undefined
				? [
						{
							label: DECISION_LABELS[decision],
							response: { approvalKind: "command_execution", decision },
						},
					]
				: [],
		);
	if (approval.approvalKind === "file_change")
		return approval.availableDecisions.flatMap((decision) =>
			DECISION_LABELS[decision] !== undefined
				? [
						{
							label: DECISION_LABELS[decision],
							response: { approvalKind: "file_change", decision },
						},
					]
				: [],
		);
	return otherChoices(approval);
}

/**
 * Offer a bounded response for the remaining protocol families.
 * @param approval The request that the user sees.
 * @returns The operation result or its completion.
 */
function otherChoices(approval: ExampleApproval): readonly ApprovalChoice[] {
	if (approval.approvalKind === "apply_patch" || approval.approvalKind === "exec_command")
		return [
			{
				label: "Allow once",
				response: { approvalKind: approval.approvalKind, decision: "approved" },
			},
			{
				label: "Decline",
				response: {
					approvalKind: approval.approvalKind,
					decision: { denied: { rejection: "Declined in the workbench." } },
				},
			},
		];
	if (approval.approvalKind === "permissions")
		return [
			{
				label: "Decline access",
				response: { approvalKind: "permissions", permissions: {}, scope: "turn" },
			},
		];
	if (approval.approvalKind === "elicitation")
		return [
			{
				label: "Decline request",
				response: { approvalKind: "elicitation", action: "decline", content: null, _meta: null },
			},
		];
	return [];
}

export { approvalChoices, type ExampleApproval, type ApprovalResponse };
