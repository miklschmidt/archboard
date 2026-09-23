import type {
	AnswerSdp,
	CreateOfferSdp,
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
import type {
	RealtimePresentation,
	RealtimePresentationChange,
} from "@/runtime/codex-realtime/lib/presentation-mode";

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
		| "threadInjectItems"
	>;
	readonly identity: IdentityAuthority;
	readonly freshSemanticBrief: (wireSessionId: RealtimeSessionId) => FreshSemanticBrief["brief"];
	readonly boardCatalogue: {
		readonly read: () => string;
		readonly subscribe: (onChange: () => void, onError: (error: Error) => void) => () => void;
	};
	readonly currentBinding: () => CodexRealtimeBinding | null;
	/**
	 * Hears what a start sent and how Codex answered it, for whoever keeps a trace of voice
	 * starts. Sizes, identities and messages only; never the SDP, a prompt or board content.
	 */
	readonly trace?: (
		stage: string,
		detail: Readonly<Record<string, string | number | boolean | null>>,
	) => void;
	/**
	 * Where a narrated walkthrough is on the user's screen: each step as it lands, the first
	 * included, and leaving it (TASK-251). Absent where nothing presents walkthroughs.
	 */
	readonly presentationChanges?: {
		readonly subscribe: (listener: (change: RealtimePresentationChange) => void) => () => void;
	};
}

/** Server-owned protocol half; remote MediaStream attachment remains browser-local. */
interface CodexRealtimeAdapter extends Omit<RealtimeHost, "attachRemoteMedia" | "createOffer"> {
	/**
	 * Accept the browser's offer and start the session, as an ordinary voice session or, given a
	 * walkthrough, one started to present it (TASK-251).
	 */
	readonly createOffer: (
		offer: CreateOfferSdp,
		presentation?: RealtimePresentation | null,
	) => Promise<AnswerSdp>;
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
