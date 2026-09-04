import type { LoginId, ThreadId } from "../../../shared/codex-workbench-identity/index.js";
import type {
	BrowserCommandDraft,
	BrowserWorkbenchCommandResult,
	BrowserWorkbenchCommandTarget,
	BrowserWorkbenchTransportErrorCode,
} from "../../workbench-transport/index.js";

import { threadLinkRecovery } from "./readiness.js";
import type {
	ThreadLinkActionCompletion,
	ThreadLinkActionName,
	ThreadLinkActionSnapshot,
	ThreadLinkActionTarget,
	ThreadLinkController,
	ThreadLinkControllerOptions,
	ThreadLinkControllerRecoveryIntent,
	ThreadLinkLoginParams,
	ThreadLinkPaneCapture,
	ThreadLinkRecovery,
	ThreadLinkRecoveryTarget,
	ThreadLinkRow,
} from "./contract.js";

type CommandAction = Exclude<ThreadLinkActionName, "recover">;

const UNCERTAIN_CODES = new Set<BrowserWorkbenchTransportErrorCode>([
	"response_lost",
	"outcome_unknown",
]);

const RETARGET_CODES = new Set<BrowserWorkbenchTransportErrorCode>([
	"link_changed",
	"link_required",
	"lease_expired",
	"lease_released",
	"lease_transferred",
	"lease_required",
]);

function errorCode(error: unknown): BrowserWorkbenchTransportErrorCode | null {
	if (typeof error !== "object" || error === null || !("code" in error)) return null;
	const code = (error as { readonly code: unknown }).code;
	return typeof code === "string" ? (code as BrowserWorkbenchTransportErrorCode) : null;
}

function errorMessage(error: unknown): string {
	return error instanceof Error && error.message.trim().length > 0
		? error.message
		: "The Codex workbench action failed.";
}

function uncertain(error: unknown): boolean {
	const code = errorCode(error);
	if (code !== null && UNCERTAIN_CODES.has(code)) return true;
	return (
		typeof error === "object" &&
		error !== null &&
		"outcome" in error &&
		(error as { readonly outcome: unknown }).outcome === "outcome_unknown"
	);
}

function captureTarget(
	pane: ThreadLinkPaneCapture,
	captured: BrowserWorkbenchCommandTarget,
	threadId: ThreadId | null,
): ThreadLinkActionTarget {
	return Object.freeze({
		paneId: pane.paneId,
		childId: captured.childId,
		epoch: captured.epoch,
		commandId: captured.commandId,
		threadId,
		capturedLinkState: captured.capturedThreadLink.state,
		capturedLinkThreadId: captured.capturedThreadLink.threadId,
	});
}

function recoveryFor(
	pane: ThreadLinkPaneCapture,
	code: BrowserWorkbenchTransportErrorCode | null,
): ThreadLinkRecovery {
	const capabilities = pane.transport.capabilities();
	if (code !== null && RETARGET_CODES.has(code))
		return threadLinkRecovery("refresh_inventory", capabilities, pane.hostRecoveryIntents);
	if (code === "socket_unavailable" || code === "child_disconnected")
		return threadLinkRecovery("start_workbench", capabilities, pane.hostRecoveryIntents);
	if (code === "incompatible_contract")
		return threadLinkRecovery("choose_binary", capabilities, pane.hostRecoveryIntents);
	return threadLinkRecovery("refresh_snapshot", capabilities, pane.hostRecoveryIntents);
}

function completion(state: "applied" | "ignored", revision: number): ThreadLinkActionCompletion {
	return Object.freeze({ state, revision });
}

/** The three commands that must settle into a confirmed executable link. */
function linkAction(action: CommandAction): boolean {
	return action === "create" || action === "attach" || action === "relink";
}

interface Settlement {
	readonly state: "succeeded" | "inspect_only" | "failed";
	readonly announcement: string;
}

/**
 * A link command that did not settle into a confirmed executable link for the
 * exact thread it named is inspect-only. It is never retried on its own.
 */
