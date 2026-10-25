// How one thread-link command settles. A create that did not settle into a
// confirmed executable link is inspect-only, and an unknown outcome stays
// unknown: neither is retried.

import type {
	ThreadLinkActionName,
	ThreadLinkActionTarget,
} from "#ui/state/thread-link/contracts.ts";
import type { WorkbenchCommandResult } from "#ui/state/thread-link/transport-port.ts";

/** How a command settled. */
interface Settlement {
	readonly state: "succeeded" | "inspect_only" | "failed";
	readonly announcement: string;
}

/**
 * An action name in words.
 * @param action The action.
 * @returns The words.
 */
function words(action: ThreadLinkActionName): string {
	return action.replaceAll("_", " ");
}

/**
 * How a login command settled: the server's account facts decide, and a start
 * ChatGPT only accepted is not a completed sign-in.
 * @param result The transport's result.
 * @returns The settlement.
 */
function loginSettlement(result: WorkbenchCommandResult): Settlement {
	const account = result.snapshot.account;
	if (account.state === "failed") {
		return { state: "failed", announcement: account.reason };
	}
	if (account.state === "login_pending" || result.snapshot.login.state === "pending") {
		return {
			state: "succeeded",
			announcement: "Sign-in started. Complete the sign-in to continue.",
		};
	}
	if (account.state === "ready") {
		return { state: "succeeded", announcement: "Signed in." };
	}
	return {
		state: "inspect_only",
		announcement: "Sign-in has not been confirmed. Check the account status before trying again.",
	};
}

/**
 * How a create settled: only a confirmed executable link is a success.
 * @param result The transport's result.
 * @returns The settlement.
 */
function createSettlement(result: WorkbenchCommandResult): Settlement {
	const link = result.snapshot.threadLink;
	if (link.state !== "executable") {
		return {
			state: "inspect_only",
			announcement: `The create completed without a confirmed executable link, so this chat stays inspect-only. ${link.reason ?? "The server named no reason."}`,
		};
	}
	return { state: "succeeded", announcement: "Agent connected." };
}

/**
 * What a refusal says: a create whose coordinator could not start says why the
 * coordinator could not, which the server publishes with the refusal; anything
 * else says the refusal's own words.
 * @param action The action.
 * @param result The transport's result.
 * @param target The action's target.
 * @returns The announcement.
 */
function refusalWords(
	action: ThreadLinkActionName,
	result: WorkbenchCommandResult,
	target: ThreadLinkActionTarget,
): string {
	const coordinator = result.snapshot.coordinator;
	const coordinatorReason =
		action === "create" && result.code === "command_failed" && coordinator.state === "failed"
			? coordinator.reason
			: null;
	return (
		coordinatorReason ??
		result.message ??
		`The workbench refused ${words(action)} for chat ${target.chatId}.`
	);
}

/**
 * How a delivered command settled, by action.
 * @param action The action.
 * @param result The transport's result.
 * @param target The action's target.
 * @returns The settlement.
 */
function deliveredSettlement(
	action: ThreadLinkActionName,
	result: WorkbenchCommandResult,
	target: ThreadLinkActionTarget,
): Settlement {
	if (action === "login") {
		return loginSettlement(result);
	}
	if (action === "create") {
		return createSettlement(result);
	}
	return {
		state: "succeeded",
		announcement: `${words(action)} completed for chat ${target.chatId}.`,
	};
}

/**
 * How one command settled.
 * @param action The action.
 * @param result The transport's result.
 * @param target The action's target.
 * @returns The settlement.
 */
function classify(
	action: ThreadLinkActionName,
	result: WorkbenchCommandResult,
	target: ThreadLinkActionTarget,
): Settlement {
	if (result.outcome === "outcome_unknown") {
		return {
			state: "inspect_only",
			announcement:
				`The ${words(action)} outcome is unknown. Inspect the current link before acting again; do not retry blind. ${result.message ?? ""}`.trim(),
		};
	}
	if (result.outcome === "not_delivered" || result.code !== null) {
		return { state: "failed", announcement: refusalWords(action, result, target) };
	}
	return deliveredSettlement(action, result, target);
}

export { classify, words, type Settlement };
