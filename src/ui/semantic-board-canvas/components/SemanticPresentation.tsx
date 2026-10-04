// A walkthrough, presented: one step at a time, in a box over the foot of the picture.
//
// A walkthrough used to be read in a scrolling rail beside the picture, where the step on
// screen was whichever one had crossed a line a third of the way down, so the picture moved
// because of where some text happened to sit. A presentation is stepped on purpose, with the
// arrows, Space, the keys of the box or a step chosen on its rail, and the picture follows: the
// camera glides to the step and what the step is not about recedes. Escape leaves, and gives the
// reader back the camera and the view they had.
//
// The box is one plate. Along its top is the rail of steps, with the one shown in gold. Under it
// are the step's number, its heading and words and the name of the walkthrough, and at their end
// the keys that step and leave. At its foot is the voice's place (PresentationFoot): the key that
// has the walkthrough narrated, which the voice's orb takes over, and the words the voice says.
// Everything the box holds is kept clear of by the camera, the voice included, so nothing the
// voice says covers a subject of the step.
//
// The stage decides everything the picture does; this is the box and its keys. A page recording
// the walkthrough (TASK-304) steps it by itself and nobody can press anything in the video, so
// there the box keeps where it is in the walkthrough and drops the keys.

import { useCallback, type CSSProperties, type JSX, type ReactNode } from "react";

import type { SemanticWalkthrough } from "@/shared/semantic-board/index";
import { PRESENTATION_BOX_IN_MS } from "@/shared/timing/timing";
import { PresentationFoot } from "@/ui/semantic-board-canvas/components/PresentationFoot";
import { PresentationKeys } from "@/ui/semantic-board-canvas/components/PresentationKeys";
import { PresentationRail } from "@/ui/semantic-board-canvas/components/PresentationRail";
import { StepFigure, StepWords } from "@/ui/semantic-board-canvas/components/PresentationStep";
import { useCaptionReserve } from "@/ui/semantic-board-canvas/hooks/use-caption-reserve";
import { usePresentationKeys } from "@/ui/semantic-board-canvas/hooks/use-presentation-keys";
import type { WalkthroughNarration } from "@/ui/semantic-board-canvas/lib/narration";

/** The pace the stylesheet eases the box in by (app.css, `semantic-presentation`). */
const BOX_STYLE: CSSProperties = { "--presentation-box-in-ms": `${PRESENTATION_BOX_IN_MS}ms` };

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
	/** Narrating this walkthrough aloud from its first step, when the shell can. */
	readonly narration?: WalkthroughNarration | undefined;
	/** What the shell lays over the picture; here it is drawn at the foot of the box, never over its words. */
	readonly overlay?: ReactNode;
	/**
	 * Keep the bottom of the picture clear of the box.
	 * @param bottom How many pixels.
	 */
	readonly reserve: (bottom: number) => void;
}

/**
 * A walkthrough presented over the picture.
 * @param props The walkthrough, the step shown, and how to step and leave.
 * @returns The box.
 */
function SemanticPresentation(props: SemanticPresentationProps): JSX.Element {
	const { walkthrough, index, onGo, onLeave } = props;
	const count = walkthrough.beats.length;
	usePresentationKeys({ index, count, go: onGo, leave: onLeave }, true);
	const attach = useCaptionReserve(props.reserve);
	const previous = useCallback((): void => {
		onGo(Math.max(0, index - 1));
	}, [onGo, index]);
	const next = useCallback((): void => {
		onGo(Math.min(count - 1, index + 1));
	}, [onGo, index, count]);
	return (
		// The frame is what the camera keeps clear: the box and the gap under it. It takes no pointer
		// input beside the box, because the picture there is the reader's to work with.
		<div
			ref={attach}
			data-slot="semantic-presentation-frame"
			className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center px-6 pb-5"
		>
			<section
				aria-label={`Walkthrough ${walkthrough.name}`}
				aria-roledescription="presentation"
				data-slot="semantic-presentation"
				data-step={index}
				style={BOX_STYLE}
				className="bg-card border-border shadow-float rounded-panel pointer-events-auto flex w-full max-w-[55rem] flex-col gap-4 border p-5"
			>
				<PresentationRail walkthrough={walkthrough} index={index} onGo={onGo} />
				<div className="flex gap-5">
					<StepFigure index={index} count={count} />
					<StepWords walkthrough={walkthrough} index={index} missing={props.missing} />
					<PresentationKeys
						hasPrevious={index > 0}
						hasNext={index < count - 1}
						onPrevious={previous}
						onNext={next}
						onLeave={onLeave}
					/>
				</div>
				<PresentationFoot
					walkthrough={walkthrough.id}
					narration={props.narration}
					overlay={props.overlay}
				/>
			</section>
		</div>
	);
}

export { SemanticPresentation, type SemanticPresentationProps };
