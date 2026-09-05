// The Codex account as the pane sees it: which arm it is in, the one
// continuation a pending ChatGPT sign-in publishes, and which account
// controls the transport accepts now.

import type { BrowserSnapshot } from "@/shared/codex-browser-model";
import type { ThreadLinkAccountDisclosure } from "@/ui/workbench-thread-link/contracts";
import {
	THREAD_LINK_ACCOUNT_FORMS,
	THREAD_LINK_UNAVAILABLE_ACCOUNT_METHODS,
} from "@/ui/workbench-thread-link/lib/account-forms";
import type {
	WorkbenchTransportCapabilities,
	WorkbenchTransportState,
} from "@/ui/workbench-thread-link/transport-port";

type Account = BrowserSnapshot["account"];
type Login = BrowserSnapshot["login"];
type PendingAccount = Extract<Account, { readonly state: "login_pending" }>;

/** What the account projection reads. */
interface AccountInput {
	readonly state: WorkbenchTransportState;
	readonly capabilities: WorkbenchTransportCapabilities;
}

/** The account and login facts one state carries. */
interface AccountFacts {
	readonly account: Account | null;
	readonly login: Login | null;
	readonly authoritative: boolean;
}

/** Which account controls the transport accepts. */
interface AccountControls {
	readonly canLogin: boolean;
	readonly canCancelLogin: boolean;
	readonly canLogout: boolean;
}

const ACCOUNT_LABELS = {
	unknown: "Not connected",
	signed_out: "Signed out",
	login_pending: "Sign-in in progress",
	ready: "Signed in",
	failed: "Sign-in failed",
} as const satisfies Record<ThreadLinkAccountDisclosure["state"], string>;

const ACCOUNT_TYPE_WORDS = {
	chatgpt: "ChatGPT",
	apiKey: "an OpenAI API key",
	amazonBedrock: "Amazon Bedrock",
} as const;

/**
 * The words for one account arm.
 * @param account The published account.
 * @returns The detail.
 */
function accountDetail(account: Account): string {
	switch (account.state) {
		case "unknown":
		case "failed":
			return account.reason;
		case "signed_out":
			return "Choose how to sign in.";
		case "login_pending":
			return "Complete the sign-in in progress, or cancel to choose another method.";
		default:
			return `Signed in with ${ACCOUNT_TYPE_WORDS[account.accountType]}.`;
	}
}

/**
 * The facts one transport state carries.
 * @param state The transport state.
 * @returns The account, the login, and whether the snapshot is authoritative.
 */
function accountFacts(state: WorkbenchTransportState): AccountFacts {
	return {
		account: state.snapshot?.account ?? null,
		login: state.snapshot?.login ?? null,
		authoritative: state.kind === "readiness",
	};
}

/**
 * The login's continuation URL when it names the same ChatGPT sign-in the
 * account is pending on.
 * @param account The pending account.
 * @param login The published login, or null.
 * @returns The URL, or null.
 */
function matchingContinuation(account: PendingAccount, login: Login | null): string | null {
	if (account.variant !== "chatgpt" || login?.state !== "pending" || login.variant !== "chatgpt") {
		return null;
	}
	return login.loginId === account.loginId ? login.authUrl : null;
}

/**
 * The host-validated continuation for the current pending ChatGPT sign-in,
 * only while the snapshot is authoritative.
 * @param facts The account facts.
 * @returns The URL, or null.
 */
function continuationUrl(facts: AccountFacts): string | null {
	if (!facts.authoritative || facts.account?.state !== "login_pending") {
		return null;
	}
	return matchingContinuation(facts.account, facts.login);
}

/**
 * Which account controls the transport accepts.
 * @param facts The account facts.
 * @param capabilities The transport capabilities.
 * @returns The controls.
 */
function accountControls(
	facts: AccountFacts,
	capabilities: WorkbenchTransportCapabilities,
): AccountControls {
	const pending = facts.login?.state === "pending";
	const ready = facts.account?.state === "ready";
	return {
		canLogin: capabilities.supportsCommand("accountLogin"),
		canCancelLogin: pending && capabilities.supportsCommand("accountLoginCancel"),
		canLogout: ready && capabilities.supportsCommand("accountLogout"),
	};
}

/**
 * Why signing in is unavailable, if it is.
 * @param canLogin Whether the transport accepts a login.
 * @param account The published account, or null.
 * @returns The reason, or null.
 */
function loginBlock(canLogin: boolean, account: Account | null): string | null {
	if (canLogin) {
		return null;
	}
	return account?.state === "login_pending"
		? "Finish or cancel the current sign-in."
		: "Reconnect to Codex before signing in.";
}

/**
 * The detail of the disclosure.
 * @param account The published account, or null.
 * @param authUrl The continuation, or null.
 * @returns The detail.
 */
function disclosureDetail(account: Account | null, authUrl: string | null): string {
	if (account === null) {
		return "The workbench has published no account facts for this pane yet.";
	}
	return authUrl === null ? accountDetail(account) : "Continue to ChatGPT to finish signing in.";
}

/**
 * The account as the pane sees it.
 * @param input The transport state and capabilities.
 * @returns The disclosure.
 */
function projectThreadLinkAccount(input: AccountInput): ThreadLinkAccountDisclosure {
	const facts = accountFacts(input.state);
	const controls = accountControls(facts, input.capabilities);
	const authUrl = continuationUrl(facts);
	const state = facts.account?.state ?? "unknown";
	return Object.freeze({
		state,
		label: ACCOUNT_LABELS[state],
		detail: disclosureDetail(facts.account, authUrl),
		pendingLoginId: facts.login?.state === "pending" ? facts.login.loginId : null,
		authUrl,
		forms: THREAD_LINK_ACCOUNT_FORMS,
		unavailable: THREAD_LINK_UNAVAILABLE_ACCOUNT_METHODS,
		...controls,
		blockedReason: loginBlock(controls.canLogin, facts.account),
	});
}

export { projectThreadLinkAccount, type AccountInput };
