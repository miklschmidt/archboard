// The strip above the diagram: the states of this architecture, the ways this
// variant can be read, the explanations it gives of itself, and the group under
// inspection.
//
// One strip rather than several, because every part of it is the same question
// — how is this board being read — and a second rule across the pane for a
// second half of it would be a line drawn where there is no difference. Each
// part decides for itself whether it has anything to offer. The strip itself is
// always there at the one height, even while nothing in it has arrived: a strip
// that came and went with the answers would move the picture under it up and
// back down while the next board is being drawn.

import type { JSX, ReactNode } from "react";

import type { SemanticRender } from "@/ui/semantic-board-canvas/api/semantic-boards";
import { SemanticGroupBar } from "@/ui/semantic-board-canvas/components/SemanticGroupBar";
import { SemanticVariantBar } from "@/ui/semantic-board-canvas/components/SemanticVariantBar";
import { SemanticViewBar } from "@/ui/semantic-board-canvas/components/SemanticViewBar";
import { SemanticWalkthroughBar } from "@/ui/semantic-board-canvas/components/SemanticWalkthroughBar";
import type { WalkthroughReading } from "@/ui/semantic-board-canvas/hooks/use-walkthrough";
import type { VariantReading } from "@/ui/semantic-board-canvas/lib/board-document";
import type { GroupChoice, GroupFocus } from "@/ui/semantic-board-canvas/lib/groups";

/** Inputs for the reading bar. */
interface SemanticReadingBarProps {
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
	 * The person chose a state of this level's architecture, when there is one.
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
	/** Every group the variant on screen uses. */
	groups: readonly GroupChoice[];
	/** The group under inspection, or null for none. */
	groupFocus: GroupFocus | null;
	/**
	 * The person chose a group to inspect, or let go of it.
	 * @param group The group's id, or null to stop.
	 */
	onChooseGroup: (group: string | null) => void;
}

/**
 * Offer the board's shared views at the level currently being read.
 * @param props What the strip is assembled from.
 * @returns The bar, or null when there is no choice to offer here.
 */
function viewBar(props: SemanticReadingBarProps): ReactNode {
	const { answer, onChooseView } = props;
	if (answer === undefined || onChooseView === undefined) {
		return null;
	}
	return <SemanticViewBar views={answer.views} showing={answer.view} onChoose={onChooseView} />;
}

/**
 * The bar that offers the board's other states.
 *
 * A board's variants are the board's, not a view's: the pane's own board again,
 * and absent while somebody is a level down, where the family belongs to a
 * different board and choosing from it would quietly change what the way back
 * leads to.
 * @param props What the strip is assembled from.
 * @returns The bar, or null when there is no choice to offer here.
 */
function variantBar(props: SemanticReadingBarProps): ReactNode {
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
 * The bar that offers this variant’s explanations of itself.
 *
 * One place decides whether a variant that explains itself nowhere is offered
 * anything, and this is it: the strip asks this, rather than the count, so that
 * there is one answer rather than two that can drift apart.
 * @param props What the strip is assembled from.
 * @returns The bar, or null when the variant states no walkthrough.
 */
function walkthroughBar(props: SemanticReadingBarProps): ReactNode {
	const { narrative } = props;
	if (narrative.offered.length === 0) {
		return null;
	}
	return (
		<SemanticWalkthroughBar
			walkthroughs={narrative.offered}
			open={narrative.open?.id ?? null}
			onChoose={props.onChooseWalkthrough}
		/>
	);
}

/**
 * The control that inspects a group, offered whenever there is a picture to
 * inspect it on. A variant with no memberships is told so by the control
 * itself, which is the empty state a reader can find.
 * @param props What the strip is assembled from.
 * @returns The bar, or null before anything has been drawn.
 */
function groupBar(props: SemanticReadingBarProps): ReactNode {
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
 * The hairline between two groups of the strip, when both are there.
 * @param between Whether there are two groups to separate.
 * @returns The rule, or null when there is nothing to divide.
 */
function divider(between: boolean): ReactNode {
	return between ? <span aria-hidden="true" className="bg-border mx-1 h-5 w-px" /> : null;
}

/**
 * The strip above the diagram.
 *
 * The explanations are offered in every state, including while the server is
 * drawing. A beat may be told through a view, so moving to one asks for a
 * different picture; if the rail went away while that picture was being drawn,
 * the reader's place would go with it.
 * @param props What the strip is assembled from.
 * @returns The strip, empty while nothing in it has arrived.
 */
function SemanticReadingBar(props: SemanticReadingBarProps): JSX.Element {
	const views = viewBar(props);
	const variants = variantBar(props);
	const readings = [variants, views, walkthroughBar(props)];
	const groups = groupBar(props);
	const offered = [...readings, groups].filter((part) => part !== null);
	// The height of a row holding the two-line state buttons, so a row holding
	// less is as tall as one holding them.
	return (
		<div
			data-slot="semantic-reading-bar"
			className="border-border bg-sidebar flex min-h-[49px] shrink-0 items-center gap-1 border-b px-3 py-1.5"
		>
			{variants}
			{divider(variants !== null && views !== null)}
			{views}
			{readings[2]}
			{divider(groups !== null && offered.length > 1)}
			{groups}
		</div>
	);
}

export { SemanticReadingBar, type SemanticReadingBarProps };
