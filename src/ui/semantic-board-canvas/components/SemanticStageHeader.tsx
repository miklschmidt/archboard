// The header a semantic pane puts over its reading, assembled from what the
// stage knows: where the board on screen sits, what the board says of itself,
// and the ways to read it.

import { useMemo, type JSX } from "react";

import type { SemanticRender } from "@/ui/semantic-board-canvas/api/semantic-boards";
import {
	PaneHeader,
	type BoardPlace,
	type BoardTab,
	type PaneHeaderProps,
} from "@/ui/semantic-board-canvas/components/PaneHeader";
import type { DrillNavigation } from "@/ui/semantic-board-canvas/hooks/use-drill-down";
import type { Sidebar } from "@/ui/semantic-board-canvas/hooks/use-sidebar";
import type { VariantReading } from "@/ui/semantic-board-canvas/lib/board-document";

/** What the stage hands its header. */
interface StageHeaderView {
	/** What the board says about itself, or null while it has not arrived. */
	readonly reading: VariantReading | null;
	/** The query's answer for the board on screen. */
	readonly render: { readonly data: SemanticRender | undefined };
	/** Which board the pane is looking at, and how it got there. */
	readonly drill: Pick<DrillNavigation, "board" | "trail">;
	/** Go back a level. */
	readonly onBack: () => void;
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
 * variant on screen when the board's name opens another, whether anything it
 * describes is built, and how many variants and walkthroughs the tabs count.
 * @param reading What the board says about itself, or null before it arrives.
 * @returns The header's facts.
 */
function headerFacts(
	reading: VariantReading | null,
): Pick<PaneHeaderProps, "level" | "variant" | "unbuilt" | "counts"> {
	if (reading === null) {
		return { level: undefined, variant: null, unbuilt: false, counts: {} };
	}
	const { showing } = reading;
	return {
		level: reading.level,
		variant: showing !== null && showing.id !== reading.opens ? showing : null,
		unbuilt: !reading.variants.some((variant) => variant.lifecycle === "current"),
		counts: { variants: reading.variants.length, walkthroughs: reading.walkthroughs.length },
	};
}

/**
 * A board above the one on screen that the reader drilled down from in this
 * pane is reached by going back along the drill, not by opening it again: the
 * pane is still on the board it was opened on, and only the drill moved.
 * @param place The board above, as the navigator places it.
 * @param trail How the pane got here, from the board it was opened on.
 * @param onBack Go back one level.
 * @returns The place, with its way to it.
 */
function backAlong(
	place: BoardPlace,
	trail: readonly { readonly board: string }[],
	onBack: () => void,
): BoardPlace {
	const at = trail.findIndex((stop) => stop.board.toLowerCase() === place.name.toLowerCase());
	if (at < 0) return place;
	const steps = trail.length - at;
	return {
		...place,
		/** Go back along the drill to this board. */
		open: (): void => {
			for (let step = 0; step < steps; step += 1) onBack();
		},
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
	const { placeOf } = view;
	const facts = useMemo(() => headerFacts(view.reading), [view.reading]);
	const { drill, onBack } = view;
	const ancestors = useMemo(
		() => (placeOf?.(drill.board) ?? []).map((place) => backAlong(place, drill.trail, onBack)),
		[placeOf, drill.board, drill.trail, onBack],
	);
	return (
		<PaneHeader
			{...facts}
			name={view.render.data?.board ?? view.drill.board}
			ancestors={ancestors}
			tab={view.tab}
			onTab={view.onTab}
			sidebar={view.sidebar}
		/>
	);
}

export { StageHeader };
