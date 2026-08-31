import type {
	AnswerSdp,
	RealtimeCorrelationId,
	RealtimeItemId,
	RealtimeSessionId as BrowserRealtimeSessionId,
	RealtimeTranscriptRecord,
	RealtimeTranscriptRole,
} from "../../../shared/codex-realtime-host/index.js";
import type { RealtimeSessionId as WireRealtimeSessionId } from "../../../shared/codex-workbench-identity/index.js";
import type { CodexRealtimeBinding } from "./contract.js";

export interface RealtimeTranscriptEntry {
	readonly itemId: RealtimeItemId;
	role: RealtimeTranscriptRole;
	status: RealtimeTranscriptRecord["status"];
	text: string;
	order: number;
}

export interface ActiveRealtimeSession {
	readonly binding: CodexRealtimeBinding;
	readonly browserSessionId: BrowserRealtimeSessionId;
	readonly correlationId: RealtimeCorrelationId;
	readonly wireSessionId: WireRealtimeSessionId;
	readonly answer: Promise<AnswerSdp>;
	readonly resolveAnswer: (answer: AnswerSdp) => void;
	readonly rejectAnswer: (error: Error) => void;
	readonly entries: Map<RealtimeItemId, RealtimeTranscriptEntry>;
	startReturned: boolean;
	started: boolean;
	answerSdp: string | null;
	answerSettled: boolean;
	nextLiveOrder: number;
}
