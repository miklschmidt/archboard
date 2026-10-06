// The mute control of a live voice, one control wherever the voice's controls are
// drawn: the dock's voice line and the voice box, in the shell and in a recording.

import { RiMicLine, RiMicOffLine } from "@remixicon/react";
import type { JSX } from "react";

import { IconAction } from "@/ui/workbench/components/IconAction";
import type { AgentActions, AgentVoiceView } from "@/ui/workbench/contracts";

/** What the mute control does to a voice. */
type MuteActions = Pick<AgentActions, "mute" | "unmute">;

/** Inputs for the mute control. */
interface MuteActionProps {
	readonly voice: AgentVoiceView;
	readonly actions: MuteActions;
	/** Whether it is a key of the voice box, drawn as the dock's keys are. */
	readonly keyed?: boolean;
	/** What shapes the control where it is not an icon among icons, as at the end of the voice box. */
	readonly className?: string;
	/** Which side its tooltip opens on. */
	readonly tipSide?: "top" | "left";
}

/** The stages in which a voice can be muted or unmuted: it is connected and not ending. */
const MUTABLE: ReadonlySet<AgentVoiceView["stage"]> = new Set(["listening", "speaking", "muted"]);

/**
 * Mute the voice, or unmute it while it is muted. It is dimmed, and does nothing, while the
 * voice is still starting or already ending.
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
			disabled={voice.busy || !MUTABLE.has(voice.stage)}
			variant={props.keyed === true ? "outline" : "ghost"}
			className={props.className}
			tipSide={props.tipSide}
		>
			{muted ? <RiMicOffLine /> : <RiMicLine />}
		</IconAction>
	);
}

export { MuteAction, type MuteActions };
