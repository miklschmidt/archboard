// A walkthrough, presented: one step at a time, in a column beside the picture, as the site's
// walkthrough player sets it.
//
// A walkthrough used to be read in a scrolling rail beside the picture, where the step on
// screen was whichever one had crossed a line a third of the way down, so the picture moved
// because of where some text happened to sit. A presentation is stepped on purpose, with the
// arrows, Space, the keys of the column or a step chosen on its rail, and the picture follows: the
// camera glides to the step and what the step is not about recedes. Escape leaves, and gives the
// reader back the camera and the view they had.
//
// The column stands where the right panel stands while nothing is presented, a little wider. Along
// its top is the rail of steps, with a piece of gold that travels to the step shown. Under it are
// the step's number and its heading and words, with the name of the walkthrough under them. At its
// foot is the key that has the walkthrough narrated (PresentationFoot), then the keys that step and
// leave. The voice and its words stay where the shell lays them, low over the picture. A step is
// handed to the next by the steps' own places (see PresentationStep), and every step
// stands in one cell, so stepping never moves the foot. The picture is as wide as the column
// leaves it, so the camera fits the step to all of its viewport and keeps nothing clear.
//
// The stage decides everything the picture does; this is the column and its keys. A page recording
// the walkthrough (TASK-304) steps it by itself and nobody can press anything in the video, so
// there the column keeps where it is in the walkthrough and drops the keys.

import {
	useCallback,
	useEffect,
	useRef,
	type CSSProperties,
	type JSX,
	type RefObject,
} from "react";

import { PRESENTATION_MS } from "@archboard/timing";
import { PresentationFoot } from "#ui/architecture-drawing/canvas/presentation/components/PresentationFoot.tsx";
import { PresentationKeys } from "#ui/architecture-drawing/canvas/presentation/components/PresentationKeys.tsx";
import { PresentationRail } from "#ui/architecture-drawing/canvas/presentation/components/PresentationRail.tsx";
import {
	StepFigure,
	StepWords,
} from "#ui/architecture-drawing/canvas/presentation/components/PresentationStep.tsx";
import { usePresentationKeys } from "#ui/architecture-drawing/canvas/picture/hooks/use-presentation-keys.ts";
import type { WalkthroughNarration } from "#ui/architecture-drawing/canvas/picture/rules/narration.ts";
import type { VariantContent } from "@archboard/model/content";

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
 * A walkthrough presented beside the picture.
 * @param props The walkthrough, the step shown, and how to step and leave.
 * @returns The column.
 */
function SemanticPresentation(props: SemanticPresentationProps): JSX.Element {
	const { walkthrough, index, onGo, onLeave } = props;
	const count = walkthrough.beats.length;
	usePresentationKeys({ index, count, go: onGo, leave: onLeave }, true);
	const box = useFocusWhenOpened();
	const previous = useCallback((): void => {
		onGo(Math.max(0, index - 1));
	}, [onGo, index]);
	const next = useCallback((): void => {
		onGo(Math.min(count - 1, index + 1));
	}, [onGo, index, count]);
	return (
		<div
			data-slot="semantic-presentation-frame"
			className="border-border bg-sidebar shadow-edge-side relative z-30 flex min-h-0 w-[min(400px,46%)] shrink-0 flex-col border-l"
		>
			<section
				ref={box}
				tabIndex={-1}
				aria-label={`Walkthrough ${walkthrough.name}`}
				aria-roledescription="presentation"
				data-slot="semantic-presentation"
				data-step={index}
				style={BOX_STYLE}
				className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5 outline-none"
			>
				<PresentationRail walkthrough={walkthrough} index={index} onGo={onGo} />
				<div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4">
					<StepFigure walkthrough={walkthrough} index={index} className="self-start" />
					<StepWords walkthrough={walkthrough} index={index} missing={props.missing} />
				</div>
				<div className="mt-auto flex flex-col gap-3">
					<PresentationFoot walkthrough={walkthrough.id} narration={props.narration} />
					<PresentationKeys
						hasPrevious={index > 0}
						hasNext={index < count - 1}
						onPrevious={previous}
						onNext={next}
						onLeave={onLeave}
						className="justify-end"
					/>
				</div>
			</section>
		</div>
	);
}

export { SemanticPresentation, type SemanticPresentationProps };
