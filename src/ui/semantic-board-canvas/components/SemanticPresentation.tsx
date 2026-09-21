// A walkthrough, presented: one step at a time, its words set in the picture's
// frame.
//
// A walkthrough used to be read in a scrolling rail beside the picture, where
// the step on screen was whichever one had crossed a line a third of the way
// down, so the picture moved because of where some text happened to sit. A
// presentation is stepped on purpose — the arrows, Space, the controls, or a
// step chosen — and the picture follows: the camera glides to the step and
// what the step is not about recedes. The caption is part of the frame rather
// than of the chrome: the step's heading large, its words under it, where it
// is in the walkthrough beside them. Escape leaves, and gives the reader back
// the camera and the view they had.
//
// The stage decides everything the picture does; this is the caption, its
// controls and its keys.

import { RiArrowLeftSLine, RiArrowRightSLine, RiCloseLine, RiMicLine } from "@remixicon/react";
import { useCallback, type JSX, type ReactNode } from "react";

import type { SemanticWalkthrough } from "@/shared/semantic-board/index";
import { Button } from "@/ui/components/button";
import { useCaptionReserve } from "@/ui/semantic-board-canvas/hooks/use-caption-reserve";
import { usePresentationKeys } from "@/ui/semantic-board-canvas/hooks/use-presentation-keys";

/** Inputs for a presented walkthrough. */
interface SemanticPresentationProps {
	/** The walkthrough presented. */
	readonly walkthrough: SemanticWalkthrough;
	/** Which step is shown. */
	readonly index: number;
	/** The step's subjects this reading does not draw, in words. */
	readonly missing: readonly string[];
	/**
	 * Show a step.
	 * @param index The step.
	 */
	readonly onGo: (index: number) => void;
	/** Leave the presentation. */
	readonly onLeave: () => void;
	/**
	 * Have this walkthrough narrated aloud from its first step, when the shell can.
	 * @param walkthrough The walkthrough's id.
	 */
	readonly onNarrate?: ((walkthrough: string) => void) | undefined;
	/** What the shell lays over the picture; here it sits just above the caption, never on it. */
	readonly overlay?: ReactNode;
	/**
	 * Keep the bottom of the picture clear of the caption.
	 * @param bottom How many pixels.
	 */
	readonly reserve: (bottom: number) => void;
}

/**
 * One step's mark among all of them, which goes to that step.
 * @param props The step, whether it is shown, and what choosing it does.
 * @param props.index The step.
 * @param props.heading Its heading, for its name.
 * @param props.current Whether it is the step shown.
 * @param props.onGo Show a step.
 * @returns The mark.
 */
function StepDot(props: {
	readonly index: number;
	readonly heading: string;
	readonly current: boolean;
	readonly onGo: (index: number) => void;
}): JSX.Element {
	const { index, onGo } = props;
	const go = useCallback((): void => {
		onGo(index);
	}, [onGo, index]);
	return (
		<button
			type="button"
			data-slot="semantic-presentation-dot"
			data-step={index}
			aria-current={props.current ? "step" : undefined}
			aria-label={`Step ${index + 1}: ${props.heading}`}
			onClick={go}
			className="hit-area group flex h-6 items-center"
		>
			<span
				className={`block h-1 rounded-full transition-all ${
					props.current ? "bg-primary w-6" : "bg-muted-foreground/40 group-hover:bg-foreground w-2"
				}`}
			/>
		</button>
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

/**
 * A walkthrough presented over the picture.
 * @param props The walkthrough, the step shown, and how to step and leave.
 * @returns The caption and its controls.
 */
function SemanticPresentation(props: SemanticPresentationProps): JSX.Element {
	const { walkthrough, index, onGo, onLeave } = props;
	const count = walkthrough.beats.length;
	const beat = walkthrough.beats[index];
	usePresentationKeys({ index, count, go: onGo, leave: onLeave }, true);
	const attach = useCaptionReserve(props.reserve);
	const previous = useCallback((): void => {
		onGo(Math.max(0, index - 1));
	}, [onGo, index]);
	const next = useCallback((): void => {
		onGo(Math.min(count - 1, index + 1));
	}, [onGo, index, count]);
	const { onNarrate } = props;
	// A narration is a talk from the top, so it starts on the first step whatever
	// the reader had reached.
	const narrate = useCallback((): void => {
		onGo(0);
		onNarrate?.(walkthrough.id);
	}, [onGo, onNarrate, walkthrough.id]);
	return (
		<section
			ref={attach}
			aria-label={`Walkthrough ${walkthrough.name}`}
			aria-roledescription="presentation"
			data-slot="semantic-presentation"
			data-step={index}
			className="border-border bg-background/95 absolute inset-x-0 bottom-0 z-10 flex items-end gap-8 border-t px-8 py-6"
		>
			{props.overlay !== null && props.overlay !== undefined && (
				<div
					data-slot="semantic-stage-overlay"
					className="pointer-events-none absolute inset-x-0 bottom-full flex justify-center px-8 pb-4"
				>
					{props.overlay}
				</div>
			)}
			<div className="flex min-w-0 flex-1 flex-col gap-2" aria-live="polite">
				<p className="text-kicker text-muted-foreground flex items-center gap-2 uppercase">
					<span
						data-slot="semantic-presentation-count"
						className="text-technical font-mono normal-case"
					>
						{index + 1} / {count}
					</span>
					<span aria-hidden="true">·</span>
					<span className="truncate">{walkthrough.name}</span>
				</p>
				{beat !== undefined && (
					<div key={beat.id} className="animate-in fade-in flex flex-col gap-2 duration-300">
						<h2
							data-slot="semantic-presentation-heading"
							className="text-presentation text-balance"
						>
							{beat.heading}
						</h2>
						<p className="text-title max-w-[72ch] font-normal whitespace-pre-line">{beat.body}</p>
						<StepMissing missing={props.missing} />
					</div>
				)}
			</div>
			<div className="flex shrink-0 flex-col items-end gap-3">
				{props.onNarrate !== undefined && (
					<Button
						type="button"
						variant="outline"
						size="sm"
						data-slot="semantic-presentation-narrate"
						onClick={narrate}
					>
						<RiMicLine />
						Narrate
					</Button>
				)}
				<Button
					type="button"
					variant="ghost"
					size="sm"
					data-slot="semantic-presentation-leave"
					aria-label="Leave the walkthrough"
					onClick={onLeave}
				>
					<RiCloseLine />
					<span className="text-muted-foreground text-technical font-mono">Esc</span>
				</Button>
				<nav aria-label="Steps" className="flex items-center gap-1">
					{walkthrough.beats.map((one, at) => (
						<StepDot
							key={one.id}
							index={at}
							heading={one.heading}
							current={at === index}
							onGo={onGo}
						/>
					))}
				</nav>
				<div className="flex items-center gap-2">
					<Button
						type="button"
						variant="outline"
						size="icon-sm"
						data-slot="semantic-presentation-previous"
						aria-label="Previous step"
						disabled={index === 0}
						onClick={previous}
					>
						<RiArrowLeftSLine />
					</Button>
					<Button
						type="button"
						variant="outline"
						size="icon-sm"
						data-slot="semantic-presentation-next"
						aria-label="Next step"
						disabled={index >= count - 1}
						onClick={next}
					>
						<RiArrowRightSLine />
					</Button>
				</div>
			</div>
		</section>
	);
}

export { SemanticPresentation, type SemanticPresentationProps };
