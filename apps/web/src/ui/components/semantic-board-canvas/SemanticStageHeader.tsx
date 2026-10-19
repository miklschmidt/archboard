// The header a semantic pane puts over its reading, assembled from what the
// stage knows: where the board on screen sits, what the board says of itself,
// and the ways to read it.

import { useMemo, type JSX } from "react";

import type { SemanticRender } from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
import { CodeWarnings } from "#ui/components/semantic-board-canvas/CodeWarnings.tsx";
import {
	PaneHeader,
	type BoardPlace,
	type BoardTab,
	type PaneHeaderProps,
} from "#ui/components/semantic-board-canvas/PaneHeader.tsx";
import type { DrillNavigation } from "#ui/hooks/semantic-board-canvas/use-drill-down.ts";
import { useDrillPlaces } from "#ui/hooks/semantic-board-canvas/use-drill-places.ts";
import type { Sidebar } from "#ui/hooks/semantic-board-canvas/use-sidebar.ts";
import type { VariantReading } from "#ui/rules/semantic-board-canvas/board/board-document.ts";

/** What the stage hands its header. */
interface StageHeaderView {
	/** Pick a warned subject out and show it on the diagram, opening the whole board when a view hides it. */
	readonly onShow: (id: string) => void;
	/** What the board says about itself, or null while it has not arrived. */
	readonly reading: VariantReading | null;
	/** The query's answer for the board on screen. */
	readonly render: { readonly data: SemanticRender | undefined };
	/** Which board the pane is looking at, and how it got there. */
	readonly drill: Pick<DrillNavigation, "board" | "trail">;
	/**
	 * Go back to one of the boards the reader came down through.
	 * @param depth Where it is in the trail: 0 is its first board.
	 */
	readonly onBackTo: (depth: number) => void;
	/**
	 * The boards above one, outermost first, as the navigator places them.
	 * @param board The board on screen.
	 * @returns The boards above it.
	 */
	readonly placeOf?: ((board: string) => readonly BoardPlace[]) | undefined;
	/** The tab that is open. */
	readonly tab: BoardTab;
	/** Open a tab. */
	readonly onTab: (tab: BoardTab) => void;
	/** The sidebar, which a control in the header shows and hides. */
	readonly sidebar: Sidebar;
}

/**
 * What the header says of the board from its own document: its level, the
 * variant on screen when the board's name opens another, and whether anything
 * it describes is built.
 * @param reading What the board says about itself, or null before it arrives.
 * @returns The header's facts.
 */
function headerFacts(
	reading: VariantReading | null,
): Pick<PaneHeaderProps, "level" | "variant" | "unbuilt"> {
	if (reading === null) {
		return { level: undefined, variant: null, unbuilt: false };
	}
	const { showing } = reading;
	return {
		level: reading.level,
		variant: showing !== null && showing.id !== reading.opens ? showing : null,
		unbuilt: !reading.variants.some((variant) => variant.lifecycle === "current"),
	};
}

/**
 * The pane's header: where the board on screen sits, and the tabs.
 * @param props What the stage knows.
 * @param props.view What the stage knows.
 * @returns The header.
 */
function StageHeader(props: { readonly view: StageHeaderView }): JSX.Element {
	const { view } = props;
	const facts = useMemo(() => headerFacts(view.reading), [view.reading]);
	const crumbs = useDrillPlaces(view.placeOf, view.drill, view.onBackTo);
	return (
		<PaneHeader
			{...facts}
			name={view.render.data?.board ?? view.drill.board}
			{...crumbs}
			tab={view.tab}
			onTab={view.onTab}
			sidebar={view.sidebar}
		>
			<CodeWarnings drawing={view.render.data} onDiagram={view.onTab} onShow={view.onShow} />
		</PaneHeader>
	);
}

export { StageHeader };
