// A walkthrough, presented: one step at a time, in a box over the foot of the picture.
//
// A walkthrough used to be read in a scrolling rail beside the picture, where the step on
// screen was whichever one had crossed a line a third of the way down, so the picture moved
// because of where some text happened to sit. A presentation is stepped on purpose, with the
// arrows, Space, the keys of the box or a step chosen on its rail, and the picture follows: the
// camera glides to the step and what the step is not about recedes. Escape leaves, and gives the
// reader back the camera and the view they had.
//
// The box is one plate, as wide as the pane less the margin it keeps at its foot. Along its top is
// the rail of steps, with a piece of gold that travels to the step shown. Under it the words stand
// in a column in the middle, left aligned and as wide as 64rem: each step's heading and words with
// the name of the walkthrough under them, the step's number to their left and the keys that step
// and leave to their right. Under the words, as wide as they are, is the voice's place
// (PresentationFoot): the key that has the walkthrough narrated, which the voice's orb takes over,
// and the words the voice says. A step is handed to the next by the steps' own places (see
// PresentationStep), and the box is as high as its highest step, so stepping never changes the
// room the picture has. The camera keeps the subjects of the step clear of the whole box, the voice
// included, up to half the height of the picture.
//
// The stage decides everything the picture does; this is the box and its keys. A page recording
// the walkthrough (TASK-304) steps it by itself and nobody can press anything in the video, so
// there the box keeps where it is in the walkthrough and drops the keys.

import {
	useCallback,
	useEffect,
	useRef,
	type CSSProperties,
	type JSX,
	type ReactNode,
	type RefObject,
} from "react";

import { PRESENTATION_MS } from "@archboard/timing";
import { PresentationFoot } from "#ui/components/semantic-board-canvas/PresentationFoot.tsx";
import { PresentationKeys } from "#ui/components/semantic-board-canvas/PresentationKeys.tsx";
import { PresentationRail } from "#ui/components/semantic-board-canvas/PresentationRail.tsx";
import { StepFigure, StepWords } from "#ui/components/semantic-board-canvas/PresentationStep.tsx";
import { useCaptionReserve } from "#ui/hooks/semantic-board-canvas/use-caption-reserve.ts";
import { usePresentationKeys } from "#ui/hooks/semantic-board-canvas/use-presentation-keys.ts";
import type { WalkthroughNarration } from "#ui/rules/semantic-board-canvas/walkthrough/narration.ts";
import type { VariantContent } from "@archboard/board/content";

type SemanticWalkthrough = VariantContent["walkthroughs"][number];

/** The paces the stylesheet eases the box in by, and hands a step to the next by (app.css, `semantic-presentation`). */
const BOX_STYLE: CSSProperties = {
	"--presentation-box-in-ms": `${PRESENTATION_MS.boxIn}ms`,
	"--presentation-step-ms": `${PRESENTATION_MS.boxStep}ms`,
};

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
 * Take keyboard focus into the box when it opens, when focus is on nothing or anywhere in this
 * pane's reading area: the control that presented the walkthrough steps aside with the sidebar,
 * and focus would be left on nothing. It is taken at once, while that control still holds focus,
 * because the browser lets go of it only once the sidebar is hidden. Focus somewhere else, such as
 * a field of the conversation or the other pane, is left where it is.
 * @returns The ref for the box.
 */
function useFocusWhenOpened(): RefObject<HTMLElement | null> {
	const box = useRef<HTMLElement>(null);
	useEffect(() => {
		const element = box.current;
		if (element === null) return;
		const held = document.activeElement ?? document.body;
		const area = element.closest("[data-slot='semantic-reading-area']") ?? element;
		if (held === document.body || area.contains(held)) element.focus({ preventScroll: true });
	}, []);
	return box;
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
	const box = useFocusWhenOpened();
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
			className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-5 pb-5"
		>
			<section
				ref={box}
				tabIndex={-1}
				aria-label={`Walkthrough ${walkthrough.name}`}
				aria-roledescription="presentation"
				data-slot="semantic-presentation"
				data-step={index}
				style={BOX_STYLE}
				className="bg-card border-border shadow-float rounded-panel pointer-events-auto flex w-full flex-col gap-4 border p-5 outline-none"
			>
				<PresentationRail walkthrough={walkthrough} index={index} onGo={onGo} />
				<div className="grid grid-cols-[minmax(auto,1fr)_minmax(0,64rem)_minmax(auto,1fr)] gap-x-5 gap-y-4">
					<StepFigure
						walkthrough={walkthrough}
						index={index}
						className="col-start-1 row-start-1 justify-self-end"
					/>
					<StepWords
						walkthrough={walkthrough}
						index={index}
						missing={props.missing}
						className="col-start-2 row-start-1"
					/>
					<PresentationKeys
						hasPrevious={index > 0}
						hasNext={index < count - 1}
						onPrevious={previous}
						onNext={next}
						onLeave={onLeave}
						className="col-start-3 row-start-1 justify-self-start"
					/>
					<PresentationFoot
						walkthrough={walkthrough.id}
						narration={props.narration}
						overlay={props.overlay}
						className="col-start-2 row-start-2"
					/>
				</div>
			</section>
		</div>
	);
}

export { SemanticPresentation, type SemanticPresentationProps };
