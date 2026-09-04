import type { ApprovalBinding, ApprovalSettlement } from "../../codex-approvals/index.js";
import type { ArchboardContext } from "../../codex-instructions/index.js";
import type { DynamicServerRequest } from "../../codex-transport/index.js";
import type {
	RealtimeCorrelation,
	RealtimeTranscriptRecord,
} from "../../../shared/codex-realtime-host/index.js";
import type {
	ApprovalId,
	ChildEpoch,
	ChildId,
	DynamicToolCallId,
	JsonRpcRequestId,
	ThreadId,
	TurnId,
} from "../../../shared/codex-workbench-identity/index.js";
import type {
	SpokenApprovalArmInput,
	SpokenApprovalFallbackReason,
	SpokenApprovalGateState,
	SpokenApprovalSnapshot,
} from "./contract.js";

export type LiveGateState = Exclude<
	SpokenApprovalGateState,
	"idle" | "settled" | "visual_fallback"
>;
export type TerminalGateState = Exclude<SpokenApprovalGateState, "idle" | LiveGateState>;

export interface TurnReadyControls {
	readonly promise: Promise<TurnId>;
	readonly resolve: (turnId: TurnId) => void;
	readonly reject: (reason: unknown) => void;
	settled: boolean;
}

export interface ActiveSlot {
	readonly requestId: JsonRpcRequestId;
	readonly approvalId: ApprovalId | null;
	readonly approvalFamily: "command_execution";
	readonly approvalBinding: ApprovalBinding;
	readonly approvalExpiresAtMs: number;
	readonly expiresAtMs: number;
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly coordinatorThreadId: ThreadId;
	readonly realtime: RealtimeCorrelation;
	readonly effectSummary: string;
	readonly effectPrompt: SpokenApprovalArmInput["effectPrompt"];
	readonly classifier: {
		readonly operationId: string;
		readonly clientUserMessageId: string;
		readonly context: ArchboardContext;
	};
	readonly baselineRecordKeys: ReadonlySet<string>;
	phase: LiveGateState | TerminalGateState;
	reason: SpokenApprovalFallbackReason | null;
	finalUser: RealtimeTranscriptRecord | null;
	startedTurnId: TurnId | null;
	classifierTurnId: TurnId | null;
	resolverCallId: DynamicToolCallId | null;
	turnCompleted: boolean;
	turnReady: TurnReadyControls | null;
	pendingResolverRequest: DynamicServerRequest | null;
	settlement: ApprovalSettlement | null;
	timer: ReturnType<typeof setTimeout> | null;
}

export const EMPTY_SPOKEN_APPROVAL_SNAPSHOT: SpokenApprovalSnapshot = Object.freeze({
	state: "idle",
	requestId: null,
	approvalId: null,
	child: null,
	epoch: null,
	coordinatorThreadId: null,
	realtimeSessionId: null,
	realtimeCorrelationId: null,
	effectSummary: null,
	effectFingerprint: null,
	effectPromptItemId: null,
	effectPromptSequence: null,
	finalUserItemId: null,
	finalUserSequence: null,
	finalUserText: null,
	operationId: null,
	classifierTurnId: null,
	resolverCallId: null,
	expiresAtMs: null,
	settlement: null,
	reason: null,
});
