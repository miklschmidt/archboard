// The thread-link action controller: one action at a time, each captured
// once against the pane it was offered on, so a focus change after that
// point cannot move where the command lands. A superseded action never
// overwrites the action that replaced it.

import type { BrowserThreadLink } from "@/shared/codex-browser-model";
import type { LoginId, ThreadId } from "@/shared/codex-workbench-identity";
import type {
	ThreadLinkActionCompletion,
	ThreadLinkActionSnapshot,
	ThreadLinkActionTarget,
	ThreadLinkController,
	ThreadLinkControllerOptions,
	ThreadLinkControllerRecoveryIntent,
	ThreadLinkInventory,
	ThreadLinkPaneCapture,
	ThreadLinkRecoveryTarget,
	ThreadLinkRow,
} from "@/ui/workbench-thread-link/contracts";
import { projectThreadLinkSelection } from "@/ui/workbench-thread-link/lib/candidates";
import { threadLinkRecovery } from "@/ui/workbench-thread-link/lib/recovery";
import {
	classify,
	recoveryFor,
	words,
	type CommandAction,
} from "@/ui/workbench-thread-link/lib/settlement";
import {
	errorMessage,
	transportErrorFacts,
	uncertain,
} from "@/ui/workbench-thread-link/lib/transport-errors";
import type {
	ThreadLinkCommandDraft,
	ThreadLinkLoginParams,
	WorkbenchCommandIntent,
} from "@/ui/workbench-thread-link/transport-port";

type Settled = Exclude<ThreadLinkActionSnapshot, { readonly state: "idle" | "pending" }>;

const UNKNOWN_CANDIDATES: ThreadLinkInventory = Object.freeze({
	kind: "thread_candidates",
	state: "unknown",
	records: [],
	truncated: false,
	reason: null,
});

const UNBOUND_LINK: BrowserThreadLink = Object.freeze({
	kind: "thread_link",
	state: "unbound",
	childId: null,
	epoch: null,
	threadId: null,
	sourcePresentation: null,
	status: "notLoaded",
	loaded: false,
	canAcceptDirectInput: false,
	reason: null,
});

const NO_UNLINK_COMMAND =
	"The browser contract publishes no thread-link unbind command, so this pane keeps its link. Choose another conversation to relink, or start a new agent.";

/**
 * The target of an action, captured once.
 * @param pane The pane.
 * @param captured The captured intent.
 * @param threadId The thread the action names, or null.
 * @returns The target.
 */
function captureTarget(
	pane: ThreadLinkPaneCapture,
	captured: WorkbenchCommandIntent,
	threadId: ThreadId | null,
): ThreadLinkActionTarget {
	return Object.freeze({
		paneId: pane.paneId,
		childId: captured.authority?.childId ?? null,
		epoch: captured.authority?.epoch ?? null,
		// The action has not acquired its own command identity yet.
		commandId: null,
		threadId,
		capturedLinkState: captured.capturedThreadLink.state,
		capturedLinkThreadId: captured.capturedThreadLink.threadId,
	});
}

/**
 * A target for an action the workbench refused to hand a target to.
 * @param paneId The pane.
 * @param threadId The thread the action names, or null.
 * @returns The target.
 */
function bareTarget(paneId: string, threadId: ThreadId | null): ThreadLinkActionTarget {
	return Object.freeze({
		paneId,
		childId: null,
		epoch: null,
		commandId: null,
		threadId,
		capturedLinkState: null,
		capturedLinkThreadId: null,
	});
}

/**
 * The announcement of a pending action.
 * @param action The action.
 * @param paneId The pane.
 * @returns The words.
 */
function pendingWords(action: CommandAction, paneId: string): string {
	return action === "login" ? "Starting sign-in…" : `${words(action)} started for pane ${paneId}.`;
}

/**
 * The thread-link action controller.
 * @param options How it reaches its pane.
 * @returns The controller.
 */