function classify(
	action: CommandAction,
	result: BrowserWorkbenchCommandResult,
	target: ThreadLinkActionTarget,
): Settlement {
	if (result.outcome === "outcome_unknown")
		return {
			state: "inspect_only",
			announcement:
				`The ${action.replace("_", " ")} outcome is unknown. Inspect the current link before acting again; do not retry blind. ${result.message ?? ""}`.trim(),
		};
	if (result.outcome === "not_delivered" || result.code !== null)
		return {
			state: "failed",
			announcement:
				result.message ??
				`The workbench refused ${action.replace("_", " ")} for pane ${target.paneId}.`,
		};
	if (!linkAction(action))
		return {
			state: "succeeded",
			announcement: `${action.replace("_", " ")} completed for pane ${target.paneId}.`,
		};
	const link = result.snapshot.threadLink;
	if (link.state !== "executable")
		return {
			state: "inspect_only",
			announcement: `The ${action} completed without a confirmed executable link, so this pane stays inspect-only. ${link.reason ?? "The host named no reason."}`,
		};
	if (target.threadId !== null && link.threadId !== target.threadId)
		return {
			state: "inspect_only",
			announcement: `The ${action} settled on thread ${link.threadId}, which is not the thread it named. Inspect the current link before acting again.`,
		};
	return {
		state: "succeeded",
		announcement: `${action} bound pane ${target.paneId} to executable thread ${link.threadId}.`,
	};
}

