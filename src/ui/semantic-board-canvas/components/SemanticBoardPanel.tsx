// The sidebar's board tab: how the board on screen is being read, and the key
// to what is drawn.
//
// Every part of it answers the same question — how is this board being read —
// so they sit together: the ways of reading it, the explanations it gives of
// itself, the group under inspection and, a level down, which state of that
// board is shown. Each part decides for itself whether it has anything to offer.
//
// The pane's own board offers no choice of state here. The navigator lists every
// state of every board and says which one a pane shows, and two places to make
// one choice at the same time is one too many. A board somebody followed a
// drill-down into is not the pane's own and the navigator does not hold it, so
// its states are offered here instead.

import type { JSX, ReactNode } from "react";

import type { SemanticRender } from "@/ui/semantic-board-canvas/api/semantic-boards";
import { SemanticGroupBar } from "@/ui/semantic-board-canvas/components/SemanticGroupBar";
import { SemanticLegend } from "@/ui/semantic-board-canvas/components/SemanticLegend";
import { SemanticVariantBar } from "@/ui/semantic-board-canvas/components/SemanticVariantBar";
import { SemanticViewBar } from "@/ui/semantic-board-canvas/components/SemanticViewBar";
import { SemanticWalkthroughBar } from "@/ui/semantic-board-canvas/components/SemanticWalkthroughBar";
import type { WalkthroughReading } from "@/ui/semantic-board-canvas/hooks/use-walkthrough";
import type { AppliedAppearance } from "@/ui/semantic-board-canvas/lib/appearance";
import type { VariantReading } from "@/ui/semantic-board-canvas/lib/board-document";
import type { GroupChoice, GroupFocus } from "@/ui/semantic-board-canvas/lib/groups";

/** Inputs for the board tab. */
interface SemanticBoardPanelProps {
	/** The render the server gave, or undefined before one has. */
	answer: SemanticRender | undefined;
	/** What the board says about itself, or null while it has not arrived. */
	reading: VariantReading | null;
	/**
	 * The person chose a way of reading this level, when there is one to choose.
	 * @param view The view's id, or null for the whole variant.
	 */
	onChooseView: ((view: string | null) => void) | undefined;
	/**
	 * The person chose a state of a board a level down; undefined on the pane's
	 * own board, whose states the navigator offers.
	 * @param variant The variant's id, or null for whichever is current.
	 */
	onChooseVariant: ((variant: string | null) => void) | undefined;
	/** What this variant explains about itself, and what is being read. */
	narrative: WalkthroughReading;
	/**
	 * Read one of the explanations, or stop reading.
	 * @param walkthrough The walkthrough's id, or null to close the rail.
	 */
	onChooseWalkthrough: (walkthrough: string | null) => void;
	/** Have an explanation narrated aloud, when the shell can start voice for this pane. */
	onNarrate?: ((walkthrough: string) => void) | undefined;
	/** Every group the variant on screen uses. */
	groups: readonly GroupChoice[];
	/** The group under inspection, or null for none. */
	groupFocus: GroupFocus | null;
	/**
	 * The person chose a group to inspect, or let go of it.
	 * @param group The group's id, or null to stop.
	 */
	onChooseGroup: (group: string | null) => void;
	/** What the picture on screen draws each kind with, for the key. */
	appearances: ReadonlyMap<string, AppliedAppearance>;
	/** Whether this pane draws comparison treatment. */
	comparison: boolean;
	/** Change the canvas comparison treatment. */
	onComparisonChange: (enabled: boolean) => void;
}

/**
 * One part of the tab, under its name.
 * @param props Its name and content.
 * @param props.title What the part offers.
 * @param props.slot Where tests and styles find it.
 * @param props.children The part.
 * @returns The part, or nothing when it has nothing to offer.
 */
function Part(props: {
	readonly title: string;
	readonly slot: string;
	readonly children: ReactNode;
}): JSX.Element | null {
	if (props.children === null) {
		return null;
	}
	return (
		<section
			data-slot={props.slot}
			className="border-border flex flex-col gap-1.5 border-b px-4 py-3"
		>
			<h2 className="text-kicker text-muted-foreground uppercase">{props.title}</h2>
			{props.children}
		</section>
	);
}

/**
 * The board's shared views at the level currently being read.
 * @param props What the tab is assembled from.
 * @returns The list, or null when there is no choice to offer here.
 */
function viewList(props: SemanticBoardPanelProps): ReactNode {
	const { answer, onChooseView } = props;
	if (answer === undefined || onChooseView === undefined || answer.views.length === 0) {
		return null;
	}
	return <SemanticViewBar views={answer.views} showing={answer.view} onChoose={onChooseView} />;
}

/**
 * The states of a board a level down.
 * @param props What the tab is assembled from.
 * @returns The list, or null on the pane's own board.
 */
function variantList(props: SemanticBoardPanelProps): ReactNode {
	const { reading, onChooseVariant } = props;
	if (onChooseVariant === undefined || reading === null) {
		return null;
	}
	return (
		<SemanticVariantBar
			variants={reading.variants}
			showing={reading.showing?.id ?? null}
			onChoose={onChooseVariant}
		/>
	);
}

/**
 * The explanations this variant gives of itself.
 * @param props What the tab is assembled from.
 * @returns The list, or null when the variant states no walkthrough.
 */
function walkthroughList(props: SemanticBoardPanelProps): ReactNode {
	const { narrative } = props;
	if (narrative.offered.length === 0) {
		return null;
	}
	return (
		<SemanticWalkthroughBar
			walkthroughs={narrative.offered}
			open={narrative.open?.id ?? null}
			onChoose={props.onChooseWalkthrough}
			onNarrate={props.onNarrate}
		/>
	);
}

/**
 * The control that inspects a group, offered whenever there is a picture to
 * inspect it on. A variant with no memberships is told so by the control
 * itself, which is the empty state a reader can find.
 * @param props What the tab is assembled from.
 * @returns The control, or null before anything has been drawn.
 */
function groupControl(props: SemanticBoardPanelProps): ReactNode {
	if (props.answer === undefined || props.reading === null) {
		return null;
	}
	return (
		<SemanticGroupBar
			choices={props.groups}
			focus={props.groupFocus}
			onChoose={props.onChooseGroup}
		/>
	);
}

/**
 * The board tab.
 *
 * The explanations are offered in every state, including while the server is
 * drawing. A beat may be told through a view, so moving to one asks for a
 * different picture; if the list went away while that picture was being drawn,
 * the reader's place would go with it.
 * @param props What the tab is assembled from.
 * @returns The tab's content.
 */
function SemanticBoardPanel(props: SemanticBoardPanelProps): JSX.Element {
	return (
		<div data-slot="semantic-board-panel" className="flex flex-col">
			<Part title="State" slot="semantic-board-panel-state">
				{variantList(props)}
			</Part>
			<Part title="View" slot="semantic-board-panel-view">
				{viewList(props)}
			</Part>
			<Part title="Walkthroughs" slot="semantic-board-panel-walkthroughs">
				{walkthroughList(props)}
			</Part>
			<Part title="Groups" slot="semantic-board-panel-groups">
				{groupControl(props)}
			</Part>
			<SemanticLegend
				appearances={props.appearances}
				comparison={props.comparison}
				comparisonAvailable={props.answer !== undefined && props.answer.changes !== null}
				onComparisonChange={props.onComparisonChange}
			/>
		</div>
	);
}

export { SemanticBoardPanel, type SemanticBoardPanelProps };
