// The steps of the plan the agent is on, each done, now or next, as the agent
// dock lists them: at most a few, around the one it is on.
//
// DEMONSTRATION: opening the page with `?voiceDemo` shows the dock with an
// invented agent state and a speaking voice, so it can be looked at without
// Codex, a microphone or a turn. The browser tests and screenshots use it;
// nothing real reads it, and it changes nothing the agent does.

import type { ConversationTurn } from "@/ui/workbench-timeline";
import type { AgentVoiceView } from "@/ui/workbench/contracts";
import { SPEAKING_LEVEL, VOICE_DEMO_CYCLE } from "@/ui/workbench/lib/voice-demo";

/** Whether a plan step is behind the agent, what it is on, or still to come. */
type StepState = "done" | "now" | "next";

/** One step of the plan, as the dock lists it. */
interface CardStep {
	readonly text: string;
	readonly state: StepState;
}

/** The most steps the dock lists at once. */
const SHOWN_STEPS = 4;

/**
 * The steps the dock lists: all of a short plan, else a window that starts one
 * step before the one the agent is on, so what was just done, what is being
 * done and what comes next are on screen together.
 * @param steps The plan's steps.
 * @returns The steps shown.
 */
function shownSteps(steps: readonly CardStep[]): readonly CardStep[] {
	if (steps.length <= SHOWN_STEPS) return steps;
	const now = steps.findIndex((step) => step.state === "now");
	const at = now < 0 ? steps.findIndex((step) => step.state === "next") : now;
	const start = Math.max(0, Math.min((at < 0 ? steps.length : at) - 1, steps.length - SHOWN_STEPS));
	return steps.slice(start, start + SHOWN_STEPS);
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

/**
 * Whether the page was opened asking for the invented turn, with the voice
 * speaking (`?voiceDemo`). `?voiceDemo=cycle` asks for the voice's stages instead
 * (lib/voice-demo.ts) and leaves the agent's real state. Read once, before the
 * address is rewritten.
 */
const VOICE_DEMO: boolean =
	typeof window !== "undefined" &&
	new URLSearchParams(window.location.search).has("voiceDemo") &&
	!VOICE_DEMO_CYCLE;

/** DEMONSTRATION: the voice the dock shows when the page asks for the demonstration. */
const DEMO_VOICE: AgentVoiceView = {
	stage: "speaking",
	problem: null,
	busy: false,
	level: SPEAKING_LEVEL,
};

/** DEMONSTRATION: what the agent is doing. */
const DEMO_DOING = "Reading Board persistence";
/** DEMONSTRATION: when the invented turn began, a little over a minute ago. */
const DEMO_SINCE_MS = Date.now() - 72_000;
/** DEMONSTRATION: its plan. */
const DEMO_STEPS: readonly CardStep[] = [
	{ text: "Read the board and its parts", state: "done" },
	{ text: "Reading Board persistence", state: "now" },
	{ text: "Check how a write commits", state: "next" },
	{ text: "Answer aloud", state: "next" },
];

export {
	DEMO_DOING,
	DEMO_SINCE_MS,
	DEMO_STEPS,
	DEMO_VOICE,
	VOICE_DEMO,
	shownSteps,
	stepsOf,
	type CardStep,
	type StepState,
};
