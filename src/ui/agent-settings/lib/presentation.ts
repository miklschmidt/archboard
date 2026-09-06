// Pure projections of the shared browser-model records into words, badges
// and fact rows. Nothing here re-derives a state: every label reads the
// record's own `state` and `reason`.

import type {
	BrowserAccount,
	BrowserCoordinator,
	BrowserLogin,
	BrowserSettings,
	BrowserThreadCandidate,
	BrowserThreadLink,
} from "@/shared/codex-browser-model";
import type { LoginVariant, PendingLogin } from "@/ui/agent-settings/lib/contracts";
import type { FactRow } from "@/ui/board-dialogs";

/** The badge tone a state maps to. */
type BadgeTone = "default" | "secondary" | "destructive" | "outline";

/** A state in words: a short label, an optional detail, and a tone. */
interface StateSummary {
	label: string;
	detail: string | null;
	tone: BadgeTone;
}

/**
 * The sign-in variants the account model can be pending on, in the order the
 * dialog offers them. Checked against the shared type, so a model change
 * fails here rather than at runtime.
 */
const LOGIN_VARIANTS = [
	"chatgpt",
	"apiKey",
	"amazonBedrock",
	"amazonBedrockAccessKeys",
] as const satisfies readonly LoginVariant[];

const LOGIN_VARIANT_LABELS: Readonly<Record<LoginVariant, string>> = {
	chatgpt: "ChatGPT",
	apiKey: "API key",
	amazonBedrock: "Amazon Bedrock",
	amazonBedrockAccessKeys: "Amazon Bedrock access keys",
};

/**
 * A sign-in variant's name.
 * @param variant The variant.
 * @returns Its label.
 */
function loginVariantLabel(variant: LoginVariant): string {
	return LOGIN_VARIANT_LABELS[variant];
}

/**
 * The account state in words.
 * @param account The account record.
 * @returns Label, detail and tone.
 */
function describeAccount(account: BrowserAccount): StateSummary {
	switch (account.state) {
		case "ready":
			return { label: "Signed in", detail: account.accountType, tone: "default" };
		case "login_pending":
			return {
				label: "Signing in",
				detail: loginVariantLabel(account.variant),
				tone: "secondary",
			};
		case "signed_out":
			return { label: "Signed out", detail: null, tone: "outline" };
		case "failed":
			return { label: "Sign-in failed", detail: account.reason, tone: "destructive" };
		default:
			return { label: "Unknown", detail: account.reason, tone: "outline" };
	}
}

/**
 * The login in progress, when there is one.
 * @param login The login record.
 * @returns The pending login, or null.
 */
function pendingLogin(login: BrowserLogin): PendingLogin | null {
	return login.state === "pending" ? login : null;
}

/**
 * The last login's outcome, when it is worth a line.
 * @param login The login record.
 * @returns A sentence, or null while idle or pending.
 */
function describeLoginOutcome(login: BrowserLogin): string | null {
	switch (login.state) {
		case "completed":
			return "The last sign-in completed.";
		case "cancelled":
			return "The last sign-in was cancelled.";
		case "failed":
			return `The last sign-in failed: ${login.reason}`;
		default:
			return null;
	}
}

/**
 * A reason as the model carries it: absent and null both mean none.
 * @param reason The record's reason.
 * @returns The reason, or null.
 */
function reasonOf(reason: string | null | undefined): string | null {
	return reason ?? null;
}

/**
 * The thread link state in words.
 * @param link The thread link record.
 * @returns Label, detail and tone.
 */
function describeThreadLink(link: BrowserThreadLink): StateSummary {
	switch (link.state) {
		case "executable":
			return { label: "Linked", detail: reasonOf(link.reason), tone: "default" };
		case "inspect_only":
			return { label: "Inspect only", detail: reasonOf(link.reason), tone: "secondary" };
		default:
			return { label: "Unbound", detail: reasonOf(link.reason), tone: "outline" };
	}
}

/** The listed thread statuses in words. */
const THREAD_STATUS_LABELS: Readonly<Record<BrowserThreadLink["status"], string>> = {
	notLoaded: "Not loaded",
	idle: "Idle",
	active: "Active",
	systemError: "System error",
};

/**
 * The thread link's facts, identifiers in the mono face.
 * @param link The thread link record.
 * @returns Thread, status, source and input rows.
 */
function threadLinkFacts(link: BrowserThreadLink): readonly FactRow[] {
	const rows: FactRow[] = [];
	if (link.threadId !== null) {
		rows.push({ label: "Thread", value: String(link.threadId), technical: true });
	}
	rows.push({ label: "Status", value: THREAD_STATUS_LABELS[link.status], technical: false });
	if (link.sourcePresentation !== null) {
		rows.push({ label: "Source", value: link.sourcePresentation, technical: false });
	}
	rows.push({
		label: "Inventory",
		value: link.loaded ? "Thread inventory loaded" : "Thread inventory not loaded yet",
		technical: false,
	});
	rows.push({
		label: "Direct input",
		value: link.canAcceptDirectInput ? "Direct input is accepted" : "Direct input is not accepted",
		technical: false,
	});
	return rows;
}

