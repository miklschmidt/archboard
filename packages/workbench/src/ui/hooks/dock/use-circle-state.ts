// What the voice's circle shows now, for each surface that draws the voice.

import { useAudible } from "#ui/hooks/voice/use-audible.ts";
import { circleState, type CircleState } from "#ui/rules/dock/circle-state.ts";
import type { AgentVoiceView } from "#ui/state/surfaces/contracts.ts";

/**
 * What the circle shows for a voice, drawn again when the model starts or stops being audible.
 * @param voice The voice.
 * @returns The state.
 */
function useCircleState(voice: AgentVoiceView): CircleState {
	return circleState(voice, useAudible(voice));
}

export { useCircleState };
