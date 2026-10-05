// What the voice's circle shows now, for each surface that draws the voice.

import { useAudible } from "@/ui/workbench/hooks/use-audible";
import { circleState, type CircleState } from "@/ui/workbench/lib/circle-state";
import type { AgentVoiceView } from "@/ui/workbench/contracts";

/**
 * What the circle shows for a voice, drawn again when the model starts or stops being audible.
 * @param voice The voice.
 * @returns The state.
 */
function useCircleState(voice: AgentVoiceView): CircleState {
	return circleState(voice, useAudible(voice));
}

export { useCircleState };
