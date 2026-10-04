// The step a presented walkthrough's box shows: its number among all of them, set the way a
// drawing's sheet number is, and beside it the step's heading, its words, and the name of the
// walkthrough they belong to.

import type { JSX } from "react";

import type { SemanticWalkthrough } from "@/shared/semantic-board/index";

/** Inputs for the step's number. */
interface StepFigureProps {
	/** Which step is shown. */
	readonly index: number;
	/** How many steps there are. */
	readonly count: number;
}

/**
 * The step's number, and how many there are.
 * @param props The step and the count.
 * @returns The figure.
 */
function StepFigure(props: StepFigureProps): JSX.Element {
	return (
		<div
			data-slot="semantic-presentation-count"
			className="border-border flex w-14 shrink-0 flex-col items-center justify-center gap-0.5 border-r pr-5"
		>
			<span className="title-figure">{props.index + 1}</span>
			<span className="text-technical text-muted-foreground font-mono">of {props.count}</span>
		</div>
	);
}

/**
 * What a step says about subjects this reading does not draw.
 * @param props The subjects, in words.
 * @param props.missing Their names.
 * @returns The sentence, or nothing when every subject is drawn.
 */
function StepMissing(props: { readonly missing: readonly string[] }): JSX.Element | null {
	if (props.missing.length === 0) {
		return null;
	}
	return (
		<p data-slot="semantic-beat-missing" className="text-muted-foreground text-body">
			This reading does not draw {props.missing.join(", ")}.
		</p>
	);
}

/** Inputs for the step's words. */
interface StepWordsProps {
	/** The walkthrough, for its name. */
	readonly walkthrough: SemanticWalkthrough;
	/** Which step is shown. */
	readonly index: number;
	/** The step's subjects this reading does not draw, in words. */
	readonly missing: readonly string[];
}

/**
 * The step's heading and words, which are announced as the step changes, and under them the name
 * of the walkthrough.
 * @param props The walkthrough, the step and what the reading does not draw.
 * @returns The words.
 */
function StepWords(props: StepWordsProps): JSX.Element {
	const { walkthrough } = props;
	const beat = walkthrough.beats[props.index];
	return (
		<div className="flex min-w-0 flex-1 flex-col gap-2">
			<div aria-live="polite" className="flex min-w-0 flex-col gap-2">
				{beat !== undefined && (
					<div
						key={beat.id}
						className="animate-in fade-in flex min-w-0 flex-col gap-2 duration-200 motion-reduce:animate-none"
					>
						<h2
							data-slot="semantic-presentation-heading"
							className="text-presentation text-balance"
						>
							{beat.heading}
						</h2>
						<p className="text-reading max-w-[66ch] whitespace-pre-line">{beat.body}</p>
						<StepMissing missing={props.missing} />
					</div>
				)}
			</div>
			<p
				data-slot="semantic-presentation-name"
				className="text-body text-muted-foreground truncate"
			>
				{walkthrough.name}
			</p>
		</div>
	);
}

export { StepFigure, StepWords, type StepFigureProps, type StepWordsProps };
