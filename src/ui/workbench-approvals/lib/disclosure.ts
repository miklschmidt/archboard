// Every fact an ordinary card discloses: the request's identity, the
// broker's identity, the effect, a safe link, and the notices that say what
// the host did not publish or what this browser will not do.

import type { BrowserApproval } from "@/shared/codex-browser-model";
import type {
	WorkbenchApprovalDisclosure,
	WorkbenchApprovalLink,
} from "@/ui/workbench-approvals/contracts";
import { permissionsAreGrantable } from "@/ui/workbench-approvals/lib/fields";
import { safeHttpUrl } from "@/ui/workbench-approvals/lib/safe-url";

type Elicitation = Extract<BrowserApproval, { readonly approvalKind: "elicitation" }>;
type Permissions = Extract<BrowserApproval, { readonly approvalKind: "permissions" }>;
type UserInput = Extract<BrowserApproval, { readonly approvalKind: "user_input" }>;
type Rows = readonly WorkbenchApprovalDisclosure[];

const NO_TURN = "The host published no turn identity for this request.";
const NO_ITEM = "The host published no item identity for this request.";
const NO_APPROVAL_ID = "The host issued no ApprovalId for this request.";
const NO_LINK = "The host published no link presentation for this request.";
const NO_REASON = "The host published no reason.";
const NO_COMMAND = "The host did not publish the command text.";
const NO_SAFE_URL = "The host published no safe http or https URL, so nothing here can be opened.";
const NO_FIELDS =
	"The host published no reviewed fields for this form, so it cannot be answered here.";
const SECRET_NOTICE = "A secret answer is never shown back, never defaulted, and never spoken.";
const NOTHING_GRANTABLE_NOTICE =
	"This request names no permission this browser can grant, so the only honest answer here is to grant nothing.";
const FILE_ACCESS_NOTICE =
	"The host published which file-access modes were asked for but no paths. Archboard never invents a path list, so only network access, grant scope, and strict auto review can be granted here.";
const NO_DECISIONS_NOTICE = "The host offered no decisions, so this request can only be read.";

/**
 * One row.
 * @param label The label.
 * @param value The value.
 * @param technical Whether the value is a technical token.
 * @returns The row.
 */
function row(label: string, value: string, technical = false): WorkbenchApprovalDisclosure {
	return Object.freeze({ label, value, technical });
}

/**
 * A technical row, or the words for its absence.
 * @param label The label.
 * @param value The value, or null.
 * @param absent The words when the host published nothing.
 * @returns The row.
 */
function optionalRow(
	label: string,
	value: string | null,
	absent: string,
): WorkbenchApprovalDisclosure {
	return value === null ? row(label, absent) : row(label, value, true);
}

/**
 * An instant as ISO text.
 * @param value Milliseconds since the epoch.
 * @returns The text.
 */
function timestampText(value: number): string {
	return new Date(value).toISOString();
}

/**
 * The request's own identity.
 * @param approval The request.
 * @returns The rows.
 */
function ordinaryIdentityRows(approval: BrowserApproval): Rows {
	return Object.freeze([
		row("Request id", String(approval.requestId), true),
		row("Thread", approval.threadId, true),
		optionalRow("Turn", approval.turnId, NO_TURN),
		optionalRow("Item", approval.itemId, NO_ITEM),
		optionalRow("Approval id", approval.approvalId, NO_APPROVAL_ID),
		row("Expires", timestampText(approval.expiresAtMs), true),
	]);
}

/**
 * The broker's own identity for this request, rendered on every ordinary card.
 * @param approval The request.
 * @returns The rows.
 */
function brokerRows(approval: BrowserApproval): Rows {
	const binding = approval.binding;
	return Object.freeze([
		row("Broker child", binding.child, true),
		row("Broker child epoch", binding.epoch, true),
		optionalRow("Broker link", binding.link, NO_LINK),
		row("Broker target", binding.target),
		row("Broker effect", binding.effect),
	]);
}

/**
 * The host's reason row.
 * @param reason The reason, or null.
 * @returns The row.
 */
function reasonRow(reason: string | null | undefined): WorkbenchApprovalDisclosure {
	return row("Reason", reason ?? NO_REASON);
}

/**
 * The words for a requested network scope.
 * @param value The request's network flag.
 * @returns The words.
 */
function networkScopeText(value: boolean | null): string {
	if (value === null) {
		return "The agent did not ask about network access.";
	}
	return value ? "Requested" : "Requested to stay closed";
}

/**
 * The effect rows of a permissions request.
 * @param approval The request.
 * @returns The rows.
 */
function permissionsRows(approval: Permissions): Rows {
	const access = approval.requestedScope.fileAccess;
	return [
		row("Requested network access", networkScopeText(approval.requestedScope.network)),
		row("Requested file access", access.length === 0 ? "None requested." : access.join(", ")),
		reasonRow(approval.reason),
	];
}

/**
 * The effect rows of an elicitation.
 * @param approval The request.
 * @returns The rows.
 */
function elicitationRows(approval: Elicitation): Rows {
	const href = approval.url === null ? null : safeHttpUrl(approval.url);
	return [
		row("MCP server", approval.serverName, true),
		row("Mode", approval.mode, true),
		row("Message", approval.message),
		href === null ? row("URL", NO_SAFE_URL) : row("URL", approval.url ?? href, true),
	];
}

