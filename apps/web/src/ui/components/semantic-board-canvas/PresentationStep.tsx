// The steps a presented walkthrough's box shows: each step's number, set the way a drawing's sheet
// number is, and beside it each step's heading and words, with the name of the walkthrough under
// the words. When this reading does not draw some subjects of the step shown, that line says so
// after the name, so the notice changes no height.
//
// Every step stands in one cell, so the cell is as high as the highest step and the box keeps one
// height from the first step to the last. Which step is shown is a matter of where each one stands
// against it: the steps before it wait on its left (the number's: above), the steps after it on its
// right (below), and the stylesheet (app.css, `presentation-slides`) slides them in and out. A step
// chosen out of order slides the same way, and a reader who steps again at once turns the move
// round from where it is. What is drawn is the same words that the live region says, once, so the
// drawn steps are hidden from assistive technology, and the ones that are not shown can neither be
// focused nor found.

import type { JSX } from "react";

import { cn } from "@archboard/ui-kit/class-names";
import type { VariantContent } from "@archboard/board/content";

type SemanticWalkthrough = VariantContent["walkthroughs"][number];

/** Where a step stands against the one shown. */
type Place = "before" | "shown" | "after";

/**
 * Where a step stands against the one shown.
 * @param step The step.
 * @param shown The step shown.
 * @returns Before it, shown, or after it.
 */
function placeOf(step: number, shown: number): Place {
	if (step === shown) return "shown";
	return step < shown ? "before" : "after";
}

/** Inputs for the steps' numbers. */
interface StepFigureProps {
	/** The walkthrough, for the steps it has. */
	readonly walkthrough: SemanticWalkthrough;
	/** Which step is shown. */
	readonly index: number;
	/** What places the cell in the box. */
	readonly className?: string;
}

/**
 * The number of the step shown, and how many steps there are. The numbers roll like the digits of
 * a flip board: the one before leaves upwards and the next rises in, and stepping back runs it the
 * other way.
 * @param props The walkthrough, the step shown and what places the cell.
 * @returns The figure.
 */
function StepFigure(props: StepFigureProps): JSX.Element {
	const { beats } = props.walkthrough;
	return (
		<div
			aria-hidden="true"
			data-slot="semantic-presentation-count"
			className={cn(
				"border-border flex w-14 shrink-0 flex-col items-center justify-center gap-0.5 border-r pr-5",
				props.className,
			)}
		>
			<div data-slot="presentation-figures" className="grid overflow-clip">
				{beats.map((beat, at) => (
					<span
						key={beat.id}
						data-place={placeOf(at, props.index)}
						className="title-figure col-start-1 row-start-1"
					>
						{at + 1}
					</span>
				))}
			</div>
			<span className="text-technical text-muted-foreground font-mono">of {beats.length}</span>
		</div>
	);
}

/**
 * What a step says about subjects this reading does not draw, after the walkthrough's name on the
 * one line under the words. It is cut short rather than wrapped, so it never adds a line, and its
 * title holds the whole sentence.
 * @param props The subjects, in words.
 * @param props.missing Their names.
 * @returns The sentence, or nothing when every subject is drawn.
 */
function StepMissing(props: { readonly missing: readonly string[] }): JSX.Element | null {
	if (props.missing.length === 0) {
		return null;
	}
	const words = `This reading does not draw ${props.missing.join(", ")}.`;
	return (
		<>
			<span aria-hidden="true">·</span>
			<span data-slot="semantic-beat-missing" className="min-w-0 truncate" title={words}>
				{words}
			</span>
		</>
	);
}

/** Inputs for the steps' words. */
interface StepWordsProps {
	/** The walkthrough, for its steps and its name. */
	readonly walkthrough: SemanticWalkthrough;
	/** Which step is shown. */
	readonly index: number;
	/** The step shown's subjects this reading does not draw, in words. */
	readonly missing: readonly string[];
	/** What places the column in the box. */
	readonly className?: string;
}

/**
 * The words of each step, with the one shown in place, and under them the name of the walkthrough.
 * The live region says the step shown once, with its place among the steps, whenever it changes.
 * @param props The walkthrough, the step shown, what the reading does not draw and what places the column.
 * @returns The words.
 */
function StepWords(props: StepWordsProps): JSX.Element {
	const { walkthrough, index } = props;
	const beat = walkthrough.beats[index];
	return (
		<div className={cn("flex min-w-0 flex-col gap-2", props.className)}>
			<output className="sr-only">
				{beat === undefined
					? null
					: `Step ${index + 1} of ${walkthrough.beats.length}. ${beat.heading}. ${beat.body}`}
			</output>
			<div aria-hidden="true" data-slot="presentation-slides" className="grid overflow-clip">
				{walkthrough.beats.map((one, at) => {
					const place = placeOf(at, index);
					return (
						<div
							key={one.id}
							data-place={place}
							inert={place !== "shown"}
							className="col-start-1 row-start-1 flex flex-col gap-2"
						>
							<h2
								data-slot={place === "shown" ? "semantic-presentation-heading" : undefined}
								className="text-presentation text-balance"
							>
								{one.heading}
							</h2>
							<p className="text-reading whitespace-pre-line">{one.body}</p>
						</div>
					);
				})}
			</div>
			<p className="text-body text-muted-foreground flex min-w-0 gap-2">
				<span data-slot="semantic-presentation-name" className="max-w-1/2 shrink-0 truncate">
					{walkthrough.name}
				</span>
				<StepMissing missing={props.missing} />
			</p>
		</div>
	);
}

export { StepFigure, StepWords, type StepFigureProps, type StepWordsProps };
