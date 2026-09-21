// What a semantic pane does while one of its walkthroughs is presented: the
// caption over the picture, and the veil over whatever the step is not about.
//
// The veil is group inspection's own treatment, lit for the step's subjects:
// one way of saying "this, and not the rest" in the picture, whichever of the
// two is asking. A group somebody is inspecting is let go when a walkthrough
// opens, so the two never compete for it.

import type { JSX, ReactNode } from "react";

import { SemanticPresentation } from "@/ui/semantic-board-canvas/components/SemanticPresentation";
import type { WalkthroughReading } from "@/ui/semantic-board-canvas/hooks/use-walkthrough";
import type { GroupFocus } from "@/ui/semantic-board-canvas/lib/groups";
import type { BeatFocus } from "@/ui/semantic-board-canvas/lib/narrative";
import type { GroupMarks } from "@/ui/semantic-board-canvas/lib/subjects";

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
	/** The group under inspection, or null. */
	readonly groupFocus: GroupFocus | null;
}

/** Nothing receding: no group under inspection, no step presented. */
const NO_MARKS = { groupId: null, groupMarks: null } as const;

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
 * What the picture is told to light and let recede: the group under
 * inspection, or else the step presented.
 * @param view What the stage knows.
 * @returns Which group is inspected, and the marks to draw.
 */
function pictureMarks(view: PresentationView): {
	readonly groupId: string | null;
	readonly groupMarks: GroupMarks | null;
} {
	const { groupFocus, narrative, focus } = view;
	if (groupFocus !== null) {
		return { groupId: groupFocus.group, groupMarks: groupFocus.emphasis };
	}
	if (narrative.open === null || focus.drawn.length === 0) {
		return NO_MARKS;
	}
	const members = new Set(focus.drawn);
	return { groupId: null, groupMarks: { members, boundary: new Set(), context: new Set() } };
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
