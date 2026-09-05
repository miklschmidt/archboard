// Codex approvals: the seven ordinary families and the three dynamic
// coordination effects as cards, the decisions the model allows, the
// reviewed answers a decision reads, dispatch against the captured target,
// and unknown-outcome recovery. Presentation lives in `@/ui/workbench`; this
// module owns the logic, the state and the projection.

export { resolveApprovalChoice, type ResolvedChoice } from "@/ui/workbench-approvals/lib/choice";
export {
	createWorkbenchApprovalsController,
	type WorkbenchApprovalsController,
	type WorkbenchApprovalsControllerOptions,
	type WorkbenchApprovalsDecisionState,
} from "@/ui/workbench-approvals/lib/controller";
export { approvalFields } from "@/ui/workbench-approvals/lib/fields";
export {
	approvalDecisionSignature,
	approvalFocusReturn,
	type ApprovalFocusReturn,
} from "@/ui/workbench-approvals/lib/focus";
export {
	EMPTY_APPROVAL_FORM,
	applyApprovalFormEvent,
	initialApprovalForm,
} from "@/ui/workbench-approvals/lib/form";
export { validateApprovalForm } from "@/ui/workbench-approvals/lib/form-validation";
export { isGenuineBinaryApproval } from "@/ui/workbench-approvals/lib/offers";
export {
	approvalKicker,
	approvalTarget,
	projectWorkbenchApprovals,
	workbenchApprovalsInput,
} from "@/ui/workbench-approvals/lib/projection";
export { dynamicApprovalDraft, ordinaryApprovalDraft } from "@/ui/workbench-approvals/lib/response";
export { safeHttpUrl } from "@/ui/workbench-approvals/lib/safe-url";
export { submitApprovalDecision } from "@/ui/workbench-approvals/lib/submit";
