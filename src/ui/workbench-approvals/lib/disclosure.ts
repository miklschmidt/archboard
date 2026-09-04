import { safeHttpUrl } from "../../workbench-timeline/index.js";
import type {
	BrowserApproval,
	BrowserDynamicApproval,
} from "../../../shared/codex-browser-model/index.js";
import type { WorkbenchApprovalDisclosure, WorkbenchApprovalLink } from "../contract.js";

type Elicitation = Extract<BrowserApproval, { readonly approvalKind: "elicitation" }>;

export const NO_TURN = "The host published no turn identity for this request.";
export const NO_ITEM = "The host published no item identity for this request.";
export const NO_APPROVAL_ID = "The host issued no ApprovalId for this request.";
export const NO_LINK = "The host published no link presentation for this request.";
export const NO_REASON = "The host published no reason.";
export const NO_COMMAND = "The host did not publish the command text.";
export const NO_SAFE_URL =
	"The host published no safe http or https URL, so nothing here can be opened.";
export const NO_FIELDS =
	"The host published no reviewed fields for this form, so it cannot be answered here.";
export const SECRET_NOTICE =
	"A secret answer is never shown back, never defaulted, and never spoken.";
export const FILE_ACCESS_NOTICE =
	"The host published which file-access modes were asked for but no paths. Archboard never invents a path list, so only network access, grant scope, and strict auto review can be granted here.";

function row(label: string, value: string, technical = false): WorkbenchApprovalDisclosure {
	return Object.freeze({ label, value, technical });
}

export function timestampText(value: number): string {
	return new Date(value).toISOString();
}

export function ordinaryIdentityRows(
	approval: BrowserApproval,
): readonly WorkbenchApprovalDisclosure[] {
	return Object.freeze([
		row("Request id", approval.requestId, true),
		row("Thread", approval.threadId, true),
		approval.turnId === null ? row("Turn", NO_TURN) : row("Turn", approval.turnId, true),
		approval.itemId === null ? row("Item", NO_ITEM) : row("Item", approval.itemId, true),
		approval.approvalId === null
			? row("Approval id", NO_APPROVAL_ID)
			: row("Approval id", approval.approvalId, true),
		row("Expires", timestampText(approval.expiresAtMs), true),
	]);
}

/** The broker's own identity for this request, rendered on every ordinary card. */
export function brokerRows(approval: BrowserApproval): readonly WorkbenchApprovalDisclosure[] {
	const binding = approval.binding;
	return Object.freeze([
		row("Broker child", binding.child, true),
		row("Broker child epoch", binding.epoch, true),
		binding.link === null ? row("Broker link", NO_LINK) : row("Broker link", binding.link, true),
		row("Broker target", binding.target),
		row("Broker effect", binding.effect),
	]);
}

function reasonRow(reason: string | null | undefined): WorkbenchApprovalDisclosure {
	return row("Reason", reason ?? NO_REASON);
}

function permissionScopeText(value: boolean | null): string {
	if (value === null) return "The agent did not ask about network access.";
	return value ? "Requested" : "Requested to stay closed";
}

function elicitationRows(approval: Elicitation): readonly WorkbenchApprovalDisclosure[] {
	return [
		row("MCP server", approval.serverName, true),
		row("Mode", approval.mode, true),
		row("Message", approval.message),
		approval.url === null || safeHttpUrl(approval.url) === null
			? row("URL", NO_SAFE_URL)
			: row("URL", approval.url, true),
	];
}

export function ordinaryEffectRows(
	approval: BrowserApproval,
): readonly WorkbenchApprovalDisclosure[] {
	switch (approval.approvalKind) {
		case "command_execution":
			return Object.freeze([
				approval.command === null
					? row("Command", NO_COMMAND)
					: row("Command", approval.command, true),
				reasonRow(approval.reason),
			]);
		case "file_change":
			return Object.freeze([reasonRow(approval.reason)]);
		case "permissions":
			return Object.freeze([
				row("Requested network access", permissionScopeText(approval.requestedScope.network)),
				row(
					"Requested file access",
					approval.requestedScope.fileAccess.length === 0
						? "None requested."
						: approval.requestedScope.fileAccess.join(", "),
				),
				reasonRow(approval.reason),
			]);
		case "apply_patch":
			return Object.freeze([
				row("Files changed", String(approval.fileCount), true),
				reasonRow(approval.reason),
			]);
		case "exec_command":
			return Object.freeze([
				row("Command", approval.command.join(" "), true),
				reasonRow(approval.reason),
			]);
		case "user_input":
			return Object.freeze([
				row("Questions", String(approval.questions.length), true),
				row(
					"Secret answers",
					approval.questions.some((question) => question.isSecret)
						? "One or more answers are secret."
						: "None.",
				),
			]);
		case "elicitation":
			return Object.freeze(elicitationRows(approval));
	}
}

