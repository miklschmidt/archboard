// The foot of a presented walkthrough's column: the key that has the walkthrough narrated, and
// that hangs the voice up while the orb is in the voice box (the agent's `NarrateKey`). It is there
// for as long as the shell has a voice to offer.

import type { JSX } from "react";

import { NarrateKey } from "@archboard/agent-surfaces";
import type { WalkthroughNarration } from "#ui/architecture-drawing/canvas/picture/rules/narration.ts";

/** Inputs for the key that has the walkthrough narrated. */
interface PresentationFootProps {
	/** The walkthrough's id. */
	readonly walkthrough: string;
	/** Narrating the walkthrough aloud, when the shell can. */
	readonly narration?: WalkthroughNarration | undefined;
}

/**
 * The foot of the column.
 * @param props The walkthrough and the narration.
 * @returns The key, or null where the shell has no voice to offer.
 */
function PresentationFoot(props: PresentationFootProps): JSX.Element | null {
	if (props.narration === undefined) return null;
	return (
		<NarrateKey
			walkthrough={props.walkthrough}
			held={props.narration.held}
			onNarrate={props.narration.start}
		/>
	);
}

export { PresentationFoot };
