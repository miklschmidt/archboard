import type { CodexEpochStore } from "@/runtime/codex-epoch";
import type { CodexSession } from "@/runtime/codex-session";
import type { ArchboardContext, ThreadInjectItemsParams } from "@/runtime/codex-instructions";
import type {
	CodexThreadLinkPort,
	ThreadLinkBindingSnapshot,
	ThreadLinkReasonCode,
	ThreadLinkTarget,
} from "@/runtime/codex-thread-link";
import type {
	SemanticContextPublisher,
	SettledSemanticChangeEvent,
} from "@/runtime/codex-semantic-context";
import type {
	ChildEpoch,
	ChildId,
	IdentityAuthority,
	ThreadId,
} from "@/shared/codex-workbench-identity";

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

/** Stable reasons retained when a semantic event is refused or its response is lost. */
type CodexThreadContextDeliveryReason =
	| ThreadLinkReasonCode
	| "agent_only"
	| "child_exit"
	| "cosmetic"
	| "disposed"
	| "invalid_context"
	| "invalid_event"
	| "link_changed"
	| "response_lost"
	| "session_rejected"
	| "stale_cursor"
	| "stale_event"
	| "thread_revalidation_failed"
	| "unbound";

type CodexThreadContextDeliveryState = "delivered" | "not_delivered" | "outcome_unknown";

interface CodexThreadContextDeliveryOutcomeBase {
	readonly kind: "thread_context_delivery";
	readonly event: CodexThreadContextEventId;
	readonly attempted: boolean;
	readonly outcome: CodexThreadContextDeliveryState;
	readonly reason: CodexThreadContextDeliveryReason | null;
	/** The exact canonical body, when the body was built before refusal or attempt. */
	readonly payload: ThreadInjectItemsParams | null;
}

/** The immutable record for one semantic event identity. */
type CodexThreadContextDeliveryOutcome =
	| (CodexThreadContextDeliveryOutcomeBase & {
			readonly paneId: string;
			readonly targetThreadId: ThreadId;
			readonly targetChildId: ChildId;
			readonly targetEpoch: ChildEpoch;
			readonly targetOperationId: string;
	  })
	| (CodexThreadContextDeliveryOutcomeBase & {
			readonly paneId: null;
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
	readonly paneId: string;
	/** The feed identity is fixed for this delivery port; old feeds are stale. */
	readonly feedId: string;
	/** The clock used by the final synchronous freshness gate before injection. */
	readonly now: () => number;
	readonly publisher: Pick<SemanticContextPublisher, "subscribeSettledChange">;
	readonly session: Pick<CodexSession, "threadInjectItems">;
	readonly threadLink: Pick<CodexThreadLinkPort, "read" | "classify">;
	readonly target: CodexThreadContextTarget;
	readonly identity: IdentityAuthority;
	readonly epoch: Pick<CodexEpochStore, "assertCurrent">;
	readonly currentExecution: () => CodexThreadContextExecution | null;
	/** Supplies the full canonical context; this adapter must not mint identity or proof. */
	readonly contextForEvent: (event: SettledSemanticChangeEvent) => ArchboardContext;
}

interface CodexThreadContextDelivery {
	/** Deliver an event directly, using the same once-only port as the subscription. */
	readonly deliver: (
		event: SettledSemanticChangeEvent,
	) => Promise<CodexThreadContextDeliveryOutcome>;
	/** Settled outcomes in first-seen order. */
	readonly inspect: () => readonly CodexThreadContextDeliveryOutcome[];
	readonly get: (event: CodexThreadContextEventId) => CodexThreadContextDeliveryOutcome | undefined;
	readonly dispose: () => void;
}

interface CodexThreadContextBinding {
	readonly paneId: string;
	readonly target: CodexThreadContextTarget;
	/** Exact pane/link CAS evidence captured by the target-selection action. */
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

interface CodexThreadContextControllerHooks {
	readonly contextForEvent: (
		event: SettledSemanticChangeEvent,
		binding: CodexThreadContextBinding,
	) => ArchboardContext;
}

interface CodexThreadContextControllerOptions extends Omit<
	CodexThreadContextDeliveryOptions,
	"paneId" | "target" | "contextForEvent" | "publisher"
> {
	readonly publisher: Pick<SemanticContextPublisher, "subscribeSettledChange">;
	readonly hooks: CodexThreadContextControllerHooks;
	/** Retire the exact child epoch after execution has been made unavailable. */
	readonly retireEpoch: (child: ChildId, epoch: ChildEpoch) => Promise<void> | void;
}

/** One process-lifetime subscription and event ledger over replaceable exact bindings. */
interface CodexThreadContextController extends CodexThreadContextDelivery {
	readonly snapshot: () => CodexThreadContextBindingSnapshot;
	readonly compareAndSwap: (
		transition: CodexThreadContextBindingTransition,
	) => CodexThreadContextBindingSnapshot;
	readonly replaceHooks: (hooks: CodexThreadContextControllerHooks) => void;
	/** Null execution first, then clear the matching epoch and dispose the owner. */
	readonly childExit: (child: ChildId, epoch: ChildEpoch) => Promise<void>;
}

export {
	type CodexThreadContextExecution,
	type CodexThreadContextTarget,
	type CodexThreadContextEventId,
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
	type CodexThreadContextControllerHooks,
	type CodexThreadContextControllerOptions,
	type CodexThreadContextController,
};