export function ordinaryLinks(approval: BrowserApproval): readonly WorkbenchApprovalLink[] {
	if (approval.approvalKind !== "elicitation" || approval.url === null) return Object.freeze([]);
	const href = safeHttpUrl(approval.url);
	return href === null
		? Object.freeze([])
		: Object.freeze([Object.freeze({ label: approval.url, href })]);
}

export function ordinaryNotices(approval: BrowserApproval): readonly string[] {
	const notices: string[] = [];
	if (approval.approvalKind === "command_execution" && approval.command === null)
		notices.push(NO_COMMAND);
	if (approval.approvalKind === "permissions" && approval.requestedScope.fileAccess.length > 0)
		notices.push(FILE_ACCESS_NOTICE);
	if (
		approval.approvalKind === "user_input" &&
		approval.questions.some((question) => question.isSecret)
	)
		notices.push(SECRET_NOTICE);
	if (approval.approvalKind === "elicitation") {
		if (approval.mode === "url" && safeHttpUrl(approval.url) === null) notices.push(NO_SAFE_URL);
		if (approval.mode !== "url" && approval.fields === null) notices.push(NO_FIELDS);
		if (approval.fields?.some((item) => item.secret) === true) notices.push(SECRET_NOTICE);
	}
	if (
		(approval.approvalKind === "command_execution" || approval.approvalKind === "file_change") &&
		approval.availableDecisions.length === 0
	)
		notices.push("The host offered no decisions, so this request can only be read.");
	return Object.freeze(notices);
}

export function dynamicIdentityRows(
	approval: BrowserDynamicApproval,
): readonly WorkbenchApprovalDisclosure[] {
	const identity = approval.identity;
	return Object.freeze([
		row("Calling thread", identity.threadId, true),
		row("Calling turn", identity.turnId, true),
		row("Dynamic call id", identity.callId, true),
		row("Tool namespace", identity.namespace, true),
		row("Tool", identity.tool, true),
		row("Manifest hash", identity.manifestHash, true),
		row("OperationId", identity.operationId, true),
		row("Child", identity.child, true),
		row("Child epoch", identity.epoch, true),
	]);
}

function boundaryText(effect: BrowserDynamicApproval["effect"]): string {
	if (effect.tool !== "fork_thread") return "Not applicable: this effect has no fork boundary.";
	const boundary = effect.effectiveBoundary;
	if (boundary.relation === "self")
		return `Self fork before the calling turn ${boundary.beforeTurnId}.`;
	return boundary.beforeTurnId === null
		? "Fork of another thread from its current head."
		: `Fork of another thread before turn ${boundary.beforeTurnId}.`;
}

function promptText(effect: BrowserDynamicApproval["effect"]): string {
	if (effect.tool === "fork_thread")
		return effect.arguments.prompt ?? "No prompt: this fork starts no turn.";
	return effect.arguments.prompt;
}

export function dynamicEffectRows(
	approval: BrowserDynamicApproval,
): readonly WorkbenchApprovalDisclosure[] {
	const effect = approval.effect;
	return Object.freeze([
		row(
			"Target thread",
			effect.target ?? "A new thread that does not exist yet.",
			effect.target !== null,
		),
		row("Prompt", promptText(effect)),
		row("Effective fork boundary", boundaryText(effect)),
		row("Mutation OperationId", effect.mutationOperationId, true),
		effect.initialTurnOperationId === null
			? row("Initial turn OperationId", "None: this effect starts no turn.")
			: row("Initial turn OperationId", effect.initialTurnOperationId, true),
		row("Effect hash", approval.effectHash, true),
		row("Created", timestampText(approval.createdAtMs), true),
		row("Expires", timestampText(approval.expiresAtMs), true),
		row("Host summary", effect.visualSummary),
		approval.toolResult === null
			? row("Tool result", "The host published no tool result yet.")
			: row("Tool result", approval.toolResult, true),
	]);
}
