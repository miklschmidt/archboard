// The sidebar's board tab: what the board on screen is, how to read it, and
// the key to what is drawn.
//
// The order is the order a reader asks in (TASK-383,
// docs/design/pane-sidebar-hierarchy.md), one region per question:
//
// 1. What is this, and what does it change? The variant's own summary of its
//    scope, and for a variant read against another the key to its marks with how
//    much each one covers.
// 2. How do I read it? The author's walkthroughs first, the way into a first
//    read; then the views, the reader's own; then the groups, the concerns the
//    reader can pick out.
// 3. What do the marks mean? The legend of what the picture draws.
// 4. The layout engine, a preference of this browser, at the foot.
//
// Each part decides for itself whether it has anything to offer, and a region
// with nothing in it is not drawn.
//
// No board's variants are offered here. The navigator lists the variants of
// every board, the About page of the pane's header lists them with the record
// of each and opens one in this pane, and the header's breadcrumb names the one
// on screen: a fourth place to make one choice is one too many (TASK-388).

import type { JSX, ReactNode } from "react";

import type { SemanticRender } from "@/ui/semantic-board-canvas/api/semantic-boards";
import { SemanticChanges } from "@/ui/semantic-board-canvas/components/SemanticChanges";
import { SemanticEngineBar } from "@/ui/semantic-board-canvas/components/SemanticEngineBar";
import { SemanticGroupList } from "@/ui/semantic-board-canvas/components/SemanticGroupList";
import { SemanticLegend } from "@/ui/semantic-board-canvas/components/SemanticLegend";
import {
	SidebarRegion,
	SidebarSection,
} from "@/ui/semantic-board-canvas/components/SemanticSidebarParts";
import { SemanticViewBar } from "@/ui/semantic-board-canvas/components/SemanticViewBar";
import { SemanticWalkthroughBar } from "@/ui/semantic-board-canvas/components/SemanticWalkthroughBar";
import type { WalkthroughReading } from "@/ui/semantic-board-canvas/hooks/use-walkthrough";
import { keyOf, type AppliedAppearance } from "@/transformers/semantic-renderer/picture-key";
import type { VariantReading } from "@/ui/semantic-board-canvas/lib/board-document";
import type { GroupChoice } from "@/ui/semantic-board-canvas/lib/groups";
import type { WalkthroughNarration } from "@/ui/semantic-board-canvas/lib/narration";

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
	/** What this variant explains about itself, and what is being read. */
	narrative: WalkthroughReading;
	/**
	 * Read one of the explanations, or stop reading.
	 * @param walkthrough The walkthrough's id, or null to close the rail.
	 */
	onChooseWalkthrough: (walkthrough: string | null) => void;
	/** Narrating the explanations aloud, when the shell can start voice for this pane. */
	narration?: WalkthroughNarration | undefined;
	/** Every group the variant on screen uses. */
	groups: readonly GroupChoice[];
	/** The selected group's id, or null for none. */
	selectedGroup: string | null;
	/**
	 * The person selected a group's members, or let them go.
	 * @param group The group's id, or null to let go.
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
 * What the variant on screen says it is about: the board's scope, in its
 * author's words.
 * @param props What the tab is assembled from.
 * @returns The summary, or null when the variant states none.
 */
function summary(props: SemanticBoardPanelProps): ReactNode {
	const text = props.reading?.variant?.summary;
	if (text === undefined) {
		return null;
	}
	return (
		<p data-slot="semantic-board-summary" className="text-control font-normal whitespace-pre-line">
			{text}
		</p>
	);
}

/**
 * What the variant on screen changes against the one it is read against.
 * @param props What the tab is assembled from.
 * @returns The section, or null when the variant is read against nothing.
 */
function changes(props: SemanticBoardPanelProps): ReactNode {
	const { answer } = props;
	if (answer === undefined) {
		return null;
	}
	const { changes: found, view } = answer;
	if (found === null) {
		return null;
	}
	return (
		<SemanticChanges
			changes={found}
			inView={view !== null}
			comparison={props.comparison}
			onComparisonChange={props.onComparisonChange}
		/>
	);
}

/**
 * The explanations this variant gives of itself.
 *
 * Offered in every state, including while the server is drawing. A beat may be
 * told through a view, so moving to one asks for a different picture; if the
 * list went away while that picture was being drawn, the reader's place would
 * go with it.
 * @param props What the tab is assembled from.
 * @returns The section, or null when the variant states no walkthrough.
 */
function walkthroughSection(props: SemanticBoardPanelProps): ReactNode {
	const { narrative } = props;
	if (narrative.offered.length === 0) {
		return null;
	}
	return (
		<SidebarSection title="Walkthroughs" slot="semantic-board-panel-walkthroughs">
			<SemanticWalkthroughBar
				walkthroughs={narrative.offered}
				open={narrative.open?.id ?? null}
				onChoose={props.onChooseWalkthrough}
				narration={props.narration}
			/>
		</SidebarSection>
	);
}

/**
 * The board's shared views at the level currently being read.
 * @param props What the tab is assembled from.
 * @returns The section, or null when there is no choice to offer here.
 */
function viewSection(props: SemanticBoardPanelProps): ReactNode {
	const { answer, onChooseView } = props;
	if (answer === undefined || onChooseView === undefined) {
		return null;
	}
	const described = props.reading?.views.find((view) => view.id === answer.view?.id);
	return (
		<SidebarSection title="Views" slot="semantic-board-panel-views">
			<SemanticViewBar
				views={answer.views}
				showing={answer.view}
				summary={described?.summary}
				onChoose={onChooseView}
			/>
		</SidebarSection>
	);
}

/**
 * The groups the variant uses, offered whenever there is a picture to select
 * their members on.
 * @param props What the tab is assembled from.
 * @returns The section, or null before anything has been drawn or when the variant uses none.
 */
function groupSection(props: SemanticBoardPanelProps): ReactNode {
	if (props.answer === undefined || props.reading === null || props.groups.length === 0) {
		return null;
	}
	return (
		<SidebarSection title="Groups" slot="semantic-board-panel-groups">
			<SemanticGroupList
				choices={props.groups}
				selected={props.selectedGroup}
				onChoose={props.onChooseGroup}
			/>
		</SidebarSection>
	);
}

/**
 * The key to the picture on screen.
 * @param props What the tab is assembled from.
 * @returns The legend, or null while nothing typed is drawn.
 */
function legend(props: SemanticBoardPanelProps): ReactNode {
	const picture = keyOf(props.appearances);
	return picture === null ? null : <SemanticLegend picture={picture} />;
}

/**
 * The board tab.
 * @param props What the tab is assembled from.
 * @returns The tab's content.
 */
function SemanticBoardPanel(props: SemanticBoardPanelProps): JSX.Element {
	return (
		<div data-slot="semantic-board-panel" className="flex flex-col">
			<SidebarRegion slot="semantic-board-panel-about">
				{summary(props)}
				{changes(props)}
			</SidebarRegion>
			<SidebarRegion slot="semantic-board-panel-reading">
				{walkthroughSection(props)}
				{viewSection(props)}
				{groupSection(props)}
			</SidebarRegion>
			<SidebarRegion slot="semantic-board-panel-key">{legend(props)}</SidebarRegion>
			<SidebarRegion slot="semantic-board-panel-engine">
				<SemanticEngineBar />
			</SidebarRegion>
		</div>
	);
}

export { SemanticBoardPanel, type SemanticBoardPanelProps };
