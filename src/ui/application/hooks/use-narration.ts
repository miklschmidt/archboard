// Narrating a walkthrough aloud (TASK-251). A pane knows nothing about voice and
// voice knows nothing about walkthroughs: the shell is where they meet.
//
// Every pane offers narration, so its walkthrough rows are the same whichever
// pane is active and whatever voice is doing. Talk sets up whatever is missing,
// so a narration needs no voice to be ready first. It cannot start while a
// session runs, because that session was started for something else, and the
// panes say so instead of withdrawing the control. Which pane voice is started
// for, and when, is the narrator's (narrator.ts).

import { useEffect, useMemo } from "react";

import type { AgentSetup } from "@archboard/workbench/agent";
import { narrate } from "@/ui/application/agent-setup-ports";
import { createNarrator, offerNarration } from "@/ui/application/narrator";
import type { WalkthroughNarration } from "@/ui/semantic-board-canvas";
import type { AgentVoiceView, VoiceStage } from "@archboard/workbench/voice";

/** What narrating reads of the agent over the panes. */
interface NarrationSources {
	/** The agent setup, which Talk starts voice through. */
	readonly setup: Pick<AgentSetup, "snapshot" | "talk">;
	/** The voice session, which follows one pane, or null while its pane has none. */
	readonly voice: { readonly paneId: string } | null;
}

/** What every pane is offered. */
interface Narration {
	/**
	 * What one pane is offered: starting voice for that pane's board, which makes
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
 * Narration for every pane.
 * @param workbench What narrating reads of the agent over the panes.
 * @param voice The voice as the agent dock shows it.
 * @param activePaneId The active pane.
 * @param selectPane Make a pane the active one.
 * @returns What every pane is offered; the same object until voice starts or ends.
 */
function useNarration(
	workbench: NarrationSources,
	voice: AgentVoiceView,
	activePaneId: string,
	selectPane: (paneId: string) => void,
): Narration {
	const { setup } = workbench;
	const idle = voice.stage === "idle";
	const held = voice.stage === "idle" ? null : HELD_WORDS[voice.stage];
	const followed = workbench.voice?.paneId ?? null;
	const narrator = useMemo(
		() =>
			createNarrator({
				/**
				 * Start voice for the pane it follows.
				 * @param walkthrough The walkthrough's id.
				 */
				talk: (walkthrough) => {
					narrate(setup, walkthrough);
				},
				select: selectPane,
			}),
		[setup, selectPane],
	);
	useEffect(() => {
		narrator.sync({ active: activePaneId, followed, idle });
	}, [narrator, activePaneId, followed, idle]);
	return useMemo(() => ({ forPane: offerNarration(narrator, held) }), [held, narrator]);
}

export { useNarration, type Narration };
