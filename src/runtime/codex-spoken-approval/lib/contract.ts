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

type SpokenApprovalGateState =
	| "idle"
	| "awaiting_user"
	| "classifying"
	| "awaiting_resolver"
	| "resolving"
	| "settled"
	| "visual_fallback";

type SpokenApprovalFallbackReason =
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

interface SpokenApprovalEffectPrompt {
	readonly itemId: RealtimeItemId;
	readonly sequence: number;
}

interface SpokenApprovalClassifierInput {
	/** A host-issued operation identity; this module never mints one. */
	readonly operationId: string;
	/** A host-issued client message identity for the ordinary turn. */
	readonly clientUserMessageId: string;
	readonly context: ArchboardContext;
}

interface SpokenApprovalArmInput {
	readonly requestId: JsonRpcRequestId;
	/** Must equal the broker-derived presentation for this request. */
	readonly effectSummary: string;
	readonly realtime: RealtimeCorrelation;
	readonly effectPrompt: SpokenApprovalEffectPrompt;
	readonly classifier: SpokenApprovalClassifierInput;
}

interface SpokenApprovalSnapshot {
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

type SpokenApprovalToolResult =
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

interface CodexSpokenApprovalGateOptions {
	readonly approvalBroker: Pick<
		CodexApprovalBroker,
		"get" | "spokenEligibility" | "spokenEffectPresentation" | "resolve"
	>;
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

interface CodexSpokenApprovalGate {
	readonly arm: (input: SpokenApprovalArmInput) => SpokenApprovalSnapshot;
	readonly snapshot: () => SpokenApprovalSnapshot;
	readonly onSemanticEvent: (event: RealtimeSemanticEvent) => void;
	readonly onNotification: (event: TransportServerNotification) => void;
	readonly resolve: (request: DynamicServerRequest) => Promise<SpokenApprovalToolResult>;
	readonly onChildExit: (exit: { readonly child: ChildId; readonly epoch: ChildEpoch }) => void;
	readonly dispose: () => void;
}

type CodexSpokenApprovalErrorCode = "disposed" | "busy";

class CodexSpokenApprovalError extends Error {
	override readonly name = "CodexSpokenApprovalError";
	readonly code: CodexSpokenApprovalErrorCode;

	constructor(code: CodexSpokenApprovalErrorCode, message: string) {
		super(message);
		this.code = code;
	}
}

type SpokenApprovalNotification = Extract<
	TransportServerNotification["notification"],
	{ readonly method: "turn/started" | "turn/completed" }
>;

type SpokenApprovalTranscript = RealtimeTranscriptRecord;

export {
	type SpokenApprovalGateState,
	type SpokenApprovalFallbackReason,
	type SpokenApprovalEffectPrompt,
	type SpokenApprovalClassifierInput,
	type SpokenApprovalArmInput,
	type SpokenApprovalSnapshot,
	type SpokenApprovalToolResult,
	type CodexSpokenApprovalGateOptions,
	type CodexSpokenApprovalGate,
	type CodexSpokenApprovalErrorCode,
	CodexSpokenApprovalError,
	type SpokenApprovalNotification,
	type SpokenApprovalTranscript,
};
