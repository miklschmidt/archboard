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

/** How voice starts for a narrative, or for an ordinary session with null. */
interface WorkbenchVoicePolicy<Narrative = unknown> {
	readonly start: (narrative: Narrative | null) => {
		readonly prompt: string;
		readonly suppressCoordinatorSpeech: boolean;
		readonly delegationAckFiller: boolean;
	};
	readonly subscribe?: (
		narrative: Narrative | null,
		listener: (input: WorkbenchVoiceInput) => void,
	) => () => void;
}

export type { WorkbenchContextSource, WorkbenchVoiceInput, WorkbenchVoicePolicy };
