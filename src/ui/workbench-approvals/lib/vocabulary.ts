import type {
	WorkbenchApprovalFamily,
	WorkbenchApprovalPhase,
	WorkbenchDynamicTool,
} from "../contract.js";

export const FAMILY_TITLES = {
	command_execution: "Run a command",
	file_change: "Change files",
	permissions: "Widen permissions",
	apply_patch: "Apply a patch",
	exec_command: "Run a command (legacy request)",
	user_input: "Answer the agent's questions",
	elicitation: "Answer an MCP server",
} as const satisfies Record<WorkbenchApprovalFamily, string>;

export const FAMILY_KICKERS = {
	command_execution: "Command execution approval",
	file_change: "File change approval",
	permissions: "Permissions approval",
	apply_patch: "Legacy apply patch approval",
	exec_command: "Legacy exec command approval",
	user_input: "Tool user input request",
	elicitation: "MCP elicitation request",
} as const satisfies Record<WorkbenchApprovalFamily, string>;

export const DYNAMIC_TITLES = {
	create_thread: "Create a new Codex thread",
	fork_thread: "Fork a Codex thread",
	send_message_to_thread: "Send a message to another Codex thread",
} as const satisfies Record<WorkbenchDynamicTool, string>;

export const DYNAMIC_KICKERS = {
	create_thread: "Dynamic coordination approval",
	fork_thread: "Dynamic coordination approval",
	send_message_to_thread: "Dynamic coordination approval",
} as const satisfies Record<WorkbenchDynamicTool, string>;

export const PHASE_LABELS = {
	staged: "Staged",
	pending: "Waiting for you",
	approved: "Approved",
	declined: "Declined",
	cancelled: "Cancelled",
	expired: "Expired",
	stale: "Stale",
	disconnected: "Disconnected",
	delivered: "Delivered",
	not_delivered: "Not delivered",
	outcome_unknown: "Outcome unknown",
} as const satisfies Record<WorkbenchApprovalPhase, string>;

export const TERMINAL_PHASES = new Set<WorkbenchApprovalPhase>([
	"approved",
	"declined",
	"cancelled",
	"expired",
	"stale",
	"disconnected",
	"delivered",
	"not_delivered",
	"outcome_unknown",
]);

/** The host's own spoken-eligibility vocabulary, said in human words. */
export const SPOKEN_REASONS = {
	eligible: "This is a plain accept or decline, so it may also be answered by voice.",
	not_pending: "Visual only: this request is no longer waiting for a decision.",
	stale_ownership: "Visual only: the request no longer belongs to the current child epoch.",
	secret: "Visual only: this request carries a secret that must never be spoken.",
	multi_question: "Visual only: this request asks more than one question.",
	form: "Visual only: this request needs a form, not a spoken word.",
	url: "Visual only: this request hands over a URL.",
	permission_scope: "Visual only: this request asks for a scoped permission grant.",
	coordinator_blocking: "Visual only: answering this would block the voice coordinator.",
	unsupported_schema: "Visual only: the host could not reduce this request to a spoken effect.",
	broader_grant: "Visual only: one of the offered decisions grants more than this one action.",
	not_binary: "Visual only: this request is not a plain accept or decline.",
} as const;

export const DYNAMIC_SPOKEN_DETAIL =
	"Visual only: a dynamic coordination approval is never spoken-eligible.";

export const NO_RESUME_NOTICE =
	"This approval cannot be resumed. The agent must ask again if it still needs the effect.";

export const IMMUTABLE_EFFECT_NOTICE =
	"The effect and its hash are fixed. Approving sends exactly this effect, or nothing.";

export const TRANSPORT_REFUSALS = {
	approval_not_pending: "This approval is no longer pending for the target it was raised against.",
	dynamic_approval_not_pending:
		"This dynamic approval is no longer pending for the target it was raised against.",
	link_changed: "The workbench moved to another thread link after this decision was offered.",
	link_required: "The decision did not name the workbench target it was composed against.",
	lease_required: "This browser does not hold the workbench command lease.",
	lease_expired: "The workbench command lease expired before the decision was sent.",
	lease_released: "The workbench command lease was released before the decision was sent.",
	not_ready: "The workbench cannot answer approvals in its current state.",
	socket_unavailable: "The workbench lost its connection before the decision was sent.",
	incompatible_contract: "The host answered with a workbench contract this browser cannot read.",
	response_lost: "The host never answered, so the decision's outcome is unknown.",
} as const;

export const GENERIC_REFUSAL = "The host refused this decision.";

export function refusalMessage(code: string): string {
	return code in TRANSPORT_REFUSALS
		? TRANSPORT_REFUSALS[code as keyof typeof TRANSPORT_REFUSALS]
		: GENERIC_REFUSAL;
}

export function spokenDetail(reason: keyof typeof SPOKEN_REASONS): string {
	return SPOKEN_REASONS[reason];
}
