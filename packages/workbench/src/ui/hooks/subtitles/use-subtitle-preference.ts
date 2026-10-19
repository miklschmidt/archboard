// The person's subtitle choice, as a component reads it.

import { useSyncExternalStore } from "react";

import { subtitlePreference, type SubtitlePreference } from "#ui/state/subtitles/preference.ts";

/**
 * Whether subtitles are wanted, re-rendering the caller when that changes.
 * @param preference The preference to read; the page's own unless a test supplies one.
 * @returns True while subtitles are wanted.
 */
function useSubtitlesWanted(preference: SubtitlePreference = subtitlePreference): boolean {
	return useSyncExternalStore(preference.subscribe, preference.wanted, preference.wanted);
}

export { useSubtitlesWanted };
