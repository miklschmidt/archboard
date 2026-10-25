import type {
	ChildId,
	ChildEpoch,
	ThreadId,
	TurnId,
	RealtimeSessionId,
} from "@archboard/codex-app-server/identity";
/** Domain snapshots arrive as complete replacements. The host owns their wording and meaning. */
interface WorkbenchContextSource {
	readonly read: () => string;
	readonly subscribe: (onChange: () => void, onError: (error: Error) => void) => () => void;
}

/** Speakable input is distinct from quiet application context. Neither grants execution authority. */
interface WorkbenchVoiceInput {
	readonly text: string;
	readonly channel: "speech" | "context";
}

interface WorkbenchVoicePolicy<Presentation = unknown> {
	readonly start: (presentation: Presentation | null) => {
		readonly prompt: string;
		readonly suppressCoordinatorSpeech: boolean;
		readonly delegationAckFiller: boolean;
	};
	readonly subscribe?: (
		presentation: Presentation | null,
		listener: (input: WorkbenchVoiceInput) => void,
	) => () => void;
}

export type { WorkbenchContextSource, WorkbenchVoiceInput, WorkbenchVoicePolicy };

/** Ordered context carries execution evidence separately from whatever else the host attaches. */
interface WorkbenchContextEvent {
	readonly source: string;
	readonly origin: "human" | "agent" | "mixed" | null;
	readonly feedId: string;
	readonly cursor: { readonly feedId: string; readonly sequence: number } | null;
	readonly child: { readonly id: ChildId | null; readonly epoch: ChildEpoch | null };
	readonly threadLink: { readonly state: string; readonly reason: string | null };
	readonly workhorse: { readonly threadId: ThreadId | null; readonly turnId: TurnId | null };
	readonly coordinator: {
		readonly threadId: ThreadId | null;
		readonly realtimeSessionId: RealtimeSessionId | null;
	};
	readonly freshness: WorkbenchContextFreshness;
	readonly staleness: { readonly state: string };
	readonly brief: string;
	readonly truncated: boolean;
	readonly change: {
		readonly feedId: string;
		readonly cursor: { readonly feedId: string; readonly sequence: number };
		readonly origin: "human" | "agent" | "mixed";
		readonly significance: string;
		readonly by: string | null;
	};
}

export type { WorkbenchContextEvent };

interface WorkbenchContextFreshness {
	readonly state: "fresh" | "stale";
	readonly capturedAtMs: number;
	readonly freshUntilMs: number;
}
interface WorkbenchContextPublisher {
	readonly freshBrief: () => {
		readonly brief: string;
		readonly freshness: WorkbenchContextFreshness;
	};
	readonly freshBriefForRealtime: (sessionId: RealtimeSessionId) => string;
	readonly subscribeSettledChange: (listener: (event: WorkbenchContextEvent) => void) => () => void;
	readonly dispose: () => void;
}
export type { WorkbenchContextPublisher, WorkbenchContextFreshness };
