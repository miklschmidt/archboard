// What a Narrate key does with the orb and the voice. It asks for a launch as it is pressed, so the
// orb that voice lights leaves the key. While the lit orb is wanted in the voice box, it is the
// hang-up key, and a press ends the voice (TASK-590.16).

import { useSyncExternalStore } from "react";

import { voiceEnd } from "#ui/workbench-client/dock/rules/circle-state.ts";
import { useOrbStage } from "#ui/workbench-client/orb/hooks/use-orb-stage.ts";
import { useVoiceSurface } from "#ui/workbench-client/voice/hooks/use-voice-surface.ts";

/** What a Narrate key does. */
interface NarrateKey {
	/**
	 * Ask for a launch: the next orb that is lit leaves the key, lit from the start of its flight,
	 * for the home it is wanted in. The key asks as it is pressed, before the voice it starts is
	 * lit, and names itself. The same function for as long as the stage lasts.
	 */
	readonly launch: (pressed: Element) => void;
	/** Whether the key is the hang-up key: the lit orb is wanted in the voice box. */
	readonly hangingUp: boolean;
	/** End the voice, while the key hangs up and the voice can be ended. */
	readonly end: (() => void) | undefined;
}

/**
 * What a Narrate key does. The dock wishes the orb out of the box and back into the key as the
 * voice ends, so the key stops hanging up while the orb flies home.
 * @returns The launch, whether the key hangs up, and the end of the voice while one can be ended.
 */
function useNarrateKey(): NarrateKey {
	const stage = useOrbStage();
	const wanted = useSyncExternalStore(stage.subscribe, stage.wanted, () => null);
	const surface = useVoiceSurface();
	if (wanted !== "box" || surface === null)
		return { launch: stage.launch, hangingUp: false, end: undefined };
	return { launch: stage.launch, hangingUp: true, end: voiceEnd(surface.voice, surface.actions) };
}

export { useNarrateKey };
