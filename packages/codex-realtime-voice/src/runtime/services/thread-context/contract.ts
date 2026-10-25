import type { CodexEpochStore } from "#runtime/store/epoch/contract.ts";
import type { CodexSession } from "@archboard/codex-app-server/session";
import type {
	WorkbenchContextCodec,
	WorkbenchExecutionContext,
} from "#runtime/protocol/host/context.ts";
import type { ThreadInjectItemsParams } from "#runtime/rules/host/bodies.ts";
import type {
	CodexThreadLinkPort,
	ThreadLinkBindingSnapshot,
	ThreadLinkReasonCode,
	ThreadLinkTarget,
} from "#runtime/rules/thread-link/contract.ts";
import type {
	ChildEpoch,
	ChildId,
	IdentityAuthority,
	RealtimeSessionId,
	ThreadId,
} from "@archboard/codex-app-server/identity";

/** The one exact child capability a delivery is allowed to use. */
interface CodexThreadContextExecution {
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
}

/** A durable target captured by the workbench; this port never selects a thread. */
type CodexThreadContextTarget = ThreadLinkTarget & {
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly operationId: string;
};

type CodexThreadContextEventId = Readonly<{
	readonly feedId: string;
	readonly sequence: number;
}>;

/**
 * One announced change as one workhorse is told it: the host's words and data, and the
 * identities the agent read when the change was announced. The host supplies no identity.
 */
interface WorkhorseContextEvent {
	readonly feedId: string;
	readonly sequence: number;
	/** The thread that made the change, or null when nobody said. */
	readonly author: string | null;
	readonly capturedAtMs: number;
	readonly freshUntilMs: number;
	/** The words, or null when the host withheld them. */
	readonly text: string | null;
	/** Why the host withheld the words, or null. */
	readonly withheld: string | null;
	/** The host's own data, which the context codec encodes beside the execution facts. */
	readonly payload: Readonly<Record<string, unknown>>;
	readonly threadLink: WorkbenchExecutionContext["threadLink"];
	readonly child: { readonly id: ChildId | null; readonly epoch: ChildEpoch | null };
	readonly workhorse: { readonly threadId: ThreadId | null };
	readonly coordinator: {
		readonly threadId: ThreadId | null;
		readonly realtimeSessionId: RealtimeSessionId | null;
	};
}

/** Stable reasons retained when a context change is refused or its response is lost. */
type CodexThreadContextDeliveryReason =
	| ThreadLinkReasonCode
	| "child_exit"
	| "disposed"
	| "invalid_context"
	| "invalid_event"
	| "own_change"
	| "link_changed"
	| "response_lost"
	| "session_rejected"
	| "stale_cursor"
	| "stale_event"
	| "thread_revalidation_failed"
	| "unbound"
	/** The host told this workhorse nothing of the change. */
	| "withheld";

type CodexThreadContextDeliveryState = "delivered" | "not_delivered" | "outcome_unknown";

interface CodexThreadContextDeliveryOutcomeBase {
	readonly kind: "thread_context_delivery";
	readonly event: CodexThreadContextEventId;
	readonly attempted: boolean;
	readonly outcome: CodexThreadContextDeliveryState;
	readonly reason: CodexThreadContextDeliveryReason | null;
	/** The window in which the change was fresh. */
	readonly freshness: { readonly capturedAtMs: number; readonly freshUntilMs: number };
	/** The exact canonical body, when the body was built before refusal or attempt. */
	readonly payload: ThreadInjectItemsParams | null;
}

/** The immutable record for one change identity. */
type CodexThreadContextDeliveryOutcome =
	| (CodexThreadContextDeliveryOutcomeBase & {
			readonly linkKey: string;
			readonly targetThreadId: ThreadId;
			readonly targetChildId: ChildId;
			readonly targetEpoch: ChildEpoch;
			readonly targetOperationId: string;
	  })
	| (CodexThreadContextDeliveryOutcomeBase & {
			readonly linkKey: null;
			readonly targetThreadId: null;
			readonly targetChildId: null;
			readonly targetEpoch: null;
			readonly targetOperationId: null;
			readonly attempted: false;
			readonly outcome: "not_delivered";
			readonly reason: "unbound" | "disposed";
			readonly payload: null;
	  });

