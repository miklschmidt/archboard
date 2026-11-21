// Narrating a walkthrough aloud (TASK-251). A pane knows nothing about voice and
// voice knows nothing about walkthroughs: the shell is where they meet.
//
// Every pane offers narration, so its walkthrough rows are the same whichever
// pane is active and whatever voice is doing. Talk sets up whatever is missing,
// so a narration needs no voice to be ready first. It cannot start while a
// session runs, because that session was started for something else, and the
// panes say so instead of withdrawing the control. A narration asked for in a
// pane that is not active makes that pane active first; the agent starts it
// once the voice has followed.

import { useEffect, useMemo, useState } from "react";

import { durationMs } from "@archboard/timing";

import { useAgentVoice, type VoiceStage } from "@archboard/agent-surfaces";
import { offerNarration } from "#ui/application/rules/narration-offer.ts";
import type { WalkthroughNarration } from "#ui/architecture-drawing/canvas/picture/rules/narration.ts";

/** What every pane is offered. */
interface Narration {
	/**
	 * What one pane is offered: starting voice for that pane's model, which makes
	 * the pane the active one first. The same object for a pane for as long as
	 * voice is as it is, so that a pane is not drawn again for being offered it.
	 * @param paneId The pane.
	 * @returns The pane's narration.
	 */
	readonly forPane: (paneId: string) => WalkthroughNarration;
}

/** What a narration cannot start for while voice is on, in the words a held control shows. */
const VOICE_IS_ON = "Voice is on. End it to narrate.";

/**
 * What a narration cannot start for at each stage of voice. Voice can be ended
 * from the moment it connects, so only then does the reason say to end it.
 */
const HELD_WORDS: Readonly<Record<Exclude<VoiceStage, "idle">, string>> = {
	preparing: "Voice is starting.",
	connecting: VOICE_IS_ON,
	listening: VOICE_IS_ON,
	speaking: VOICE_IS_ON,
	muted: VOICE_IS_ON,
	stopping: "Voice is ending.",
};

/**
 * Whether a step has to wait for voice: while it connects, and for a moment after.
 * @param stage The stage of voice.
 * @returns True until the voice model can take a step in.
 */
function useVoiceStarting(stage: VoiceStage): boolean {
	const connecting = stage === "preparing" || stage === "connecting";
	const [settled, setSettled] = useState(true);
	if (connecting && settled) setSettled(false);
	useEffect(() => {
		if (connecting || settled) return undefined;
		const timer = setTimeout(() => {
			setSettled(true);
		}, durationMs("voice.firstStepSettle"));
		return (): void => {
			clearTimeout(timer);
		};
	}, [connecting, settled]);
	return connecting || !settled;
}

/**
 * Narration for every pane.
 * @param selectPane Make a pane the active one.
 * @returns What every pane is offered; the same object until voice starts or ends.
 */
function useNarration(selectPane: (paneId: string) => void): Narration {
	const { stage, talk } = useAgentVoice();
	const held = stage === "idle" ? null : HELD_WORDS[stage];
	const starting = useVoiceStarting(stage);
	return useMemo(
		() => ({
			forPane: offerNarration(
				(paneId, walkthrough) => {
					if (held !== null) return;
					selectPane(paneId);
					talk(paneId, walkthrough);
				},
				held,
				starting,
			),
		}),
		[talk, selectPane, held, starting],
	);
}

export { useNarration, type Narration };
