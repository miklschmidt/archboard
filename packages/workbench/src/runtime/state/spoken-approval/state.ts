import type { ApprovalBinding, ApprovalSettlement } from "#runtime/services/approvals/contract.ts";
import type {
	WorkbenchExecutionContext,
	WorkbenchContextCodec,
} from "#runtime/protocol/host/context.ts";
import type { DynamicServerRequest } from "@archboard/codex-app-server/transport";
import type {
	RealtimeCorrelation,
	RealtimeTranscriptRecord,
} from "#shared/protocol/realtime-contract.ts";
import type {
	ApprovalId,
	ChildEpoch,
	ChildId,
	DynamicToolCallId,
	JsonRpcRequestId,
	ThreadId,
	TurnId,
} from "@archboard/codex-app-server/identity";
import type {
	SpokenApprovalArmInput,
	SpokenApprovalFallbackReason,
	SpokenApprovalGateState,
	SpokenApprovalSnapshot,
} from "#runtime/protocol/spoken-approval/contract.ts";

type LiveGateState = Exclude<SpokenApprovalGateState, "idle" | "settled" | "visual_fallback">;
type TerminalGateState = Exclude<SpokenApprovalGateState, "idle" | LiveGateState>;

interface TurnReadyControls {
	readonly promise: Promise<TurnId>;
	readonly resolve: (turnId: TurnId) => void;
	readonly reject: (reason: unknown) => void;
	settled: boolean;
}

interface ActiveSlot {
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
		readonly context: WorkbenchExecutionContext;
		readonly contextCodec: WorkbenchContextCodec;
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

const EMPTY_SPOKEN_APPROVAL_SNAPSHOT: SpokenApprovalSnapshot = Object.freeze({
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

export { EMPTY_SPOKEN_APPROVAL_SNAPSHOT };
export type { ActiveSlot, LiveGateState, TerminalGateState, TurnReadyControls };