export function createThreadLinkController(
	options: ThreadLinkControllerOptions,
): ThreadLinkController {
	let revision = 0;
	let published: ThreadLinkActionSnapshot = Object.freeze({ state: "idle", revision });
	const listeners = new Set<() => void>();

	const publish = (next: ThreadLinkActionSnapshot): void => {
		published = Object.freeze(next);
		for (const listener of Array.from(listeners)) {
			try {
				listener();
			} catch {
				// A rendering subscriber never changes command settlement.
			}
		}
	};

	const settle = (
		operationRevision: number,
		next: Exclude<ThreadLinkActionSnapshot, { readonly state: "idle" | "pending" }>,
	): ThreadLinkActionCompletion => {
		// A superseded action never overwrites the action that replaced it.
		if (operationRevision !== revision) return completion("ignored", operationRevision);
		publish(next);
		return completion("applied", operationRevision);
	};

	const run = async (
		action: CommandAction,
		draft: BrowserCommandDraft,
		threadId: ThreadId | null,
	): Promise<ThreadLinkActionCompletion> => {
		const pane = options.capturePane();
		revision += 1;
		const operationRevision = revision;
		let target: ThreadLinkActionTarget | null = null;
		try {
			// Captured once, here. Nothing downstream reads the pane again, so a
			// focus change after this point cannot move where the command lands.
			const captured = pane.transport.captureCommandTarget();
			target = captureTarget(pane, captured, threadId);
			publish({
				state: "pending",
				revision: operationRevision,
				action,
				target,
				announcement: `${action.replace("_", " ")} started for pane ${target.paneId}.`,
			});
			if (!pane.transport.capabilities().supportsCommand(draft.command))
				return settle(operationRevision, {
					state: "failed",
					revision: operationRevision,
					action,
					target,
					announcement: `The workbench is not ready for ${draft.command}. It arrived before this pane reached the state that command needs.`,
					recovery: recoveryFor(pane, "not_ready"),
				});
			const result = await pane.transport.command(draft, captured);
			const settlement = classify(action, result, target);
			return settle(operationRevision, {
				state: settlement.state,
				revision: operationRevision,
				action,
				target,
				announcement: settlement.announcement,
				recovery: settlement.state === "succeeded" ? null : recoveryFor(pane, result.code ?? null),
			});
		} catch (error) {
			const resolved: ThreadLinkActionTarget =
				target ??
				Object.freeze({
					paneId: pane.paneId,
					childId: null,
					epoch: null,
					commandId: null,
					threadId,
					capturedLinkState: null,
					capturedLinkThreadId: null,
				});
			return settle(operationRevision, {
				state: uncertain(error) ? "inspect_only" : "failed",
				revision: operationRevision,
				action,
				target: resolved,
				announcement: uncertain(error)
					? `${errorMessage(error)} The outcome is unknown; inspect the current link and do not retry blind.`
					: errorMessage(error),
				recovery: recoveryFor(pane, errorCode(error)),
			});
		}
	};

	const bind = (row: ThreadLinkRow): Promise<ThreadLinkActionCompletion> => {
		const pane = options.capturePane();
		if (row.command === null || !row.enabled) {
			revision += 1;
			const operationRevision = revision;
			const target: ThreadLinkActionTarget = Object.freeze({
				paneId: pane.paneId,
				childId: null,
				epoch: null,
				commandId: null,
				threadId: row.threadId,
				capturedLinkState: null,
				capturedLinkThreadId: null,
			});
			return Promise.resolve(
				settle(operationRevision, {
					state: "failed",
					revision: operationRevision,
					action: row.intent === "relink" ? "relink" : "attach",
					target,
					announcement: row.blockedReason ?? "This row discloses no runnable thread-link command.",
					recovery: threadLinkRecovery(
						"refresh_inventory",
						pane.transport.capabilities(),
						pane.hostRecoveryIntents,
					),
				}),
			);
		}
		// The one-shot selection the host published names the exact row; the
		// thread id travels with it so a list the host has replaced is refused
		// rather than binding whatever now sits at that thread.
		return run(
			row.command === "threadLinkRelink" ? "relink" : "attach",
			{ command: row.command, selectionId: row.selectionId, threadId: row.threadId },
			row.threadId,
		);
	};

	const recover = async (
		intent: ThreadLinkControllerRecoveryIntent,
	): Promise<ThreadLinkActionCompletion> => {
		const pane = options.capturePane();
		revision += 1;
		const operationRevision = revision;
		const target: ThreadLinkRecoveryTarget = Object.freeze({ paneId: pane.paneId, intent });
		publish({
			state: "pending",
			revision: operationRevision,
			action: "recover",
			target,
			announcement: `${intent.replaceAll("_", " ")} started for pane ${target.paneId}.`,
		});
		try {
			if (intent === "refresh_snapshot") await pane.transport.refresh();
			else if (intent === "read_account") await pane.transport.accountRead();
			else {
				const authority = options.captureHostRecovery?.(target) ?? null;
				if (
					authority === null ||
					authority.paneId !== target.paneId ||
					authority.intent !== target.intent
				)
					return settle(operationRevision, {
						state: "failed",
						revision: operationRevision,
						action: "recover",
						target,
						announcement: `This pane has no ${intent.replaceAll("_", " ")} owner, so that recovery must be done where Codex runs.`,
						recovery: threadLinkRecovery(
							intent,
							pane.transport.capabilities(),
							pane.hostRecoveryIntents,
						),
					});
				await authority.recover();
			}
			return settle(operationRevision, {
				state: "succeeded",
				revision: operationRevision,
				action: "recover",
				target,
				announcement: `${intent.replaceAll("_", " ")} completed for pane ${target.paneId}.`,
				recovery: null,
			});
		} catch (error) {
			return settle(operationRevision, {
				state: uncertain(error) ? "inspect_only" : "failed",
				revision: operationRevision,
				action: "recover",
				target,
				announcement: errorMessage(error),
				recovery: recoveryFor(pane, errorCode(error)),
			});
		}
	};

	return Object.freeze({
		snapshot: () => published,
		subscribe: (listener: () => void): (() => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		create: () => run("create", { command: "threadLinkCreate" }, null),
		refreshInventory: () => run("refresh_inventory", { command: "threadLinkRefresh" }, null),
		bind,
		login: (login: ThreadLinkLoginParams) => run("login", { command: "accountLogin", login }, null),
		cancelLogin: (loginId: LoginId) =>
			run("cancel_login", { command: "accountLoginCancel", loginId }, null),
		logout: () => run("logout", { command: "accountLogout" }, null),
		recover,
	});
}
