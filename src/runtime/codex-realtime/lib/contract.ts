import type {
	RealtimeHost,
	RealtimeCorrelationId,
	RealtimeSessionId as BrowserRealtimeSessionId,
	RealtimeTranscriptRecord,
} from "@/shared/codex-realtime-host";
import type {
	ChildEpoch,
	ChildId,
	IdentityAuthority,
	RealtimeSessionId,
	ThreadId,
} from "@/shared/codex-workbench-identity";
import type { CodexSession, SessionNotificationHandler } from "@/runtime/codex-session";
import type { FreshSemanticBrief } from "@/runtime/codex-semantic-context";

interface CodexRealtimeBinding {
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly linkedThreadId: ThreadId;
	readonly coordinatorThreadId: ThreadId;
}

interface CodexRealtimeGeneration extends CodexRealtimeBinding {
	readonly browserSessionId: BrowserRealtimeSessionId;
	readonly browserCorrelationId: RealtimeCorrelationId;
	readonly wireSessionId: RealtimeSessionId;
	/** Byte-exact semantic context captured once for this realtime start. */
	readonly semanticBrief: FreshSemanticBrief["brief"];
}

interface CodexRealtimeAdapterOptions {
	readonly session: Pick<
		CodexSession,
		| "realtimeStart"
		| "realtimeAppendText"
		| "realtimeAppendSpeech"
		| "realtimeStop"
		| "timelineListPage"
	>;
	readonly identity: IdentityAuthority;
	readonly freshSemanticBrief: (wireSessionId: RealtimeSessionId) => FreshSemanticBrief["brief"];
	readonly currentBinding: () => CodexRealtimeBinding | null;
}

/** Server-owned protocol half; remote MediaStream attachment remains browser-local. */
interface CodexRealtimeAdapter extends Omit<RealtimeHost, "attachRemoteMedia"> {
	readonly onNotification: SessionNotificationHandler;
	readonly transcript: () => readonly RealtimeTranscriptRecord[];
	readonly generation: () => CodexRealtimeGeneration | null;
	readonly dispose: () => void;
}

export type {
	CodexRealtimeAdapter,
	CodexRealtimeAdapterOptions,
	CodexRealtimeBinding,
	CodexRealtimeGeneration,
};
