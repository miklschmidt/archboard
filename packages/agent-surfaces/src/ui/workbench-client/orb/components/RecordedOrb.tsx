// The orb of a recorded voice. A recording page has no dock, so it draws the page's one orb
// itself, lit in the voice box from the first frame that shows the box. A recording cuts every
// move of the box, so the orb is never flown either. It moves with the level of the recorded voice.

import type { JSX } from "react";

import { OrbHost } from "#ui/workbench-client/orb/components/OrbStage.tsx";
import { useOrbPlacement } from "#ui/workbench-client/orb/hooks/use-orb-stage.ts";
import { useCircleState } from "#ui/workbench-client/dock/hooks/use-circle-state.ts";
import type { AgentVoiceView } from "#ui/workbench-client/surfaces/state/contracts.ts";

/**
 * The page's one orb for a recorded voice, in the voice box and showing what the dock's circle
 * would.
 * @param props The voice.
 * @param props.voice The recorded voice, as loud on each frame as it was then.
 * @returns The orb, drawn into the stage's holder.
 */
function RecordedOrb(props: { readonly voice: AgentVoiceView }): JSX.Element {
	useOrbPlacement({ home: "box", shown: true, reducedMotion: true });
	return (
		<OrbHost
			mode={useCircleState(props.voice)}
			level={props.voice.level.read}
			reducedMotion={false}
		/>
	);
}

export { RecordedOrb };