function createThreadLinkController(options: ThreadLinkControllerOptions): ThreadLinkController {
	let revision = 0;
	let published: ThreadLinkActionSnapshot = Object.freeze({ state: "idle", revision });
	const listeners = new Set<() => void>();

	/**
	 * Publish one snapshot. A rendering subscriber never changes settlement.
	 * @param next The snapshot.
	 */
	function publish(next: ThreadLinkActionSnapshot): void {
		published = Object.freeze(next);
		for (const listener of listeners) {
			try {
				listener();
			} catch {
				// A subscriber's own failure is its own; the settlement stands.
			}
		}
	}

	/**
	 * Settle one action, unless a later action superseded it.
	 * @param operationRevision The action's revision.
	 * @param next The settled snapshot.
	 * @returns Whether the settlement was published.
	 */
	function settle(
		operationRevision: number,
		next: Settled | Extract<ThreadLinkActionSnapshot, { readonly state: "idle" }>,
	): ThreadLinkActionCompletion {
		if (operationRevision !== revision) {
			return Object.freeze({ state: "ignored", revision: operationRevision });
		}
		publish(next);
		return Object.freeze({ state: "applied", revision: operationRevision });
	}

	/**
	 * A fresh revision, superseding every earlier action.
	 * @returns The revision.
	 */
	function nextRevision(): number {
		revision += 1;
		return revision;
	}

	/**
	 * Dispatch one captured command and classify its result.
	 * @param pane The pane.
	 * @param action The action.
	 * @param draft The draft.
	 * @param target The captured target.
	 * @param captured The captured intent.
	 * @returns The settled snapshot.
	 */
	async function dispatch(
		pane: ThreadLinkPaneCapture,
		action: CommandAction,
		draft: ThreadLinkCommandDraft,
		target: ThreadLinkActionTarget,
		captured: WorkbenchCommandIntent,
	): Promise<Settled> {
		if (!pane.transport.capabilities().supportsCommand(draft.command)) {
			return {
				state: "failed",
				revision,
				action,
				target,
				announcement: `The workbench is not ready for ${draft.command}. It arrived before this pane reached the state that command needs.`,
				recovery: recoveryFor(pane, "not_ready"),
			};
		}
		const result = await pane.transport.executeCommand(draft, captured);
		const settledTarget = Object.freeze({ ...target, commandId: result.commandId });
		const settlement = classify(action, result, settledTarget);
		return {
			state: settlement.state,
			revision,
			action,
			target: settledTarget,
			announcement: settlement.announcement,
			recovery: settlement.state === "succeeded" ? null : recoveryFor(pane, result.code),
		};
	}

	/**
	 * The settled snapshot of a thrown command.
	 * @param pane The pane.
	 * @param action The action.
	 * @param target The target, as far as it was captured.
	 * @param error The thrown value.
	 * @returns The settled snapshot.
	 */
	function thrown(
		pane: ThreadLinkPaneCapture,
		action: CommandAction,
		target: ThreadLinkActionTarget,
		error: unknown,
	): Settled {
		const unknown = uncertain(error);
		return {
			state: unknown ? "inspect_only" : "failed",
			revision,
			action,
			target,
			announcement: unknown
				? `${errorMessage(error)} The outcome is unknown; inspect the current link and do not retry blind.`
				: errorMessage(error),
			recovery: recoveryFor(pane, transportErrorFacts(error)?.code ?? null),
		};
	}

	/**
	 * Run one command against the pane captured now.
	 * @param action The action.
	 * @param draft The draft.
	 * @param threadId The thread the action names, or null.
	 * @returns Whether the settlement was published.
	 */
	async function run(
		action: CommandAction,
		draft: ThreadLinkCommandDraft,
		threadId: ThreadId | null,
	): Promise<ThreadLinkActionCompletion> {
		const pane = options.capturePane();
		const operationRevision = nextRevision();
		let target = bareTarget(pane.paneId, threadId);
		try {
			// Captured once, here. Nothing downstream reads the pane again.
			const captured = pane.transport.captureCommandIntent();
			target = captureTarget(pane, captured, threadId);
			publish({
				state: "pending",
				revision: operationRevision,
				action,
				target,
				announcement: pendingWords(action, target.paneId),
			});
			const settled = await dispatch(pane, action, draft, target, captured);
			return settle(operationRevision, { ...settled, revision: operationRevision });
		} catch (error) {
			return settle(operationRevision, {
				...thrown(pane, action, target, error),
				revision: operationRevision,
			});
		}
	}

	/**
	 * Refuse one action before the wire.
	 * @param action The action.
	 * @param threadId The thread it named, or null.
	 * @param announcement Why.
	 * @returns Whether the refusal was published.
	 */
	function refuse(
		action: "attach" | "relink" | "unlink",
		threadId: ThreadId | null,
		announcement: string,
	): Promise<ThreadLinkActionCompletion> {
		const pane = options.capturePane();
		const operationRevision = nextRevision();
		return Promise.resolve(
			settle(operationRevision, {
				state: "failed",
				revision: operationRevision,
				action,
				target: bareTarget(pane.paneId, threadId),
				announcement,
				recovery: threadLinkRecovery(
					"refresh_inventory",
					pane.transport.capabilities(),
					pane.hostRecoveryIntents,
				),
			}),
		);
	}

	/**
	 * Bind one row. The one-shot selection the host published names the exact
	 * row; the thread id travels with it so a list the host has replaced is
	 * refused rather than binding whatever now sits at that thread.
	 * @param row The row.
	 * @returns Whether the settlement was published.
	 */
	function bind(row: ThreadLinkRow): Promise<ThreadLinkActionCompletion> {
		const action = row.intent === "relink" ? "relink" : "attach";
		if (row.command === null || !row.enabled) {
			return refuse(
				action,
				row.threadId,
				row.blockedReason ?? "This row discloses no runnable thread-link command.",
			);
		}
		return run(
			action,
			{ command: row.command, selectionId: row.selectionId, threadId: row.threadId },
			row.threadId,
		);
	}

	/**
	 * Bind the row the host listed under one selection id, as the pane sees
	 * its inventory now.
	 * @param selectionId The one-shot selection.
	 * @returns Whether the settlement was published.
	 */
	function bindSelection(selectionId: string): Promise<ThreadLinkActionCompletion> {
		const pane = options.capturePane();
		const snapshot = pane.transport.state().snapshot;
		const selection = projectThreadLinkSelection({
			inventory: snapshot?.threadCandidates ?? UNKNOWN_CANDIDATES,
			currentLink: snapshot?.threadLink ?? UNBOUND_LINK,
			capabilities: pane.transport.capabilities(),
		});
		const row = selection.rows.find((candidate) => candidate.selectionId === selectionId);
		if (row === undefined) {
			return refuse("attach", null, "That conversation is no longer in the host's list.");
		}
		return bind(row);
	}

	/**
	 * Run one host-owned recovery against the captured pane and intent.
	 * @param pane The pane.
	 * @param target The recovery target.
	 * @returns Null when it ran, else the failed snapshot.
	 */
	async function hostRecovery(
		pane: ThreadLinkPaneCapture,
		target: ThreadLinkRecoveryTarget,
	): Promise<Settled | null> {
		const authority = options.captureHostRecovery?.(target) ?? null;
		const owned =
			authority !== null &&
			authority.paneId === target.paneId &&
			authority.intent === target.intent;
		if (!owned) {
			return {
				state: "failed",
				revision,
				action: "recover",
				target,
				announcement: `This pane has no ${target.intent.replaceAll("_", " ")} owner, so that recovery must be done where Codex runs.`,
				recovery: threadLinkRecovery(
					target.intent,
					pane.transport.capabilities(),
					pane.hostRecoveryIntents,
				),
			};
		}
		await authority.recover();
		return null;
	}

	/**
	 * Perform one recovery the controller owns.
	 * @param pane The pane.
	 * @param target The recovery target.
	 * @returns Null when it ran, else the failed snapshot.
	 */
	async function performRecovery(
		pane: ThreadLinkPaneCapture,
		target: ThreadLinkRecoveryTarget,
	): Promise<Settled | null> {
		if (target.intent === "refresh_snapshot") {
			await pane.transport.refresh();
			return null;
		}
		if (target.intent === "read_account") {
			await pane.transport.accountRead();
			return null;
		}
		return hostRecovery(pane, target);
	}

	/**
	 * Run one recovery.
	 * @param intent The intent.
	 * @returns Whether the settlement was published.
	 */
	async function recover(
		intent: ThreadLinkControllerRecoveryIntent,
	): Promise<ThreadLinkActionCompletion> {
		const pane = options.capturePane();
		const operationRevision = nextRevision();
		const target: ThreadLinkRecoveryTarget = Object.freeze({ paneId: pane.paneId, intent });
		const spoken = intent.replaceAll("_", " ");
		publish({
			state: "pending",
			revision: operationRevision,
			action: "recover",
			target,
			announcement: `${spoken} started for pane ${target.paneId}.`,
		});
		try {
			const failed = await performRecovery(pane, target);
			const settled = failed ?? recovered(target, spoken);
			return settle(operationRevision, { ...settled, revision: operationRevision });
		} catch (error) {
			return settle(operationRevision, {
				state: uncertain(error) ? "inspect_only" : "failed",
				revision: operationRevision,
				action: "recover",
				target,
				announcement: errorMessage(error),
				recovery: recoveryFor(pane, transportErrorFacts(error)?.code ?? null),
			});
		}
	}

	/**
	 * The snapshot of a recovery that ran: a refresh returns to idle, the rest
	 * announce completion.
	 * @param target The recovery target.
	 * @param spoken The intent in words.
	 * @returns The snapshot.
	 */
	function recovered(
		target: ThreadLinkRecoveryTarget,
		spoken: string,
	): Settled | Extract<ThreadLinkActionSnapshot, { readonly state: "idle" }> {
		if (target.intent === "refresh_snapshot") {
			return { state: "idle", revision };
		}
		return {
			state: "succeeded",
			revision,
			action: "recover",
			target,
			announcement: `${spoken} completed for pane ${target.paneId}.`,
			recovery: null,
		};
	}

	return Object.freeze({
		/**
		 * The published action.
		 * @returns The snapshot.
		 */
		snapshot: (): ThreadLinkActionSnapshot => published,
		/**
		 * Follow the published action.
		 * @param listener Notified on every publish.
		 * @returns Release the subscription.
		 */
		subscribe: (listener: () => void): (() => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		/**
		 * Create a fresh workhorse.
		 * @returns Whether the settlement was published.
		 */
		create: () => run("create", { command: "threadLinkCreate" }, null),
		bind,
		bindSelection,
		/**
		 * Ask to drop the explicit link.
		 * @returns Whether the refusal was published.
		 */
		unlink: () => refuse("unlink", null, NO_UNLINK_COMMAND),
		/**
		 * Ask the host to rediscover its inventory.
		 * @returns Whether the settlement was published.
		 */
		refreshInventory: () => run("refresh_inventory", { command: "threadLinkRefresh" }, null),
		/**
		 * Start one sign-in.
		 * @param login The vendor login value.
		 * @returns Whether the settlement was published.
		 */
		login: (login: ThreadLinkLoginParams) => run("login", { command: "accountLogin", login }, null),
		/**
		 * Cancel one pending sign-in.
		 * @param loginId The sign-in.
		 * @returns Whether the settlement was published.
		 */
		cancelLogin: (loginId: LoginId) =>
			run("cancel_login", { command: "accountLoginCancel", loginId }, null),
		/**
		 * Sign out.
		 * @returns Whether the settlement was published.
		 */
		logout: () => run("logout", { command: "accountLogout" }, null),
		recover,
	});
}

export { createThreadLinkController };
