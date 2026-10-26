// The steps of the agent's plan, as the dock lists them under the voice
// circle: a check for a step done, a ring in the text's colour for the one it
// is on with how long it has been at it, a quiet ring for each to come.

import { RiCheckLine } from "@remixicon/react";
import type { JSX } from "react";

import { cn } from "@archboard/ui-kit/components";
import { clockDuration } from "@archboard/ui-kit/time";
import type { CardStep } from "#ui/rules/dock/plan-steps.ts";

/** Inputs for the steps. */
interface PlanStepsProps {
	readonly steps: readonly CardStep[];
	/** When the turn started, for the clock beside the step it is on; null when it did not. */
	readonly sinceMs: number | null;
	/** The clock. */
	readonly now: number;
}

/** What a screen reader hears before each step, by where the step stands. */
const STATE_WORDS: Readonly<Record<CardStep["state"], string>> = {
	done: "Done: ",
	now: "Now: ",
	next: "Next: ",
};

/** The type of each step, by where it stands. */
const STATE_TYPE: Readonly<Record<CardStep["state"], string>> = {
	done: "text-muted-foreground",
	now: "text-foreground font-medium",
	next: "text-muted-foreground",
};

/**
 * The plan.
 * @param props The steps, when the turn began and the clock.
 * @returns The list.
 */
function PlanSteps(props: PlanStepsProps): JSX.Element {
	return (
		<ol aria-label="The plan" className="flex flex-col">
			{props.steps.map((step) => (
				<StepRow key={step.text} step={step} sinceMs={props.sinceMs} now={props.now} />
			))}
		</ol>
	);
}

/**
 * One step: its mark, its words and, for the one the agent is on, how long.
 * @param props The step, when the turn began and the clock.
 * @param props.step The step.
 * @param props.sinceMs When the turn began, or null.
 * @param props.now The clock.
 * @returns The row.
 */
function StepRow(props: {
	readonly step: CardStep;
	readonly sinceMs: number | null;
	readonly now: number;
}): JSX.Element {
	const { step, sinceMs } = props;
	const timed = step.state === "now" && sinceMs !== null;
	return (
		<li
			data-state={step.state}
			className={cn("text-body flex h-6 items-center gap-2", STATE_TYPE[step.state])}
		>
			<span aria-hidden="true" className="flex size-4 shrink-0 items-center justify-center">
				<StepMark state={step.state} />
			</span>
			<span className="sr-only">{STATE_WORDS[step.state]}</span>
			<span className="min-w-0 flex-1 truncate">{step.text}</span>
			{timed && (
				<span className="text-technical text-muted-foreground shrink-0 font-mono">
					{clockDuration(props.now - sinceMs)}
				</span>
			)}
		</li>
	);
}

/**
 * A step's mark: a check when done, a ring otherwise, in the text's colour for the one it is on.
 * @param props Where the step stands.
 * @param props.state Done, now or next.
 * @returns The mark.
 */
function StepMark(props: { readonly state: CardStep["state"] }): JSX.Element {
	if (props.state === "done") {
		return <RiCheckLine className="text-muted-foreground size-3.5" />;
	}
	return (
		<i
			className={cn(
				"block size-2.5 rounded-full border-[1.5px]",
				props.state === "now" ? "border-foreground" : "border-muted-foreground/50",
			)}
		/>
	);
}

export { PlanSteps, type PlanStepsProps };
