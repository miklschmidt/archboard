import type { CodexEpochStore } from "../../codex-epoch/index.js";
import type { CodexSession } from "../../codex-session/index.js";
import type { ArchboardContext, ThreadInjectItemsParams } from "../../codex-instructions/index.js";
import type {
	CodexThreadLinkPort,
	ThreadLinkReasonCode,
	ThreadLinkTarget,
} from "../../codex-thread-link/index.js";
import type {
	SemanticContextPublisher,
	SettledSemanticChangeEvent,
} from "../../codex-semantic-context/index.js";
import type {
	ChildEpoch,
	ChildId,
	IdentityAuthority,
	ThreadId,
} from "../../../shared/codex-workbench-identity/index.js";

/** The one exact child capability a delivery is allowed to use. */
export interface CodexThreadContextExecution {
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
}

/** A durable target captured by the workbench; this port never selects a thread. */
export type CodexThreadContextTarget = ThreadLinkTarget & {
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
	readonly operationId: string;
};

export type CodexThreadContextEventId = Readonly<{
	readonly feedId: string;
	readonly sequence: number;
}>;

/** Stable reasons retained when a semantic event is refused or its response is lost. */
export type CodexThreadContextDeliveryReason =
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

export type CodexThreadContextDeliveryState = "delivered" | "not_delivered" | "outcome_unknown";

/** The immutable record for one semantic event identity. */
export interface CodexThreadContextDeliveryOutcome {
	readonly kind: "thread_context_delivery";
	readonly event: CodexThreadContextEventId;
	readonly paneId: string;
	readonly targetThreadId: ThreadId;
	readonly targetChildId: ChildId;
	readonly targetEpoch: ChildEpoch;
	readonly targetOperationId: string;
	readonly attempted: boolean;
	readonly outcome: CodexThreadContextDeliveryState;
	readonly reason: CodexThreadContextDeliveryReason | null;
	/** The exact canonical body, when the body was built before refusal or attempt. */
	readonly payload: ThreadInjectItemsParams | null;
}

export interface CodexThreadContextDeliveryOptions {
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

export interface CodexThreadContextDelivery {
	/** Deliver an event directly, using the same once-only port as the subscription. */
	readonly deliver: (
		event: SettledSemanticChangeEvent,
	) => Promise<CodexThreadContextDeliveryOutcome>;
	/** Settled outcomes in first-seen order. */
	readonly inspect: () => readonly CodexThreadContextDeliveryOutcome[];
	readonly get: (event: CodexThreadContextEventId) => CodexThreadContextDeliveryOutcome | undefined;
	readonly dispose: () => void;
}
