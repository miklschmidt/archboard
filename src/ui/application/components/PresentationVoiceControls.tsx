// Voice while a pane is presented fullscreen: the same Talk control the agent
// bar carries, so voice starts, mutes and ends the same way everywhere.

import type { JSX } from "react";

import { TalkControl } from "@/ui/workbench";
import type { AgentActions, AgentVoiceView } from "@/ui/workbench/contracts";

/** Inputs for the presentation's voice controls. */
interface PresentationVoiceControlsProps {
	readonly voice: AgentVoiceView;
	readonly actions: AgentActions;
	readonly reducedMotion: boolean;
}

/**
 * The presentation bar's voice controls.
 * @param props The voice, the actions and the motion preference.
 * @returns The Talk control.
 */
function PresentationVoiceControls(props: PresentationVoiceControlsProps): JSX.Element {
	return <TalkControl voice={props.voice} actions={props.actions} reducedMotion={props.reducedMotion} />;
}

export { PresentationVoiceControls, type PresentationVoiceControlsProps };
