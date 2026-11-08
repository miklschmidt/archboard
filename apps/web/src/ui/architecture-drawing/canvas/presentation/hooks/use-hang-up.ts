// Whether a presented walkthrough's Narrate key is the red hang-up key: while the lit orb is wanted
// in the voice box, the key ends the voice (TASK-590.16).

import { useOrbWanted, useVoiceSurface, voiceEnd } from "@archboard/workbench/voice";

/** What the Narrate key does to the voice. */
interface HangUp {
	/** Whether the key is the hang-up key: the lit orb is wanted in the voice box. */
	readonly hangingUp: boolean;
	/** End the voice, while the key hangs up and the voice can be ended. */
	readonly end: (() => void) | undefined;
}

/**
 * Whether the Narrate key hangs up, and how. The dock wishes the orb out of the box and back into
 * the key as the voice ends, so the key stops hanging up while the orb flies home.
 * @returns Whether it hangs up, and the end of the voice while one can be ended.
 */
function useHangUp(): HangUp {
	const surface = useVoiceSurface();
	const boxed = useOrbWanted() === "box";
	if (!boxed || surface === null) return { hangingUp: false, end: undefined };
	return { hangingUp: true, end: voiceEnd(surface.voice, surface.actions) };
}

export { useHangUp };
