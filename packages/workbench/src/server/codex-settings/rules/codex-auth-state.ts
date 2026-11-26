import {
	defaultVoiceAgentModels,
	type RoleModelSelection,
} from "@archboard/codex-realtime-voice/server";
import type { CodexWorkbenchDomainScope } from "#runtime/voice/protocol/extension.ts";
import type {
	CodexAuthAccount,
	CodexAuthState,
	CodexModelOption,
	CodexSettingsReply,
} from "#shared/codex-settings/schemas/codex-settings.ts";

/** Startup state reported before a generation scope attaches. */
interface CodexSettingsStartupState {
	readonly state: "starting" | "ready" | "unavailable";
	readonly reason: string;
}

type AccountSnapshot = ReturnType<CodexWorkbenchDomainScope["account"]["snapshot"]>;
type AccountRecord = NonNullable<
	Awaited<ReturnType<CodexWorkbenchDomainScope["session"]["accountRead"]>>["account"]
>;

const STARTING_PROCESS_STATES: ReadonlySet<string> = new Set([
	"starting",
	"backoff",
	"group_cleanup",
]);

const UNAVAILABLE_PROCESS_STATES: ReadonlySet<string> = new Set([
	"stopping",
	"stopped",
	"terminal_failure",
]);

/**
 * Project one Codex app-server account record into the settings schema shape.
 * @param account The non-null account returned by account/read.
 * @returns The settings auth account payload.
 */
function mapAuthAccount(account: AccountRecord): CodexAuthAccount {
	if (account.type === "chatgpt") {
		return {
			type: "chatgpt",
			email: account.email,
			planType: account.planType,
			workspaceName: account.workspaceName ?? null,
		};
	}
	if (account.type === "amazonBedrock") {
		return {
			type: "amazonBedrock",
			usesCodexManagedCredentials: account.usesCodexManagedCredentials,
		};
	}
	return account.type === "apiKey" ? { type: "apiKey" } : { type: "gcp" };
}

/**
 * Derive a pending login auth state when the generation has an active login attempt.
 * @param login Current login projection state.
 * @returns Pending auth state, or null when no login is pending.
 */
function pendingLoginState(login: AccountSnapshot["login"]): CodexAuthState | null {
	if (login.state !== "pending") return null;
	return {
		state: "login_pending",
		loginId: String(login.loginId),
		variant: login.variant,
		authUrl: login.authUrl,
	};
}

/**
 * Derive an auth state when the Codex child process is not running.
 * @param process Current owned process facts.
 * @returns Starting/unavailable auth state, or null while running.
 */
function processAuthState(process: AccountSnapshot["process"]): CodexAuthState | null {
	if (STARTING_PROCESS_STATES.has(process.state)) {
		return { state: "starting", reason: "Codex app-server is starting." };
	}
	if (UNAVAILABLE_PROCESS_STATES.has(process.state)) {
		return {
			state: "unavailable",
			reason: process.failure?.message ?? "Codex app-server is unavailable.",
		};
	}
	return null;
}

/**
 * Whether an account snapshot needs an initial or retry account/read call.
 * @param snap Current generation account snapshot.
 * @returns True when account state is unknown or previously failed.
 */
function needsAccountRefresh(snap: AccountSnapshot): boolean {
	return (
		snap.account.kind === "account" &&
		(snap.account.state === "unknown" || snap.account.state === "failed")
	);
}

/**
 * Project a raw account/read response into an authenticated or signed-out state.
 * @param response The account/read payload.
 * @param loginReason Optional failed login reason.
 * @returns The settings auth state.
 */
function authStateFromAccountResponse(
	response: Extract<
		AccountSnapshot["account"],
		{ readonly kind: "codex_account_response" }
	>["response"],
	loginReason: string | null,
): CodexAuthState {
	if (response.account !== null) {
		return { state: "authenticated", account: mapAuthAccount(response.account) };
	}
	return {
		state: "signed_out",
		requiresOpenaiAuth: response.requiresOpenaiAuth,
		reason: loginReason,
	};
}

/**
 * Project a settled Codex account snapshot into a settings auth state.
 * @param snap Current generation account snapshot.
 * @returns The settings auth state.
 */
function authStateFromSnapshot(snap: AccountSnapshot): CodexAuthState {
	const loginReason = snap.login.state === "failed" ? snap.login.reason : null;
	if (snap.account.kind === "codex_account_response") {
		return authStateFromAccountResponse(snap.account.response, loginReason);
	}
	if (snap.account.state === "signed_out") {
		return { state: "signed_out", requiresOpenaiAuth: true, reason: loginReason };
	}
	if (snap.account.state === "failed") {
		return { state: "unavailable", reason: snap.account.reason };
	}
	return {
		state: "starting",
		reason: snap.account.state === "unknown" ? snap.account.reason : "Checking Codex sign-in.",
	};
}

/**
 * Compute the effective default selections given the live advertised model list.
 * @param models Available models from the authenticated Codex app-server.
 * @returns Default selections for orchestrator and workhorse.
 */
function effectiveDefaults(models: readonly CodexModelOption[]): CodexSettingsReply["defaults"] {
	const defaults = defaultVoiceAgentModels();
	const orchestratorModel = models.find((entry) => entry.model === defaults.coordinator.model);
	const priorityAvailable =
		orchestratorModel?.serviceTiers.some((tier) => tier.id === "priority") ?? false;
	return {
		orchestrator: {
			model: defaults.coordinator.model,
			effort: defaults.coordinator.effort,
			serviceTier: priorityAvailable ? "priority" : null,
		},
		workhorse: {
			model: defaults.workhorse.model,
			effort: defaults.workhorse.effort,
			serviceTier: null,
		},
	};
}

/**
 * Validate one role's model, reasoning effort, and service tier against live model/list entries.
 * @param roleLabel Human-readable role name for diagnostics.
 * @param selection Candidate selection.
 * @param models Live models advertised by the authenticated Codex app-server.
 * @returns Null when valid, or an explanatory error string.
 */
function validateRoleSelection(
	roleLabel: string,
	selection: RoleModelSelection,
	models: readonly CodexModelOption[],
): string | null {
	const model = models.find((entry) => entry.model === selection.model);
	if (model === undefined) {
		return `${roleLabel} model "${selection.model}" is not available in the authenticated Codex server.`;
	}
	if (
		!model.supportedReasoningEfforts.some((entry) => entry.reasoningEffort === selection.effort)
	) {
		return `${roleLabel} model "${selection.model}" does not support "${selection.effort}" reasoning effort.`;
	}
	if (
		selection.serviceTier !== null &&
		!model.serviceTiers.some((tier) => tier.id === selection.serviceTier)
	) {
		return `${roleLabel} model "${selection.model}" does not advertise service tier "${selection.serviceTier}".`;
	}
	return null;
}

export {
	authStateFromSnapshot,
	effectiveDefaults,
	needsAccountRefresh,
	pendingLoginState,
	processAuthState,
	validateRoleSelection,
	type CodexSettingsStartupState,
};
