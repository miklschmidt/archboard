// The thread-link action controller: one action at a time, each captured
// once against the chat it was offered on, so a focus change after that
// point cannot move where the command lands. A superseded action never
// overwrites the action that replaced it.

import type { LoginId } from "@archboard/codex-app-server/identity";
import type {
	ThreadLinkActionCompletion,
	ThreadLinkActionName,
	ThreadLinkActionSnapshot,
	ThreadLinkActionTarget,
	ThreadLinkController,
	ThreadLinkControllerOptions,
	ThreadLinkChatCapture,
} from "#ui/state/thread-link/contracts.ts";
import { classify, words } from "#ui/rules/thread-link/settlement.ts";
import { errorMessage, uncertain } from "#ui/rules/thread-link/transport-errors.ts";
import type {
	ThreadLinkCommandDraft,
	ThreadLinkLoginParams,
	WorkbenchCommandIntent,
} from "#ui/state/thread-link/transport-port.ts";

type Settled = Exclude<ThreadLinkActionSnapshot, { readonly state: "idle" | "pending" }>;

/**
 * The target of an action, captured once.
 * @param chat The chat.
 * @param captured The captured intent.
 * @returns The target.
 */
function captureTarget(
	chat: ThreadLinkChatCapture,
	captured: WorkbenchCommandIntent,
): ThreadLinkActionTarget {
	return Object.freeze({
		chatId: chat.chatId,
		childId: captured.authority?.childId ?? null,
		epoch: captured.authority?.epoch ?? null,
		// The action has not acquired its own command identity yet.
		commandId: null,
		capturedLinkState: captured.capturedThreadLink.state,
		capturedLinkThreadId: captured.capturedThreadLink.threadId,
	});
}

/**
 * A target for an action the workbench refused to hand a target to.
 * @param chatId The chat.
 * @returns The target.
 */
function bareTarget(chatId: string): ThreadLinkActionTarget {
	return Object.freeze({
		chatId,
		childId: null,
		epoch: null,
		commandId: null,
		capturedLinkState: null,
		capturedLinkThreadId: null,
	});
}

/**
 * The announcement of a pending action.
 * @param action The action.
 * @param chatId The chat.
 * @returns The words.
 */
function pendingWords(action: ThreadLinkActionName, chatId: string): string {
	return action === "login" ? "Starting sign-in…" : `${words(action)} started for chat ${chatId}.`;
}

/**
 * The thread-link action controller.
 * @param options How it reaches its chat.
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
	function settle(operationRevision: number, next: Settled): ThreadLinkActionCompletion {
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
	 * @param chat The chat.
	 * @param action The action.
	 * @param draft The draft.
	 * @param target The captured target.
	 * @param captured The captured intent.
	 * @returns The settled snapshot.
	 */
	async function dispatch(
		chat: ThreadLinkChatCapture,
		action: ThreadLinkActionName,
		draft: ThreadLinkCommandDraft,
		target: ThreadLinkActionTarget,
		captured: WorkbenchCommandIntent,
	): Promise<Settled> {
		if (!chat.transport.capabilities().supportsCommand(draft.command)) {
			return {
				state: "failed",
				revision,
				action,
				target,
				announcement: `The workbench is not ready for ${draft.command}. It arrived before this chat reached the state that command needs.`,
			};
		}
		const result = await chat.transport.executeCommand(draft, captured);
		const settledTarget = Object.freeze({ ...target, commandId: result.commandId });
		const settlement = classify(action, result, settledTarget);
		return {
			state: settlement.state,
			revision,
			action,
			target: settledTarget,
			announcement: settlement.announcement,
		};
	}

	/**
	 * The settled snapshot of a thrown command.
	 * @param action The action.
	 * @param target The target, as far as it was captured.
	 * @param error The thrown value.
	 * @returns The settled snapshot.
	 */
	function thrown(
		action: ThreadLinkActionName,
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
		};
	}

	/**
	 * Run one command against the chat captured now.
	 * @param action The action.
	 * @param draft The draft.
	 * @returns Whether the settlement was published.
	 */
	async function run(
		action: ThreadLinkActionName,
		draft: ThreadLinkCommandDraft,
	): Promise<ThreadLinkActionCompletion> {
		const chat = options.captureChat();
		const operationRevision = nextRevision();
		let target = bareTarget(chat.chatId);
		try {
			// Captured once, here. Nothing downstream reads the chat again.
			const captured = chat.transport.captureCommandIntent();
			target = captureTarget(chat, captured);
			publish({
				state: "pending",
				revision: operationRevision,
				action,
				target,
				announcement: pendingWords(action, target.chatId),
			});
			const settled = await dispatch(chat, action, draft, target, captured);
			return settle(operationRevision, { ...settled, revision: operationRevision });
		} catch (error) {
			return settle(operationRevision, {
				...thrown(action, target, error),
				revision: operationRevision,
			});
		}
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
		create: () => run("create", { command: "threadLinkCreate" }),
		/**
		 * Start one sign-in.
		 * @param login The vendor login value.
		 * @returns Whether the settlement was published.
		 */
		login: (login: ThreadLinkLoginParams) => run("login", { command: "accountLogin", login }),
		/**
		 * Cancel one pending sign-in.
		 * @param loginId The sign-in.
		 * @returns Whether the settlement was published.
		 */
		cancelLogin: (loginId: LoginId) =>
			run("cancel_login", { command: "accountLoginCancel", loginId }),
		/**
		 * Sign out.
		 * @returns Whether the settlement was published.
		 */
		logout: () => run("logout", { command: "accountLogout" }),
	});
}

export { createThreadLinkController };
