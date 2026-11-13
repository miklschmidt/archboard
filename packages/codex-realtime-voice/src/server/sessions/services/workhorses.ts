// The workhorses of one tab session.
//
// A tab session has one workhorse for each checkout it works in. A workhorse runs in its checkout,
// so it reads that repository's agent instructions, skills and Codex configuration. Each one has
// its own thread link, keyed by the tab session and the checkout, its own queue, its own
// operations and its own delivery of context changes. A workhorse is built the first time something
// asks for its checkout: the tab's shown conversation, or the coordinator giving it work.
//
// A workhorse belongs to a checkout, so it stays linked until its tab session ends.

import type { TransportServerNotification } from "@archboard/codex-app-server/transport";
import type { CodexThreadContextController } from "#runtime/workhorses/thread-context/services/contract.ts";
import type { CoordinatorToolStop } from "#runtime/voice/coordinator/tools-and-work/coordinator-tools/protocol/contract.ts";
import type { CodexWorkhorseOperations } from "#runtime/workhorses/workhorse-operations/protocol/contract.ts";
import type { CodexWorkhorseStart } from "#runtime/workhorses/workhorse-start/protocol/contract.ts";
import type { CodexWorkhorseQueue } from "#runtime/workhorses/workhorse-queue/services/contract.ts";
import type {
	OperationId,
	ThreadId,
	TrustedIdentityDecoder,
	TurnId,
} from "@archboard/codex-app-server/identity";
import type { BrowserThreadLinkActions } from "#server/chat-conversations/gateway/protocol/contract.ts";
import type { CodexQueueProjectionInput } from "#server/projection/protocol/projection-contract.ts";

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
	/** Where its last work tree stop stands, or null before any stop. */
	stop: WorkhorseStopPhase | null;
}

/** One workhorse of a tab session: the one for one checkout. */
interface CodexWorkbenchWorkhorse {
	/** The directory it works in: a checkout the host admitted. */
	readonly checkout: string;
	/** Its thread-link key, which no other workhorse shares. */
	readonly key: string;
	readonly components: CodexWorkbenchWorkhorseComponents;
	readonly actions: CodexWorkbenchWorkhorseActions;
	readonly state: CodexWorkbenchWorkhorseState;
}

/** One thread of a work tree that a stop could not show ended. */
interface RemainingWork {
	readonly threadId: ThreadId;
	/** Running: a turn still runs. Queued: a request still waits. Unread: Codex did not answer. */
	readonly state: CoordinatorToolStop["remaining"][number]["state"];
}

/**
 * What one stop observed of one workhorse's work tree: the workhorse thread and every sub-agent
 * it spawned. Stopped: all work that ran ended and no request waits. Idle: nothing ran or waited.
 * Partial: some work still runs or waits. Unconfirmed: nothing was seen running, but some thread
 * could not be read. Only stopped and idle prove that the work ended.
 */
interface WorkhorseStop {
	readonly checkout: string;
	readonly outcome: CoordinatorToolStop["outcome"];
	/** Each thread that still runs, waits or could not be read; empty when the stop ended all. */
	readonly remaining: readonly RemainingWork[];
}

/**
 * Where a workhorse's last stop stands. While it stops, and after a partial or unconfirmed stop,
 * it takes no new work. After a stop that ended everything, the coordinator turn that asked for
 * it starts no work, so only a fresh request does.
 */
type WorkhorseStopPhase =
	| { readonly kind: "stopping"; readonly done: Promise<WorkhorseStop> }
	| { readonly kind: "stopped"; readonly stop: WorkhorseStop; readonly askedBy: TurnId | null }
	| { readonly kind: "unresolved"; readonly stop: WorkhorseStop };

/**
 * A workhorse's state before anything was read into it.
 * @returns The state.
 */
function freshWorkhorseState(): CodexWorkbenchWorkhorseState {
	return {
		queue: { kind: "codex_queue", submissions: null },
		queueThreadId: null,
		activeTurn: null,
		stop: null,
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

export { freshWorkhorseState, noteActiveTurn };
export type {
	CodexWorkbenchWorkhorse,
	CodexWorkbenchWorkhorseActions,
	CodexWorkbenchWorkhorseComponents,
	CodexWorkbenchWorkhorseState,
	RemainingWork,
	WorkhorseStop,
	WorkhorseStopPhase,
};
