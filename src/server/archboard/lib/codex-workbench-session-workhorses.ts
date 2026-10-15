// The workhorses of one tab session (ADR 0050).
//
// A tab session has one workhorse for each checkout it works in. A workhorse runs in its checkout,
// so it reads that repository's agent instructions, skills and Codex configuration. Each one has
// its own thread link, keyed by the tab session and the checkout, its own queue, its own
// operations and its own board-change delivery. A workhorse is built the first time something
// asks for its checkout: a pane of that checkout, or the coordinator giving it work.
//
// A workhorse belongs to a checkout, not to a repository identity, so a new chosen checkout of its
// identity leaves it as it is. The panes that move to the new checkout show that checkout's
// workhorse, and the one they left stays linked until its tab session ends.

import type { TransportServerNotification } from "@/runtime/codex-transport";
import type { SemanticContextPublisher } from "@/runtime/codex-semantic-context";
import type { CodexSession } from "@/runtime/codex-session";
import type { CodexThreadContextController } from "@/runtime/codex-thread-context";
import type { CodexWorkhorseOperations } from "@/runtime/codex-workhorse-operations";
import type { CodexWorkhorseQueue } from "@/runtime/codex-workhorse-queue";
import type { CodexWorkhorseStart } from "@/runtime/codex-workhorse-start";
import type {
	OperationId,
	ThreadId,
	TrustedIdentityDecoder,
	TurnId,
} from "@/shared/codex-workbench-identity";
import type { BrowserThreadLinkActions, CodexQueueProjectionInput } from "@/server/codex-workbench";

/** The runtime owners one workhorse runs on. */
interface CodexWorkbenchWorkhorseComponents {
	readonly workhorse: CodexWorkhorseStart;
	/** Publishes the changes of the boards of this workhorse's checkout, as this workhorse is told. */
	readonly semanticPublisher: SemanticContextPublisher;
	readonly semanticDelivery: CodexThreadContextController;
	readonly queue: CodexWorkhorseQueue<OperationId>;
	readonly operations: CodexWorkhorseOperations;
}

/** What starts a workhorse's conversation. */
interface CodexWorkbenchWorkhorseActions {
	/** New conversation from a pane of the checkout: a fresh thread for this workhorse. */
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
	if (notification.method === "turn/completed") {
		const running = workhorse.state.activeTurn;
		if (
			running !== null &&
			decoder.serializeCodexIdentity(running.threadId) === notification.params.threadId
		) {
			workhorse.state.activeTurn = null;
		}
		return;
	}
	if (notification.method !== "turn/started") {
		return;
	}
	const threadId = workhorse.components.workhorse.snapshot().threadId;
	if (
		threadId !== null &&
		decoder.serializeCodexIdentity(threadId) === notification.params.threadId
	) {
		workhorse.state.activeTurn = {
			threadId,
			turnId: decoder.adoptTurnId(notification.params.turn.id),
		};
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
