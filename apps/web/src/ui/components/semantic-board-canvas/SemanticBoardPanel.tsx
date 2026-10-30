// The sidebar's board tab: what the board on screen is, how to read it, and
// the key to what is drawn.
//
// The order is the order a reader asks in (TASK-383,
// docs/design/pane-sidebar-hierarchy.md), one region per question:
//
// 1. What is this, and what does it change? The variant's own summary of its
//    scope, and for a variant read against another what it changed about each
//    container's interface (TASK-538.01), then the key to its marks with how
//    much each one covers.
// 2. How do I read it? The author's walkthroughs first, the way into a first
//    read; then the views, the reader's own; then the groups, the concerns the
//    reader can pick out.
// 3. Where might it take more work than it should? The design questions of
//    the variant on screen (TASK-537), each a question and never a verdict.
// 4. What do the marks mean? The legend of what the picture draws.
// 5. The layout engine, a preference of this browser, at the foot.
//
// Each part decides for itself whether it has anything to offer, and a region
// with nothing in it is not drawn.
//
// No board's variants are offered here. The navigator lists the variants of
// every board, the About page of the pane's header lists them with the record
// of each and opens one in this pane, and the header's breadcrumb names the one
// on screen: a fourth place to make one choice is one too many (TASK-388).

import type { JSX, ReactNode } from "react";

import { passThroughEntryPoints } from "@archboard/board/container-interface";
import type { SemanticRender } from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
import { DesignQuestions } from "#ui/components/semantic-board-canvas/DesignQuestions.tsx";
import { InterfaceChanges } from "#ui/components/semantic-board-canvas/InterfaceChanges.tsx";
import { SemanticChanges } from "#ui/components/semantic-board-canvas/SemanticChanges.tsx";
import { SemanticEngineBar } from "#ui/components/semantic-board-canvas/SemanticEngineBar.tsx";
import { SemanticGroupList } from "#ui/components/semantic-board-canvas/SemanticGroupList.tsx";
import { SemanticLegend } from "#ui/components/semantic-board-canvas/SemanticLegend.tsx";
import {
	SidebarRegion,
	SidebarSection,
} from "#ui/components/semantic-board-canvas/SemanticSidebarParts.tsx";
import { SemanticViewBar } from "#ui/components/semantic-board-canvas/SemanticViewBar.tsx";
import { SemanticWalkthroughBar } from "#ui/components/semantic-board-canvas/SemanticWalkthroughBar.tsx";
import type { WalkthroughReading } from "#ui/hooks/semantic-board-canvas/use-walkthrough.ts";
import { keyOf, type AppliedAppearance } from "@archboard/renderer/picture";
import type { VariantReading } from "#ui/rules/semantic-board-canvas/board/board-document.ts";
import type {
	ChosenQuestion,
	QuestionStep,
} from "#ui/rules/semantic-board-canvas/board/design-questions.ts";
import type { GroupChoice } from "#ui/rules/semantic-board-canvas/board/groups.ts";
import { interfaceChangesOf } from "#ui/rules/semantic-board-canvas/board/interface-changes.ts";
import type { KindLook } from "#ui/rules/semantic-board-canvas/board/kind-look.ts";
import type { WalkthroughNarration } from "#ui/rules/semantic-board-canvas/walkthrough/narration.ts";

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
	/** How the vault's kinds look, for the parts a question names. */
	look: KindLook;
	/**
	 * Pick a part out and show it on the picture.
	 * @param id The part.
	 */
	onShow: (id: string) => void;
	/** The design question chosen, the subjects its answer names and the one the person is at, or null. */
	question: ChosenQuestion | null;
	/**
	 * Step to a subject of a design question's answer, which the picture lights and the camera brings in, or let the question go.
	 * @param step The question and the subject, or null to let go.
	 */
	onChooseQuestion: (step: QuestionStep | null) => void;
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
	const { changes: found } = answer;
	if (found === null) {
		return null;
	}
	const changed =
		props.reading === null ? null : interfaceChangesOf(props.reading, found.against.id);
	return (
		<SemanticChanges
			changes={found}
			comparison={props.comparison}
			onComparisonChange={props.onComparisonChange}
		>
			{changed !== null && (
				<InterfaceChanges changed={changed} look={props.look} onShow={props.onShow} />
			)}
		</SemanticChanges>
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
 * The design questions of the variant on screen.
 * @param props What the tab is assembled from.
 * @returns The section, or null before the variant has arrived or when it asks nothing.
 */
function questions(props: SemanticBoardPanelProps): ReactNode {
	const { answer } = props;
	const variant = props.reading?.variant;
	if (answer === undefined || variant === null || variant === undefined) {
		return null;
	}
	const passing = passThroughEntryPoints(variant.content);
	if (passing.length === 0) {
		return null;
	}
	return (
		<DesignQuestions
			board={answer.board}
			variant={variant.id}
			passing={passing}
			look={props.look}
			question={props.question}
			onChooseQuestion={props.onChooseQuestion}
		/>
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
			<SidebarRegion slot="semantic-board-panel-questions">{questions(props)}</SidebarRegion>
			<SidebarRegion slot="semantic-board-panel-key">{legend(props)}</SidebarRegion>
			<SidebarRegion slot="semantic-board-panel-engine">
				<SemanticEngineBar />
			</SidebarRegion>
		</div>
	);
}

export { SemanticBoardPanel, type SemanticBoardPanelProps };
