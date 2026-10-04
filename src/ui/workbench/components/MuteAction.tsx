// The mute control of a live voice, one control wherever the voice's controls are
// drawn: the dock's voice line, the voice box over a picture and the Talk control a
// presentation carries.

import { RiMicLine, RiMicOffLine } from "@remixicon/react";
import type { JSX } from "react";

import { IconAction } from "@/ui/workbench/components/IconAction";
import type { AgentActions, AgentVoiceView } from "@/ui/workbench/contracts";

/** Inputs for the mute control. */
interface MuteActionProps {
	readonly voice: AgentVoiceView;
	readonly actions: AgentActions;
}

/**
 * Mute the voice, or unmute it while it is muted.
 * @param props The voice and the actions.
 * @returns The control.
 */
function MuteAction(props: MuteActionProps): JSX.Element {
	const { voice, actions } = props;
	const muted = voice.stage === "muted";
	return (
		<IconAction
			label={muted ? "Unmute" : "Mute"}
			onClick={muted ? actions.unmute : actions.mute}
			disabled={voice.busy}
		>
			{muted ? <RiMicOffLine /> : <RiMicLine />}
		</IconAction>
	);
}

export { MuteAction };