/**
 * The effect rows of a user-input request.
 * @param approval The request.
 * @returns The rows.
 */
function userInputRows(approval: UserInput): Rows {
	const secret = approval.questions.some((question) => question.isSecret);
	return [
		row("Questions", String(approval.questions.length), true),
		row("Secret answers", secret ? "One or more answers are secret." : "None."),
	];
}

/**
 * The effect rows of the families that gate an action.
 * @param approval The request.
 * @returns The rows.
 */
function actionRows(
	approval: Extract<
		BrowserApproval,
		{ readonly approvalKind: "command_execution" | "file_change" | "apply_patch" | "exec_command" }
	>,
): Rows {
	switch (approval.approvalKind) {
		case "command_execution":
			return [optionalRow("Command", approval.command, NO_COMMAND), reasonRow(approval.reason)];
		case "apply_patch":
			return [row("Files changed", String(approval.fileCount), true), reasonRow(approval.reason)];
		case "exec_command":
			return [row("Command", approval.command.join(" "), true), reasonRow(approval.reason)];
		default:
			return [reasonRow(approval.reason)];
	}
}

/**
 * The effect one ordinary request asks for.
 * @param approval The request.
 * @returns The rows.
 */
function ordinaryEffectRows(approval: BrowserApproval): Rows {
	switch (approval.approvalKind) {
		case "permissions":
			return Object.freeze(permissionsRows(approval));
		case "user_input":
			return Object.freeze(userInputRows(approval));
		case "elicitation":
			return Object.freeze(elicitationRows(approval));
		default:
			return Object.freeze(actionRows(approval));
	}
}

/**
 * The safe links one ordinary request carries.
 * @param approval The request.
 * @returns The links; none unless an elicitation carries a safe URL.
 */
function ordinaryLinks(approval: BrowserApproval): readonly WorkbenchApprovalLink[] {
	if (approval.approvalKind !== "elicitation" || approval.url === null) {
		return Object.freeze([]);
	}
	const href = safeHttpUrl(approval.url);
	return href === null
		? Object.freeze([])
		: Object.freeze([Object.freeze({ label: approval.url, href })]);
}

/**
 * The notices of a permissions request. One unambiguous notice: a request
 * this browser cannot grant at all does not also need the narrower reason for
 * the file-access half of it.
 * @param approval The request.
 * @returns The notices.
 */
function permissionsNotices(approval: Permissions): readonly string[] {
	if (!permissionsAreGrantable(approval)) {
		return [NOTHING_GRANTABLE_NOTICE];
	}
	return approval.requestedScope.fileAccess.length > 0 ? [FILE_ACCESS_NOTICE] : [];
}

/**
 * The notices of an elicitation.
 * @param approval The request.
 * @returns The notices.
 */
function elicitationNotices(approval: Elicitation): readonly string[] {
	const notices: string[] = [];
	const missing =
		approval.mode === "url" ? missingUrlNotice(approval) : missingFieldsNotice(approval);
	if (missing !== null) {
		notices.push(missing);
	}
	if (approval.fields?.some((item) => item.secret) === true) {
		notices.push(SECRET_NOTICE);
	}
	return notices;
}

/**
 * The notice of a URL-mode elicitation without a safe URL.
 * @param approval The request.
 * @returns The notice, or null.
 */
function missingUrlNotice(approval: Elicitation): string | null {
	return approval.url === null || safeHttpUrl(approval.url) === null ? NO_SAFE_URL : null;
}

/**
 * The notice of a form-mode elicitation without published fields.
 * @param approval The request.
 * @returns The notice, or null.
 */
function missingFieldsNotice(approval: Elicitation): string | null {
	return approval.fields === null ? NO_FIELDS : null;
}

/**
 * The notices of a user-input request.
 * @param approval The request.
 * @returns The notices.
 */
function userInputNotices(approval: UserInput): readonly string[] {
	return approval.questions.some((question) => question.isSecret) ? [SECRET_NOTICE] : [];
}

/**
 * The notices of the families whose decisions the host enumerates.
 * @param approval The request.
 * @returns The notices.
 */
function enumeratedNotices(
	approval: Extract<
		BrowserApproval,
		{ readonly approvalKind: "command_execution" | "file_change" }
	>,
): readonly string[] {
	const notices: string[] = [];
	if (approval.approvalKind === "command_execution" && approval.command === null) {
		notices.push(NO_COMMAND);
	}
	if (approval.availableDecisions.length === 0) {
		notices.push(NO_DECISIONS_NOTICE);
	}
	return notices;
}

/**
 * What the host did not publish, or what this browser will not do.
 * @param approval The request.
 * @returns The notices.
 */
function ordinaryNotices(approval: BrowserApproval): readonly string[] {
	switch (approval.approvalKind) {
		case "command_execution":
		case "file_change":
			return Object.freeze(enumeratedNotices(approval));
		case "permissions":
			return Object.freeze(permissionsNotices(approval));
		case "user_input":
			return Object.freeze(userInputNotices(approval));
		case "elicitation":
			return Object.freeze(elicitationNotices(approval));
		default:
			return Object.freeze([]);
	}
}

export {
	brokerRows,
	ordinaryEffectRows,
	ordinaryIdentityRows,
	ordinaryLinks,
	ordinaryNotices,
	row,
	timestampText,
};
