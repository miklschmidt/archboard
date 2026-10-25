import type { BrowserVoicePresentation } from "#shared/schemas/browser/snapshot.ts";
import type {
	AnswerSdp,
	CreateOfferSdp,
	RealtimeServer,
	RealtimeCorrelationId,
	RealtimeSessionId as BrowserRealtimeSessionId,
	RealtimeTranscriptRecord,
} from "#shared/protocol/realtime-contract.ts";
import type {
	ChildEpoch,
	ChildId,
	IdentityAuthority,
	RealtimeSessionId,
	ThreadId,
} from "@archboard/codex-app-server/identity";
import type { CodexSession, SessionNotificationHandler } from "@archboard/codex-app-server/session";
import type {
	WorkbenchContextSource,
	WorkbenchVoicePolicy,
} from "#runtime/protocol/host/context-source.ts";

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
	/** The host context captured once for this realtime start, byte for byte. */
	readonly startBrief: string;
}

interface CodexRealtimeAdapterOptions {
	readonly session: Pick<
		CodexSession,
		| "realtimeStart"
		| "realtimeAppendText"
		| "realtimeAppendSpeech"
		| "realtimeStop"
		| "timelineListPage"
		| "threadInjectItems"
	>;
	readonly identity: IdentityAuthority;
	readonly freshSemanticBrief: (wireSessionId: RealtimeSessionId) => string;
	readonly coordinatorContext: WorkbenchContextSource;
	readonly voice: WorkbenchVoicePolicy;
	readonly currentBinding: () => CodexRealtimeBinding | null;
	/**
	 * Hears what a start sent and how Codex answered it, for whoever keeps a trace of voice
	 * starts. Sizes, identities and messages only; never the SDP, a prompt or board content.
	 */
	readonly trace?: (
		stage: string,
		detail: Readonly<Record<string, string | number | boolean | null>>,
	) => void;
}

/** Server-owned protocol half; remote MediaStream attachment remains browser-local. */
interface CodexRealtimeAdapter extends Omit<RealtimeServer, "attachRemoteMedia" | "createOffer"> {
	/**
	 * Accept the browser's offer and start the session, as an ordinary voice session or, given a
	 * walkthrough, one started to present it (TASK-251).
	 */
	readonly createOffer: (
		offer: CreateOfferSdp,
		presentation?: BrowserVoicePresentation | null,
	) => Promise<AnswerSdp>;
	readonly onNotification: SessionNotificationHandler;
	readonly transcript: () => readonly RealtimeTranscriptRecord[];
	readonly generation: () => CodexRealtimeGeneration | null;
	/** The walkthrough the live session presents (TASK-251), or null with none or an ordinary one. */
	readonly presentation: () => BrowserVoicePresentation | null;
	readonly dispose: () => void;
}

export type {
	CodexRealtimeAdapter,
	CodexRealtimeAdapterOptions,
	CodexRealtimeBinding,
	CodexRealtimeGeneration,
};
