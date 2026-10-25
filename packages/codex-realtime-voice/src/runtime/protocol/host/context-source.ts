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
