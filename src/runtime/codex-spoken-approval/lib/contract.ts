import type { ApprovalSettlement, CodexApprovalBroker } from "../../codex-approvals/index.js";
import type { CodexCoordinator } from "../../codex-coordinator/index.js";
import type { CodexRealtimeAdapter } from "../../codex-realtime/index.js";
import type { CodexSession } from "../../codex-session/index.js";
import type {
	DynamicServerRequest,
	TransportServerNotification,
} from "../../codex-transport/index.js";
import type { ArchboardContext } from "../../codex-instructions/index.js";
import type {
	ChildEpoch,
	ChildId,
	ApprovalId,
	DynamicToolCallId,
	IdentityAuthority,
	JsonRpcRequestId,
	ThreadId,
	TurnId,
} from "../../../shared/codex-workbench-identity/index.js";
import type {
	RealtimeCorrelation,
	RealtimeItemId,
	RealtimeSemanticEvent,
	RealtimeTranscriptRecord,
} from "../../../shared/codex-realtime-host/index.js";
import type {
	DynamicToolRefusalReason,
	ResolveSpokenApprovalInput,
} from "../../codex-coordinator-tool-contract/index.js";

export type SpokenApprovalGateState =
	| "idle"
	| "awaiting_user"
	| "classifying"
	| "awaiting_resolver"
	| "resolving"
	| "settled"
	| "visual_fallback";

export type SpokenApprovalFallbackReason =
	| "approval_unavailable"
	| "not_eligible"
	| "coordinator_unavailable"
	| "realtime_unavailable"
	| "invalid_context"
	| "invalid_effect_prompt"
	| "user_already_spoke"
	| "missing_user_final"
	| "assistant_only"
	| "ambiguous"
	| "changed_effect"
	| "stale_realtime_session"
	| "stale_state"
	| "timeout"
	| "classifier_lost"
	| "resolver_lost"
	| "child_exit"
	| "disposed";

export interface SpokenApprovalEffectPrompt {
	readonly itemId: RealtimeItemId;
	readonly sequence: number;
}

export interface SpokenApprovalClassifierInput {
	/** A host-issued operation identity; this module never mints one. */
	readonly operationId: string;
	/** A host-issued client message identity for the ordinary turn. */
	readonly clientUserMessageId: string;
	readonly context: ArchboardContext;
}

export interface SpokenApprovalArmInput {
	readonly requestId: JsonRpcRequestId;
	/** The bounded, one-line effect text the person was shown or told. */
	readonly effectSummary: string;
	readonly realtime: RealtimeCorrelation;
	readonly effectPrompt: SpokenApprovalEffectPrompt;
	readonly classifier: SpokenApprovalClassifierInput;
}

export interface SpokenApprovalSnapshot {
	readonly state: SpokenApprovalGateState;
	readonly requestId: JsonRpcRequestId | null;
	readonly approvalId: ApprovalId | null;
	readonly child: ChildId | null;
	readonly epoch: ChildEpoch | null;
	readonly coordinatorThreadId: ThreadId | null;
	readonly realtimeSessionId: RealtimeCorrelation["sessionId"] | null;
	readonly realtimeCorrelationId: RealtimeCorrelation["correlationId"] | null;
	readonly effectSummary: string | null;
	readonly effectFingerprint: string | null;
	readonly effectPromptItemId: RealtimeItemId | null;
	readonly effectPromptSequence: number | null;
	readonly finalUserItemId: RealtimeItemId | null;
	readonly finalUserSequence: number | null;
	readonly finalUserText: string | null;
	readonly operationId: string | null;
	readonly classifierTurnId: TurnId | null;
	readonly resolverCallId: DynamicToolCallId | null;
	readonly expiresAtMs: number | null;
	readonly settlement: ApprovalSettlement | null;
	readonly reason: SpokenApprovalFallbackReason | null;
}

export type SpokenApprovalToolResult =
	| {
			readonly tag: "ok";
			readonly value: {
				readonly verdict: ResolveSpokenApprovalInput["verdict"];
				readonly settlement: ApprovalSettlement["outcome"];
			};
	  }
	| {
			readonly tag: "refused";
			readonly reason: DynamicToolRefusalReason;
			readonly message: string;
	  };

export interface CodexSpokenApprovalGateOptions {
	readonly approvalBroker: Pick<CodexApprovalBroker, "get" | "spokenEligibility" | "resolve">;
	readonly coordinator: Pick<CodexCoordinator, "snapshot">;
	readonly realtime: Pick<CodexRealtimeAdapter, "onSemanticEvent" | "transcript">;
	readonly session: Pick<CodexSession, "turnStart">;
	readonly identity: IdentityAuthority;
	/** The current browser-side realtime correlation, or null when no session is live. */
	readonly currentRealtime: () => RealtimeCorrelation | null;
	readonly now?: () => number;
	readonly onChange?: (snapshot: SpokenApprovalSnapshot) => void;
	readonly onVisualFallback?: (
		reason: SpokenApprovalFallbackReason,
		snapshot: SpokenApprovalSnapshot,
	) => void;
}

export interface CodexSpokenApprovalGate {
	readonly arm: (input: SpokenApprovalArmInput) => SpokenApprovalSnapshot;
	readonly snapshot: () => SpokenApprovalSnapshot;
	readonly onSemanticEvent: (event: RealtimeSemanticEvent) => void;
	readonly onNotification: (event: TransportServerNotification) => void;
	readonly resolve: (request: DynamicServerRequest) => Promise<SpokenApprovalToolResult>;
	readonly onChildExit: (exit: { readonly child: ChildId; readonly epoch: ChildEpoch }) => void;
	readonly dispose: () => void;
}

export type CodexSpokenApprovalErrorCode = "disposed" | "busy";

export class CodexSpokenApprovalError extends Error {
	override readonly name = "CodexSpokenApprovalError";
	readonly code: CodexSpokenApprovalErrorCode;

	constructor(code: CodexSpokenApprovalErrorCode, message: string) {
		super(message);
		this.code = code;
	}
}

export type SpokenApprovalNotification = Extract<
	TransportServerNotification["notification"],
	{ readonly method: "turn/started" | "turn/completed" }
>;

export type SpokenApprovalTranscript = RealtimeTranscriptRecord;
