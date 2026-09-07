import type {
	AnswerSdp,
	RealtimeCorrelationId,
	RealtimeSessionId as BrowserRealtimeSessionId,
	RealtimeState,
	RealtimeTranscriptRecord,
	RealtimeTranscriptRole,
} from "@/shared/codex-realtime-host";
import type {
	ItemId,
	RealtimeSessionId as WireRealtimeSessionId,
} from "@/shared/codex-workbench-identity";
import type {
	CodexRealtimeBinding,
	CodexRealtimeGeneration,
} from "@/runtime/codex-realtime/lib/contract";

interface RealtimeTranscriptEntry {
	readonly itemId: ItemId;
	role: RealtimeTranscriptRole;
	status: RealtimeTranscriptRecord["status"];
	text: string;
	order: number;
}

interface ActiveRealtimeSession {
	readonly binding: CodexRealtimeBinding;
	readonly browserSessionId: BrowserRealtimeSessionId;
	readonly correlationId: RealtimeCorrelationId;
	readonly wireSessionId: WireRealtimeSessionId;
	readonly semanticBrief: string;
	readonly answer: Promise<AnswerSdp>;
	readonly resolveAnswer: (answer: AnswerSdp) => void;
	readonly rejectAnswer: (error: Error) => void;
	readonly entries: Map<ItemId, RealtimeTranscriptEntry>;
	state: RealtimeState;
	startReturned: boolean;
	started: boolean;
	answerSdp: string | null;
	answerSettled: boolean;
	nextLiveOrder: number;
}

/**
 * The frozen identity of one realtime start, everything a later delivery must match to be
 * counted as belonging to this session.
 * @param session - The live session.
 * @returns The session's generation record.
 */
function realtimeGeneration(session: ActiveRealtimeSession): CodexRealtimeGeneration {
	return Object.freeze({
		...session.binding,
		browserSessionId: session.browserSessionId,
		browserCorrelationId: session.correlationId,
		wireSessionId: session.wireSessionId,
		semanticBrief: session.semanticBrief,
	});
}

export { type RealtimeTranscriptEntry, type ActiveRealtimeSession, realtimeGeneration };
