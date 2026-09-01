import type {
	RealtimeHost,
	RealtimeCorrelationId,
	RealtimeSessionId as BrowserRealtimeSessionId,
	RealtimeTranscriptRecord,
} from "../../../shared/codex-realtime-host/index.js";
import type {
	ChildEpoch,
	ChildId,
	IdentityAuthority,
	RealtimeSessionId,
	ThreadId,
} from "../../../shared/codex-workbench-identity/index.js";
import type { CodexSession, SessionNotificationHandler } from "../../codex-session/index.js";
import type { FreshSemanticBrief } from "../../codex-semantic-context/index.js";

export interface CodexRealtimeBinding {
	readonly child: ChildId;
	readonly epoch: ChildEpoch;
	readonly linkedThreadId: ThreadId;
	readonly coordinatorThreadId: ThreadId;
}

export interface CodexRealtimeGeneration extends CodexRealtimeBinding {
	readonly browserSessionId: BrowserRealtimeSessionId;
	readonly browserCorrelationId: RealtimeCorrelationId;
	readonly wireSessionId: RealtimeSessionId;
}

export interface CodexRealtimeAdapterOptions {
	readonly session: Pick<
		CodexSession,
		| "realtimeStart"
		| "realtimeAppendText"
		| "realtimeAppendSpeech"
		| "realtimeStop"
		| "timelineListPage"
	>;
	readonly identity: IdentityAuthority;
	readonly freshSemanticBrief: () => FreshSemanticBrief["brief"];
	readonly currentBinding: () => CodexRealtimeBinding | null;
}

/** Server-owned protocol half; remote MediaStream attachment remains browser-local. */
export interface CodexRealtimeAdapter extends Omit<RealtimeHost, "attachRemoteMedia"> {
	readonly onNotification: SessionNotificationHandler;
	readonly transcript: () => readonly RealtimeTranscriptRecord[];
	readonly generation: () => CodexRealtimeGeneration | null;
	readonly dispose: () => void;
}
