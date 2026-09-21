// The sidebar a semantic pane puts beside its picture, assembled from what the
// stage knows: the reading of the board for the board tab, and the selection
// for the other.
//
// It is beside every state of the pane, not only a drawn one. An empty view is
// left by choosing another view, and the board tab is where the views are.

import { useCallback, type JSX } from "react";

import type { CodeBinding } from "@/shared/code-target";
import type { SemanticRender } from "@/ui/semantic-board-canvas/api/semantic-boards";
import {
	SemanticBoardPanel,
	type SemanticBoardPanelProps,
} from "@/ui/semantic-board-canvas/components/SemanticBoardPanel";
import { SemanticInspector } from "@/ui/semantic-board-canvas/components/SemanticInspector";
import type { GroupControls } from "@/ui/semantic-board-canvas/components/SemanticInspectorParts";
import {
	NothingSelected,
	SemanticSidebar,
	SidebarPanel,
} from "@/ui/semantic-board-canvas/components/SemanticSidebar";
import type { Sidebar } from "@/ui/semantic-board-canvas/hooks/use-sidebar";
import type { AppliedAppearance } from "@/ui/semantic-board-canvas/lib/appearance";

/** What the stage hands the sidebar. */
interface StageSidebarView extends Omit<
	SemanticBoardPanelProps,
	"answer" | "onChooseView" | "onChooseVariant"
> {
	/** The sidebar's tab and collapse state. */
	readonly sidebar: Sidebar;
	/** The query's answer for the board on screen. */
	readonly render: { readonly data: SemanticRender | undefined };
	/** The selected subject, or null. */
	readonly selection: string | null;
	/** How deep the pane has followed drill-downs; its own board is depth zero. */
	readonly drill: { readonly trail: readonly unknown[] };
	/** Whether views and states can be chosen at this level. */
	readonly level: {
		readonly onView: ((view: string | null) => void) | undefined;
		readonly onVariant: ((variant: string | null) => void) | undefined;
	};
	/**
	 * Choose a view of this level, leaving any guided reading.
	 * @param view The view's id, or null for the whole variant.
	 */
	readonly onChooseView: (view: string | null) => void;
	/**
	 * Pick a subject out, or clear the selection.
	 * @param id The semantic id, or null.
	 */
	readonly onPick: (id: string | null) => void;
	/** Follow a drill-down, clearing the selection it was made from. */
	readonly onOpenDown: (board: string, variant: string) => void;
	/** Open the code a node is bound to, when the shell can. */
	readonly onOpenCode?: ((binding: CodeBinding) => void) | undefined;
	/** How the inspector names memberships and inspects one. */
	readonly groupControls: GroupControls;
}

/**
 * The inspector, once there is a selection on a picture to explain it against.
 * @param props What the stage knows, and what the picture draws each kind with.
 * @param props.view What the stage knows.
 * @param props.appearances What the picture draws each kind with.
 * @returns The inspector, or what the tab says while nothing is selected.
 */
function SelectionPanel(props: {
	readonly view: StageSidebarView;
	readonly appearances: ReadonlyMap<string, AppliedAppearance>;
}): JSX.Element {
	const { view, appearances } = props;
	const { selection, onOpenCode } = view;
	const answer = view.render.data;
	if (selection === null || answer === undefined) {
		return <NothingSelected />;
	}
	return (
		<SemanticInspector
			board={answer.board}
			variant={answer.variant.id}
			selection={selection}
			appearance={appearances.get(selection)}
			onOpen={view.onOpenDown}
			{...(onOpenCode === undefined ? {} : { onOpenCode })}
			groups={view.groupControls}
		/>
	);
}

/**
 * The sidebar beside a semantic pane's picture.
 * @param props What the stage knows.
 * @param props.view What the stage knows.
 * @param props.appearances What the picture on screen draws each kind with.
 * @returns The sidebar.
 */
function SemanticStageSidebar(props: {
	readonly view: StageSidebarView;
	readonly appearances: ReadonlyMap<string, AppliedAppearance>;
}): JSX.Element {
	const { view, appearances } = props;
	const { level, onPick, selection } = view;
	const clear = useCallback((): void => {
		onPick(null);
	}, [onPick]);
	return (
		<SemanticSidebar sidebar={view.sidebar} onClearSelection={selection === null ? null : clear}>
			<SidebarPanel tab="board">
				<SemanticBoardPanel
					answer={view.render.data}
					reading={view.reading}
					onChooseView={level.onView === undefined ? undefined : view.onChooseView}
					// The pane's own board takes its state from the navigator.
					onChooseVariant={view.drill.trail.length === 0 ? undefined : level.onVariant}
					narrative={view.narrative}
					onChooseWalkthrough={view.onChooseWalkthrough}
					onNarrate={view.onNarrate}
					groups={view.groups}
					groupFocus={view.groupFocus}
					onChooseGroup={view.onChooseGroup}
					appearances={appearances}
					comparison={view.comparison}
					onComparisonChange={view.onComparisonChange}
				/>
			</SidebarPanel>
			<SidebarPanel tab="selection">
				<SelectionPanel view={view} appearances={appearances} />
			</SidebarPanel>
		</SemanticSidebar>
	);
}

export { SemanticStageSidebar, type StageSidebarView };
