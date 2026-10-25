// The steps of the plan the agent is on, each done, now or next, as the agent
// dock lists them: at most a few, around the one it is on.

import type { ConversationTurn } from "@archboard/codex-realtime-voice/controllers";

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

export { shownSteps, stepsOf, type CardStep, type StepState };
