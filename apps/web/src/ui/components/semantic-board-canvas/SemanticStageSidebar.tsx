// The sidebar a semantic pane puts beside its picture, assembled from what the
// stage knows: the reading of the board for the board tab, and the selection
// for the other.
//
// It is beside every state of the pane, not only a drawn one. An empty view is
// left by choosing another view, and the board tab is where the views are.

import { useCallback, useMemo, type JSX, type ReactNode } from "react";

import type { CodeBinding } from "@archboard/code-binding/bindings";
import type {
	PictureKey,
	SemanticRender,
} from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
import {
	SemanticBoardPanel,
	type SemanticBoardPanelProps,
} from "#ui/components/semantic-board-canvas/SemanticBoardPanel.tsx";
import { SemanticInspector } from "#ui/components/semantic-board-canvas/SemanticInspector.tsx";
import type { GroupControls } from "#ui/components/semantic-board-canvas/SemanticInspectorParts.tsx";
import {
	NothingSelected,
	SemanticSidebar,
	SidebarPanel,
} from "#ui/components/semantic-board-canvas/SemanticSidebar.tsx";
import type { Sidebar } from "#ui/hooks/semantic-board-canvas/use-sidebar.ts";
import type { GroupSelection } from "#ui/rules/semantic-board-canvas/board/groups.ts";
import type { KindLook } from "#ui/rules/semantic-board-canvas/board/kind-look.ts";
import type { OpenDown } from "#ui/rules/semantic-board-canvas/drilling/drill-target.ts";

/** What the stage hands the sidebar. */
interface StageSidebarView extends Omit<
	SemanticBoardPanelProps,
	"answer" | "onChooseView" | "selectedGroup"
> {
	/** The selected group and its members, or null. */
	readonly group: GroupSelection | null;
	/** The sidebar's tab, and where it is. */
	readonly sidebar: Sidebar;
	/** The query's answer for the board on screen. */
	readonly render: { readonly data: SemanticRender | undefined };
	/** The selected subject, or null. */
	readonly selection: string | null;
	/** Whether views can be chosen at this level. */
	readonly level: {
		readonly onView: ((view: string | null) => void) | undefined;
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
	readonly onOpenDown: OpenDown;
	/** Open the code a node is bound to, when the shell can. */
	readonly onOpenCode?: ((binding: CodeBinding) => void) | undefined;
	/** How the inspector names memberships and selects one. */
	readonly groupControls: GroupControls;
	/** How the vault's kinds look, for the details panel. */
	readonly look: KindLook;
	/** The search over every board's parts, at the sidebar's top. */
	readonly search?: ReactNode;
}

/**
 * The inspector, once there is a selection on a picture to explain it against.
 * @param props What the stage knows.
 * @param props.view What the stage knows.
 * @returns The inspector, or what the tab says while nothing is selected.
 */
function SelectionPanel(props: { readonly view: StageSidebarView }): JSX.Element {
	const { view } = props;
	const { selection, onOpenCode, onPick, sidebar, groupControls } = view;
	const { selectionTabId } = sidebar;
	// A subject picked from a row of this panel is drawn in a new panel, and a group
	// chosen from its title lets the selection go, so the control pressed goes with
	// the old panel either way. Focus is given to the tab first and is not lost.
	const pickFromPanel = useCallback(
		(id: string | null): void => {
			document.getElementById(selectionTabId)?.focus();
			onPick(id);
		},
		[onPick, selectionTabId],
	);
	const groupsFromPanel = useMemo((): GroupControls => {
		const { onChoose } = groupControls;
		if (onChoose === undefined) {
			return groupControls;
		}
		/**
		 * Select a group's members, after giving focus to the selection tab.
		 * @param group The group's id.
		 */
		const choose = (group: string): void => {
			document.getElementById(selectionTabId)?.focus();
			onChoose(group);
		};
		return { names: groupControls.names, onChoose: choose };
	}, [groupControls, selectionTabId]);
	const answer = view.render.data;
	if (selection === null || answer === undefined) {
		return <NothingSelected />;
	}
	return (
		<SemanticInspector
			board={answer.board}
			variant={answer.variant.id}
			selection={selection}
			overview={answer.view === null}
			onOpen={view.onOpenDown}
			onOpenCode={onOpenCode}
			groups={groupsFromPanel}
			look={view.look}
			onPick={pickFromPanel}
		/>
	);
}

/**
 * The sidebar beside a semantic pane's picture.
 * @param props What the stage knows.
 * @param props.view What the stage knows.
 * @param props.pictureKey What the key to the picture on screen lists.
 * @returns The sidebar.
 */
function SemanticStageSidebar(props: {
	readonly view: StageSidebarView;
	readonly pictureKey: PictureKey | null;
}): JSX.Element {
	const { view, pictureKey } = props;
	const { level, onPick, selection } = view;
	const clear = useCallback((): void => {
		onPick(null);
	}, [onPick]);
	return (
		<SemanticSidebar
			sidebar={view.sidebar}
			onClearSelection={selection === null ? null : clear}
			search={view.search}
		>
			<SidebarPanel tab="board">
				<SemanticBoardPanel
					answer={view.render.data}
					reading={view.reading}
					onChooseView={level.onView === undefined ? undefined : view.onChooseView}
					narrative={view.narrative}
					onChooseWalkthrough={view.onChooseWalkthrough}
					narration={view.narration}
					groups={view.groups}
					selectedGroup={view.group === null ? null : view.group.group}
					onChooseGroup={view.onChooseGroup}
					pictureKey={pictureKey}
					comparison={view.comparison}
					onComparisonChange={view.onComparisonChange}
				/>
			</SidebarPanel>
			{/* Keyed by what is selected, so a pick is a new panel: it opens at its top and arrives with a fade. */}
			<SidebarPanel key={selection ?? "none"} tab="selection">
				<SelectionPanel view={view} />
			</SidebarPanel>
		</SemanticSidebar>
	);
}

export { SemanticStageSidebar, type StageSidebarView };
