// The workhorses of one tab session (ADR 0050).
//
// A tab session has one workhorse for each checkout it works in. A workhorse runs in its checkout,
// so it reads that repository's agent instructions, skills and Codex configuration. Each one has
// its own thread link, keyed by the tab session and the checkout, its own queue, its own
// operations and its own delivery of context changes. A workhorse is built the first time something
// asks for its checkout: the tab's shown conversation, or the coordinator giving it work.
//
// A workhorse belongs to a checkout, not to a repository identity, so a new chosen checkout of its
// identity leaves it as it is, linked until its tab session ends.

import type { TransportServerNotification } from "@archboard/codex-app-server/transport";
import type { CodexSession } from "@archboard/codex-app-server/session";
import type { CodexThreadContextController } from "#runtime/services/thread-context/contract.ts";
import type { CodexWorkhorseOperations } from "#runtime/protocol/workhorse-operations/contract.ts";
import type { CodexWorkhorseStart } from "#runtime/protocol/workhorse-start/contract.ts";
import type { CodexWorkhorseQueue } from "#runtime/services/workhorse-queue/contract.ts";
import type {
	OperationId,
	ThreadId,
	TrustedIdentityDecoder,
	TurnId,
} from "@archboard/codex-app-server/identity";
import type { BrowserThreadLinkActions } from "#server/protocol/gateway/contract.ts";
import type { CodexQueueProjectionInput } from "#server/protocol/projection/projection-contract.ts";

/** The runtime owners one workhorse runs on. */
interface CodexWorkbenchWorkhorseComponents {
	readonly workhorse: CodexWorkhorseStart;
	readonly contextDelivery: CodexThreadContextController;
	readonly queue: CodexWorkhorseQueue<OperationId>;
	readonly operations: CodexWorkhorseOperations;
}

/** What starts a workhorse's conversation. */
interface CodexWorkbenchWorkhorseActions {
	/** New conversation from a chat of the checkout: a fresh thread for this workhorse. */
	readonly threadLinks: BrowserThreadLinkActions;
	/** Start this workhorse's thread when it has none that can run turns, as delegation does. */
	readonly ensureStarted: () => Promise<void>;
}

/** What the server remembers about one workhorse between the reads that fill it in. */
interface CodexWorkbenchWorkhorseState {
	/** The last authoritative queue listing. */
	queue: CodexQueueProjectionInput;
	/** The workhorse thread that listing was read for. */
	queueThreadId: ThreadId | null;
	/** The turn running on the workhorse's thread, as Codex last said, or null while none runs. */
	activeTurn: { readonly threadId: ThreadId; readonly turnId: TurnId } | null;
}

/** One workhorse of a tab session: the one for one checkout. */
interface CodexWorkbenchWorkhorse {
	/** The directory it works in: a checkout root, or the holder of an untracked vault. */
	readonly checkout: string;
	/** Its thread-link key, which no other workhorse shares. */
	readonly key: string;
	readonly components: CodexWorkbenchWorkhorseComponents;
	readonly actions: CodexWorkbenchWorkhorseActions;
	readonly state: CodexWorkbenchWorkhorseState;
}

/** What one stop did to one workhorse. */
interface WorkhorseStop {
	readonly checkout: string;
	/** Interrupted names a turn that was running; idle says none was. */
	readonly outcome: "interrupted" | "idle";
}

/**
 * A workhorse's state before anything was read into it.
 * @returns The state.
 */
function freshWorkhorseState(): CodexWorkbenchWorkhorseState {
	return {
		queue: { kind: "codex_queue", submissions: null },
		queueThreadId: null,
		activeTurn: null,
	};
}

/**
 * Whether a thread is the one Codex names, as Codex spells it.
 * @param threadId The thread, or null.
 * @param wire The thread as Codex names it.
 * @param decoder Names threads as Codex spells them.
 * @returns True when they are the same thread.
 */
function namesThread(
	threadId: ThreadId | null,
	wire: string,
	decoder: Pick<TrustedIdentityDecoder, "serializeCodexIdentity">,
): threadId is ThreadId {
	return threadId !== null && decoder.serializeCodexIdentity(threadId) === wire;
}

/**
 * The turn still running once a turn ended on a thread.
 * @param running The turn that was running, or null.
 * @param wire The thread the turn ended on, as Codex names it.
 * @param decoder Names threads as Codex spells them.
 * @returns Null when the running turn was on that thread, else the running turn.
 */
function endedOn(
	running: CodexWorkbenchWorkhorseState["activeTurn"],
	wire: string,
	decoder: Pick<TrustedIdentityDecoder, "serializeCodexIdentity">,
): CodexWorkbenchWorkhorseState["activeTurn"] {
	return running !== null && namesThread(running.threadId, wire, decoder) ? null : running;
}

/**
 * Keep the turn running on a workhorse's thread from the turn notifications Codex sends about it.
 * A turn starts on the thread the workhorse runs on now, and ends on the thread it started on,
 * which New conversation may have left meanwhile.
 * @param workhorse The workhorse.
 * @param event A notification.
 * @param decoder Names threads and turns as Codex spells them.
 */
function noteActiveTurn(
	workhorse: CodexWorkbenchWorkhorse,
	event: TransportServerNotification,
	decoder: Pick<TrustedIdentityDecoder, "serializeCodexIdentity" | "adoptTurnId">,
): void {
	const { notification } = event;
	const { state } = workhorse;
	if (notification.method === "turn/completed") {
		state.activeTurn = endedOn(state.activeTurn, notification.params.threadId, decoder);
		return;
	}
	if (notification.method !== "turn/started") {
		return;
	}
	const { threadId } = workhorse.components.workhorse.snapshot();
	if (namesThread(threadId, notification.params.threadId, decoder)) {
		state.activeTurn = { threadId, turnId: decoder.adoptTurnId(notification.params.turn.id) };
	}
}

/**
 * Stop what workhorses are running: interrupt the turn each one runs, and say what each did. A
 * workhorse with no running turn has nothing to interrupt. TASK-446 makes this the stop of the
 * whole work tree that ADR 0048 describes.
 * @param workhorses The workhorses to stop.
 * @param session Interrupts a turn.
 * @returns What each one did, in the order given.
 */
async function stopWorkhorses(
	workhorses: readonly CodexWorkbenchWorkhorse[],
	session: Pick<CodexSession, "turnInterrupt">,
): Promise<readonly WorkhorseStop[]> {
	return Promise.all(
		workhorses.map(async ({ checkout, state }): Promise<WorkhorseStop> => {
			const running = state.activeTurn;
			if (running === null) {
				return { checkout, outcome: "idle" };
			}
			await session.turnInterrupt({ threadId: running.threadId, turnId: running.turnId });
			return { checkout, outcome: "interrupted" };
		}),
	);
}

export { freshWorkhorseState, noteActiveTurn, stopWorkhorses };
export type {
	CodexWorkbenchWorkhorse,
	CodexWorkbenchWorkhorseActions,
	CodexWorkbenchWorkhorseComponents,
	CodexWorkbenchWorkhorseState,
	WorkhorseStop,
};
