/** One role's chosen Codex model, reasoning effort, and optional service tier. */
export interface RoleModelSelection {
	readonly model: string;
	readonly effort: string;
	readonly serviceTier: string | null;
}

/** Optional host-configured model overrides for coordinator and workhorse threads. */
export interface VoiceAgentModelPreferences {
	readonly coordinator: RoleModelSelection | null;
	readonly workhorse: RoleModelSelection | null;
}

/** The reviewed default model settings used when no host override is configured. */
const DEFAULT_VOICE_AGENT_MODELS: Readonly<{
	readonly coordinator: RoleModelSelection;
	readonly workhorse: RoleModelSelection;
}> = Object.freeze({
	coordinator: Object.freeze({
		model: "gpt-6.1-terra",
		effort: "low",
		serviceTier: "priority",
	}),
	workhorse: Object.freeze({
		model: "gpt-6.2-sol",
		effort: "high",
		serviceTier: null,
	}),
});

/**
 * Return the reviewed default model settings for coordinator and workhorse threads.
 * @returns Frozen default coordinator and workhorse selections.
 */
export function defaultVoiceAgentModels(): Readonly<{
	readonly coordinator: RoleModelSelection;
	readonly workhorse: RoleModelSelection;
}> {
	return DEFAULT_VOICE_AGENT_MODELS;
}
