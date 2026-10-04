// Where the voice sits, as a surface asks it.

import { useSubtitlesWanted } from "@/ui/voice-subtitles/hooks/use-subtitle-preference";

/**
 * Whether the voice sits in a box over a pane's picture, and not in the agent dock: voice is on
 * and a box can carry it, and the person wants subtitles or there is no dock to put it in, as in
 * a fullscreen presentation. The dock, the box and the stage each ask, so the one rule is written
 * here.
 * @param on Whether voice is on.
 * @param available Whether a pane can carry the voice.
 * @param dockless Whether the dock is off screen, so the box is the only place the voice can be seen.
 * @returns True while the voice is in the box.
 */
function useVoiceBoxed(on: boolean, available: boolean, dockless = false): boolean {
	const wanted = useSubtitlesWanted();
	return on && available && (wanted || dockless);
}

export { useVoiceBoxed };
