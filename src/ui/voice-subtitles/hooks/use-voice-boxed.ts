// Where the voice sits, as a surface asks it.

import { useSubtitlesWanted } from "@/ui/voice-subtitles/hooks/use-subtitle-preference";

/**
 * Whether the voice sits in the voice box over a pane's picture, and not in the
 * agent dock: the person wants subtitles, voice is on, and a box can carry it. The
 * dock, the box and the stage each ask, so the one rule is written here.
 * @param on Whether voice is on.
 * @param available Whether a pane can carry the voice, and nothing is presented.
 * @returns True while the voice is in the box.
 */
function useVoiceBoxed(on: boolean, available: boolean): boolean {
	return useSubtitlesWanted() && on && available;
}

export { useVoiceBoxed };
