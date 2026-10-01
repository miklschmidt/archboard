// What the voice card shows, derived from the agent's state: whether it is
// shown at all, and the steps of the plan it is on, each done, now or next.
//
// DEMONSTRATION: opening the page with `?voiceDemo` shows the card with an
// invented agent state, so the card can be looked at without Codex, a
// microphone or a turn. It is for screenshots of this prototype; nothing real
// reads it, and it changes nothing the agent does.

import type { ConversationTurn } from "@/ui/workbench-timeline";
import type { AgentVoiceView, VoiceStage } from "@/ui/workbench/contracts";

/** Whether a plan step is behind the agent, what it is on, or still to come. */
type StepState = "done" | "now" | "next";

/** One step of the plan, as the card lists it. */
interface CardStep {
	readonly text: string;
	readonly state: StepState;
}

/** The stages in which the card is shown: voice is on, or on its way. */
const LIVE_STAGES: ReadonlySet<VoiceStage> = new Set([
	"connecting",
	"listening",
	"speaking",
	"muted",
]);

/**
 * Whether voice is live, which is when the card is there.
 * @param voice The voice.
 * @returns True while voice is on or connecting.
 */
function voiceIsLive(voice: AgentVoiceView): boolean {
	return LIVE_STAGES.has(voice.stage);
}

/**
 * The plan of the turn the agent is on, step by step.
 * @param turn The turn running now, else the last one; undefined before any.
 * @returns The steps; none when the turn published no plan.
 */
function stepsOf(turn: ConversationTurn | undefined): readonly CardStep[] {
	const steps = turn?.plan?.steps ?? [];
	return steps.map((step) => ({
		text: step.step,
		state: step.status === "completed" ? "done" : step.status === "inProgress" ? "now" : "next",
	}));
}

/** Whether the page was opened asking for the demonstration. Read once, before the address is rewritten. */
const VOICE_DEMO: boolean =
	typeof window !== "undefined" && new URLSearchParams(window.location.search).has("voiceDemo");

/** DEMONSTRATION: the voice the card shows when the page asks for the demonstration. */
const DEMO_VOICE: AgentVoiceView = {
	stage: "speaking",
	problem: null,
	busy: false,
	level: 0.62,
	audible: true,
};

/** DEMONSTRATION: what the agent is doing, and its plan. */
const DEMO_DOING = "Reading Board persistence";
const DEMO_STEPS: readonly CardStep[] = [
	{ text: "Read the board and its parts", state: "done" },
	{ text: "Reading Board persistence", state: "now" },
	{ text: "Check how a write commits", state: "next" },
	{ text: "Answer aloud", state: "next" },
];

export {
	DEMO_DOING,
	DEMO_STEPS,
	DEMO_VOICE,
	VOICE_DEMO,
	stepsOf,
	voiceIsLive,
	type CardStep,
	type StepState,
};
