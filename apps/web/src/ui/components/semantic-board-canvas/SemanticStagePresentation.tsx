// What a semantic pane does while one of its walkthroughs is presented: the
// caption over the picture, and the veil over whatever the step is not about.
//
// A group somebody selected is let go when a walkthrough opens, and a
// walkthrough is left when somebody selects a group: both say what the reader
// is attending to, and the picture says one of them at a time.

import type { CSSProperties, JSX, ReactNode } from "react";

import { SIDEBAR_WIDTH } from "@archboard/renderer/shell-geometry";
import { SemanticPresentation } from "#ui/components/semantic-board-canvas/SemanticPresentation.tsx";
import type { Sidebar } from "#ui/hooks/semantic-board-canvas/use-sidebar.ts";
import type { WalkthroughReading } from "#ui/hooks/semantic-board-canvas/use-walkthrough.ts";
import type { ChosenQuestion } from "#ui/rules/semantic-board-canvas/board/design-questions.ts";
import type { GroupSelection } from "#ui/rules/semantic-board-canvas/board/groups.ts";
import type { BeatFocus } from "#ui/rules/semantic-board-canvas/walkthrough/narrative.ts";
import type { WalkthroughNarration } from "#ui/rules/semantic-board-canvas/walkthrough/narration.ts";

/** What a floating sidebar covers of the picture's right edge, with the overlay's own gutter beyond it. */
const CLEAR_OF_SIDEBAR: CSSProperties = { paddingRight: `calc(${SIDEBAR_WIDTH}px + 2rem)` };

/** What the stage hands the presentation. */
interface PresentationView {
	/** The walkthroughs, and the one presented. */
	readonly narrative: WalkthroughReading;
	/** What the step shown asks of the picture. */
	readonly focus: BeatFocus;
	/** The step's subjects this reading does not draw, in words. */
	readonly missing: readonly string[];
	/** Leave the presentation. */
	readonly onCloseNarrative: () => void;
	/** Narrating the open walkthrough aloud, when the shell can. */
	readonly narration: WalkthroughNarration | undefined;
	/** What the shell lays over the picture, such as subtitles of a voice; or nothing. */
	readonly overlay: ReactNode;
	/** The pane's camera, which keeps its fits clear of the caption. */
	readonly camera: { readonly reserve: (bottom: number) => void };
	/** The sidebar, which the overlay keeps clear of while it floats over the picture. */
	readonly sidebar: Pick<Sidebar, "floating">;
	/** The selected group and its members, or null. */
	readonly group: GroupSelection | null;
	/** The design question chosen, the subjects its answer names and the one the person is at, or null. */
	readonly question: ChosenQuestion | null;
}

/**
 * The caption over the picture, while a walkthrough is presented.
 * @param view What the stage knows.
 * @returns The caption, or null when nothing is presented.
 */
function presentationOver(view: PresentationView): ReactNode {
	const { narrative } = view;
	if (narrative.open === null) {
		// Low in the frame, over the picture and over the About page, taking no pointer input from
		// the canvas under it, and clear of a sidebar that floats over its right edge.
		return view.overlay === null || view.overlay === undefined ? null : (
			<div
				data-slot="semantic-stage-overlay"
				style={view.sidebar.floating ? CLEAR_OF_SIDEBAR : undefined}
				className="pointer-events-none absolute inset-x-0 bottom-6 z-25 flex justify-center px-8"
			>
				{view.overlay}
			</div>
		);
	}
	return (
		<SemanticPresentation
			overlay={view.overlay}
			walkthrough={narrative.open}
			index={narrative.beatIndex}
			missing={view.missing}
			onGo={narrative.goTo}
			onLeave={view.onCloseNarrative}
			narration={view.narration}
			reserve={view.camera.reserve}
		/>
	);
}

/**
 * What the picture is told to mark beyond the single selection: the selected
 * group's members, the step through the chosen design question's answer, and
 * the veil over what a presented step is not about.
 * @param view What the stage knows.
 * @returns The selected group, the step, and what the veil leaves standing.
 */
function pictureMarks(view: PresentationView): {
	readonly group: GroupSelection | null;
	readonly answer: ChosenQuestion | null;
	readonly veil: ReadonlySet<string> | null;
} {
	const { group, question, narrative, focus } = view;
	const veiled = narrative.open !== null && focus.drawn.length > 0;
	return {
		group,
		answer: question,
		veil: veiled ? new Set(focus.drawn) : null,
	};
}

/**
 * The pane's reading area, marked while a walkthrough is presented so the
 * sidebar can step aside for it.
 * @param props Whether one is presented, and what the area holds.
 * @param props.presenting Whether a walkthrough is presented.
 * @param props.children The sidebar and the picture.
 * @returns The area.
 */
function ReadingArea(props: {
	readonly presenting: boolean;
	readonly children: ReactNode;
}): JSX.Element {
	return (
		// A floating sidebar eases in from the pane's right edge, so the area clips what
		// is drawn outside it: a panel never shows over the pane beside this one.
		<div
			data-slot="semantic-reading-area"
			data-walkthrough={props.presenting ? "" : undefined}
			className="flex min-h-0 min-w-0 flex-1 overflow-clip"
		>
			{props.children}
		</div>
	);
}

export { ReadingArea, pictureMarks, presentationOver, type PresentationView };