/**
 * One candidate in words: its readiness, and why, as the classifier said.
 * @param candidate The candidate record.
 * @returns Label, detail and tone.
 */
function describeCandidate(candidate: BrowserThreadCandidate): StateSummary {
	const parts: string[] = [candidate.status, candidate.sourcePresentation];
	const reason = reasonOf(candidate.reason);
	if (reason !== null) {
		parts.push(reason);
	}
	return candidate.state === "executable"
		? { label: "Executable", detail: parts.join(" · "), tone: "default" }
		: { label: "Inspect only", detail: parts.join(" · "), tone: "secondary" };
}

const COORDINATOR_TONES: Readonly<Record<BrowserCoordinator["state"], BadgeTone>> = {
	unbound: "outline",
	starting: "secondary",
	ready: "default",
	active: "default",
	reconnecting: "secondary",
	failed: "destructive",
};

const COORDINATOR_LABELS: Readonly<Record<BrowserCoordinator["state"], string>> = {
	unbound: "Unbound",
	starting: "Starting",
	ready: "Ready",
	active: "Active",
	reconnecting: "Reconnecting",
	failed: "Failed",
};

/**
 * The coordinator's readiness in words.
 * @param coordinator The coordinator record.
 * @returns Label, detail and tone.
 */
function describeCoordinator(coordinator: BrowserCoordinator): StateSummary {
	return {
		label: COORDINATOR_LABELS[coordinator.state],
		detail: reasonOf(coordinator.reason),
		tone: COORDINATOR_TONES[coordinator.state],
	};
}

/**
 * A nullable technical value as a row, when present.
 * @param rows The rows to append to.
 * @param label The row's label.
 * @param value The value, or null.
 * @param technical Whether it is set in the mono face.
 */
function pushIfPresent(
	rows: FactRow[],
	label: string,
	value: string | null,
	technical: boolean,
): void {
	if (value !== null) {
		rows.push({ label, value, technical });
	}
}

/**
 * The coordinator's facts: its thread and turn, and configured against
 * effective model settings, so authority is visible.
 * @param coordinator The coordinator record.
 * @returns The rows.
 */
function coordinatorFacts(coordinator: BrowserCoordinator): readonly FactRow[] {
	const rows: FactRow[] = [];
	pushIfPresent(rows, "Thread", stringOrNull(coordinator.threadId), true);
	pushIfPresent(rows, "Active turn", stringOrNull(coordinator.activeTurnId), true);
	pushIfPresent(rows, "Configured model", coordinator.configuredModel, true);
	pushIfPresent(rows, "Configured effort", coordinator.configuredEffort, true);
	pushIfPresent(rows, "Effective model", coordinator.model, true);
	pushIfPresent(rows, "Effective effort", coordinator.effort, true);
	pushIfPresent(rows, "Service tier", coordinator.serviceTier, true);
	return rows;
}

/**
 * An identifier as text, or null when the record carries none.
 * @param value The identifier, or null.
 * @returns Its text, or null.
 */
function stringOrNull(value: string | number | null): string | null {
	return value === null ? null : String(value);
}

/**
 * An approval policy as one line: the named policy, or the granular flags
 * that are on.
 * @param policy The settings record's policy.
 * @returns One line.
 */
function approvalPolicyText(policy: BrowserSettings["approvalPolicy"]): string {
	if (typeof policy === "string") {
		return policy;
	}
	const enabled = Object.entries(policy.granular)
		.filter(([, on]) => on)
		.map(([flag]) => flag);
	return enabled.length === 0 ? "granular: none" : `granular: ${enabled.join(", ")}`;
}

/**
 * One owner's settings as rows.
 * @param settings The settings record.
 * @returns Model, effort, tier, approvals, sandbox and profile rows.
 */
function settingsFacts(settings: BrowserSettings): readonly FactRow[] {
	const rows: FactRow[] = [{ label: "Model", value: settings.model, technical: true }];
	pushIfPresent(rows, "Effort", settings.effort, true);
	pushIfPresent(rows, "Service tier", settings.serviceTier, true);
	rows.push({
		label: "Approvals",
		value: approvalPolicyText(settings.approvalPolicy),
		technical: false,
	});
	rows.push({ label: "Reviewer", value: settings.approvalsReviewer, technical: false });
	rows.push({
		label: "Sandbox",
		value: `${settings.sandbox.mode} · network ${settings.sandbox.network}`,
		technical: false,
	});
	pushIfPresent(rows, "Permission profile", settings.activePermissionProfile?.id ?? null, true);
	return rows;
}

export {
	LOGIN_VARIANTS,
	approvalPolicyText,
	coordinatorFacts,
	describeAccount,
	describeCandidate,
	describeCoordinator,
	describeLoginOutcome,
	describeThreadLink,
	loginVariantLabel,
	pendingLogin,
	settingsFacts,
	threadLinkFacts,
	type BadgeTone,
	type StateSummary,
};
