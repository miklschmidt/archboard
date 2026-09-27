// What a semantic pane does while one of its walkthroughs is presented: the
// caption over the picture, and the veil over whatever the step is not about.
//
// A group somebody selected is let go when a walkthrough opens, and a
// walkthrough is left when somebody selects a group: both say what the reader
// is attending to, and the picture says one of them at a time.

import type { JSX, ReactNode } from "react";

import { SemanticPresentation } from "@/ui/semantic-board-canvas/components/SemanticPresentation";
import type { WalkthroughReading } from "@/ui/semantic-board-canvas/hooks/use-walkthrough";
import type { GroupSelection } from "@/ui/semantic-board-canvas/lib/groups";
import type { BeatFocus } from "@/ui/semantic-board-canvas/lib/narrative";

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
	/** Have the open walkthrough narrated, when the shell can. */
	readonly onNarrate: ((walkthrough: string) => void) | undefined;
	/** What the shell lays over the picture, such as subtitles of a voice; or nothing. */
	readonly overlay: ReactNode;
	/** The pane's camera, which keeps its fits clear of the caption. */
	readonly camera: { readonly reserve: (bottom: number) => void };
	/** The selected group and its members, or null. */
	readonly selectedGroup: GroupSelection | null;
}

/**
 * The caption over the picture, while a walkthrough is presented.
 * @param view What the stage knows.
 * @returns The caption, or null when nothing is presented.
 */
function presentationOver(view: PresentationView): ReactNode {
	const { narrative } = view;
	if (narrative.open === null) {
		// Low in the frame, over the picture, taking no pointer input from the canvas under it.
		return view.overlay === null || view.overlay === undefined ? null : (
			<div
				data-slot="semantic-stage-overlay"
				className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center px-8"
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
			onNarrate={view.onNarrate}
			reserve={view.camera.reserve}
		/>
	);
}

/**
 * What the picture is told to mark beyond the single selection: the selected
 * group's members, and the veil over what a presented step is not about.
 * @param view What the stage knows.
 * @returns The selected group, and what the veil leaves standing.
 */
function pictureMarks(view: PresentationView): {
	readonly group: GroupSelection | null;
	readonly veil: ReadonlySet<string> | null;
} {
	const { selectedGroup, narrative, focus } = view;
	const veiled = narrative.open !== null && focus.drawn.length > 0;
	return { group: selectedGroup, veil: veiled ? new Set(focus.drawn) : null };
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
		<div
			data-slot="semantic-reading-area"
			data-walkthrough={props.presenting ? "" : undefined}
			className="flex min-h-0 min-w-0 flex-1"
		>
			{props.children}
		</div>
	);
}

export { ReadingArea, pictureMarks, presentationOver, type PresentationView };
