import type {
	RealtimeHost,
	RealtimeTranscriptRecord,
	RemoteMediaAttachment,
} from "../../../shared/codex-realtime-host/index.js";
import type {
	ChildEpoch,
	ChildId,
	IdentityAuthority,
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
	readonly attachRemoteMedia: (attachment: RemoteMediaAttachment) => void;
}

export interface CodexRealtimeAdapter extends RealtimeHost {
	readonly onNotification: SessionNotificationHandler;
	readonly transcript: () => readonly RealtimeTranscriptRecord[];
	readonly dispose: () => void;
}
