// How one thread-link command settles. A link command that did not settle
// into a confirmed executable link for the exact thread it named is
// inspect-only, and an unknown outcome stays unknown: neither is retried.

import type {
	ThreadLinkActionName,
	ThreadLinkActionTarget,
	ThreadLinkPaneCapture,
	ThreadLinkRecovery,
} from "@/ui/workbench-thread-link/contracts";
import { threadLinkRecovery } from "@/ui/workbench-thread-link/lib/recovery";
import type {
	WorkbenchCommandResult,
	WorkbenchTransportErrorCode,
} from "@/ui/workbench-thread-link/transport-port";

/** The commands that go to the wire. */
type CommandAction = Exclude<ThreadLinkActionName, "recover" | "unlink">;

/** How a command settled, before its recovery is attached. */
interface Settlement {
	readonly state: "succeeded" | "inspect_only" | "failed";
	readonly announcement: string;
}

const RETARGET_CODES: ReadonlySet<WorkbenchTransportErrorCode> = new Set([
	"link_changed",
	"link_required",
	"lease_expired",
	"lease_released",
	"lease_transferred",
	"lease_required",
]);

const LINK_ACTIONS: ReadonlySet<CommandAction> = new Set(["create", "attach", "relink"]);

/**
 * An action name in words.
 * @param action The action.
 * @returns The words.
 */
function words(action: CommandAction): string {
	return action.replaceAll("_", " ");
}

/**
 * The recovery for a settled or failed command.
 * @param pane The pane the command ran against.
 * @param code The transport's code, or null.
 * @returns The recovery.
 */
function recoveryFor(
	pane: ThreadLinkPaneCapture,
	code: WorkbenchTransportErrorCode | null,
): ThreadLinkRecovery {
	const capabilities = pane.transport.capabilities();
	if (code !== null && RETARGET_CODES.has(code)) {
		return threadLinkRecovery("refresh_inventory", capabilities, pane.hostRecoveryIntents);
	}
	if (code === "socket_unavailable" || code === "child_disconnected") {
		return threadLinkRecovery("start_workbench", capabilities, pane.hostRecoveryIntents);
	}
	if (code === "incompatible_contract") {
		return threadLinkRecovery("choose_binary", capabilities, pane.hostRecoveryIntents);
	}
	return threadLinkRecovery("refresh_snapshot", capabilities, pane.hostRecoveryIntents);
}

/**
 * How a login command settled: the host's account facts decide, and a start
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
 * How a link command settled: only a confirmed executable link to the exact
 * thread it named is a success.
 * @param action The action.
 * @param result The transport's result.
 * @param target The action's target.
 * @returns The settlement.
 */
function linkSettlement(
	action: CommandAction,
	result: WorkbenchCommandResult,
	target: ThreadLinkActionTarget,
): Settlement {
	const link = result.snapshot.threadLink;
	if (link.state !== "executable") {
		return {
			state: "inspect_only",
			announcement: `The ${action} completed without a confirmed executable link, so this pane stays inspect-only. ${link.reason ?? "The host named no reason."}`,
		};
	}
	if (target.threadId !== null && link.threadId !== target.threadId) {
		return {
			state: "inspect_only",
			announcement: `The ${action} settled on thread ${link.threadId}, which is not the thread it named. Inspect the current link before acting again.`,
		};
	}
	return { state: "succeeded", announcement: "Agent connected." };
}

/**
 * How a delivered command settled, by action.
 * @param action The action.
 * @param result The transport's result.
 * @param target The action's target.
 * @returns The settlement.
 */
function deliveredSettlement(
	action: CommandAction,
	result: WorkbenchCommandResult,
	target: ThreadLinkActionTarget,
): Settlement {
	if (action === "login") {
		return loginSettlement(result);
	}
	if (LINK_ACTIONS.has(action)) {
		return linkSettlement(action, result, target);
	}
	return {
		state: "succeeded",
		announcement: `${words(action)} completed for pane ${target.paneId}.`,
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
	action: CommandAction,
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
		return {
			state: "failed",
			announcement:
				result.message ?? `The workbench refused ${words(action)} for pane ${target.paneId}.`,
		};
	}
	return deliveredSettlement(action, result, target);
}

export { classify, recoveryFor, words, type CommandAction, type Settlement };