interface CodexThreadContextDeliveryOptions {
	readonly linkKey: string;
	/**
	 * The threads whose writes are this session's own: the workhorse this port
	 * serves, and the coordinator paired with it.
	 *
	 * Used for one thing — skipping the news this session wrote itself — and it
	 * is a thread rather than a surface or a turn. A thread that goes on being
	 * the same thread is the same session, so a write that lands after the turn
	 * that made it is still its own; a new conversation or a new session is a new
	 * thread and a new author, which is the renewal the rule asks for.
	 *
	 * Both threads, because the pair is one session as far as a person talking
	 * to it is concerned: neither is told about the other's writes. Empty for a
	 * port with nothing to compare, which then hears everything.
	 *
	 * Asked at the moment of delivery rather than when the port was built. A
	 * coordinator is created, restarted and retired inside one workhorse's life,
	 * so a value sampled once would miss the pair it was meant to recognise —
	 * and New conversation makes a new workhorse thread under the same port.
	 */
	readonly sessionAuthors?: () => readonly string[];
	/** The clock used by the final synchronous freshness gate before injection. */
	readonly now: () => number;
	readonly session: Pick<CodexSession, "threadInjectItems">;
	readonly threadLink: Pick<CodexThreadLinkPort, "read" | "classify">;
	readonly target: CodexThreadContextTarget;
	readonly identity: IdentityAuthority;
	readonly epoch: Pick<CodexEpochStore, "assertCurrent">;
	readonly currentExecution: () => CodexThreadContextExecution | null;
	readonly contextCodec: WorkbenchContextCodec;
}

interface CodexThreadContextDelivery {
	/** Deliver a change once: the same change again answers with its first outcome. */
	readonly deliver: (event: WorkhorseContextEvent) => Promise<CodexThreadContextDeliveryOutcome>;
	/** Settled outcomes in first-seen order. */
	readonly inspect: () => readonly CodexThreadContextDeliveryOutcome[];
	readonly get: (event: CodexThreadContextEventId) => CodexThreadContextDeliveryOutcome | undefined;
	readonly dispose: () => void;
}

interface CodexThreadContextBinding {
	readonly linkKey: string;
	readonly target: CodexThreadContextTarget;
	/** Exact link CAS evidence captured by the target-selection action. */
	readonly link: ThreadLinkBindingSnapshot;
}

interface CodexThreadContextBindingToken {
	readonly revision: number;
}

interface CodexThreadContextBindingSnapshot {
	readonly token: CodexThreadContextBindingToken;
	readonly binding: CodexThreadContextBinding | null;
}

interface CodexThreadContextBindingTransition {
	readonly expected: CodexThreadContextBindingToken;
	readonly next: CodexThreadContextBinding | null;
}

type CodexThreadContextControllerErrorCode =
	| "disposed"
	| "stale_binding"
	| "duplicate_binding"
	| "invalid_binding";

class CodexThreadContextControllerError extends Error {
	override readonly name = "CodexThreadContextControllerError";

	/**
	 * Names the controller rule that refused the call.
	 * @param code - The stable rule identifier callers branch on.
	 * @param message - The human-readable explanation.
	 * @param cause - The underlying failure, when an authority check threw.
	 */
	constructor(
		readonly code: CodexThreadContextControllerErrorCode,
		message: string,
		override readonly cause?: unknown,
	) {
		super(message);
	}
}

interface CodexThreadContextControllerOptions extends Omit<
	CodexThreadContextDeliveryOptions,
	"linkKey" | "target" | "sessionAuthors"
> {
	/**
	 * The thread paired with the workhorse this controller serves, when the server
	 * has one: the coordinator of the same session.
	 *
	 * Asked for rather than remembered, because a coordinator comes and goes
	 * within one workhorse's life. Its only use is that the pair does not hear
	 * each other's changes — they are one session to the person talking to
	 * them. A server with no coordinator returns null and nothing changes.
	 */
	readonly pairedThreadId?: () => string | null;
	/** Retire the exact child epoch after execution has been made unavailable. */
	readonly retireEpoch: (child: ChildId, epoch: ChildEpoch) => Promise<void> | void;
}

/** One process-lifetime subscription and event ledger over replaceable exact bindings. */
interface CodexThreadContextController extends CodexThreadContextDelivery {
	readonly snapshot: () => CodexThreadContextBindingSnapshot;
	readonly compareAndSwap: (
		transition: CodexThreadContextBindingTransition,
	) => CodexThreadContextBindingSnapshot;
	/** Null execution first, then clear the matching epoch and dispose the owner. */
	readonly childExit: (child: ChildId, epoch: ChildEpoch) => Promise<void>;
}

export {
	type CodexThreadContextExecution,
	type CodexThreadContextTarget,
	type CodexThreadContextEventId,
	type WorkhorseContextEvent,
	type CodexThreadContextDeliveryReason,
	type CodexThreadContextDeliveryState,
	type CodexThreadContextDeliveryOutcome,
	type CodexThreadContextDeliveryOptions,
	type CodexThreadContextDelivery,
	type CodexThreadContextBinding,
	type CodexThreadContextBindingToken,
	type CodexThreadContextBindingSnapshot,
	type CodexThreadContextBindingTransition,
	type CodexThreadContextControllerErrorCode,
	CodexThreadContextControllerError,
	type CodexThreadContextControllerOptions,
	type CodexThreadContextController,
};
