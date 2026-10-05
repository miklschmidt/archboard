// The mounted panes, one per pane id. Each is the pane's own element and is
// never remounted by a layout change, which is what lets a comparison be
// rearranged without restarting a pane's session.
//
// The elements are made with `createElement` rather than written as markup:
// this is the hooks concern, and markup belongs to a module's components.

import { createElement, useMemo, type ReactNode } from "react";

import {
	ApplicationPane,
	type ApplicationPaneProps,
} from "@/ui/application/components/ApplicationPane";
import type { Narration } from "@/ui/application/hooks/use-narration";
import type { PaneReadings, PickedSubject } from "@/ui/application/hooks/use-pane-reading";
import type { Panes } from "@/ui/application/hooks/use-panes";
import type { OutlineNode } from "@/ui/board-catalog";
import type { PaneTheme } from "@/ui/pane-session";
import type { SemanticPaneReading } from "@/ui/semantic-board-canvas";
import type { CatalogBoard } from "@/ui/types";
import type { RecordedStep } from "@/ui/walkthrough-recording";

/** Something the shell lays over one pane's picture. */
interface PaneOverlay {
	readonly paneId: string;
	readonly element: ReactNode;
}

/** What the mounted panes are assembled from. */
interface PaneViewSources {
	/** What a pane is made from: never the records, which change with every pane's news. */
	readonly panes: Pick<Panes, "list" | "callbacks" | "handles">;
	readonly theme: PaneTheme;
	/** What each pane is reading, and how that changes. */
	readonly readings: PaneReadings;
	readonly reducedMotion: boolean;
	/**
	 * The person asked for another variant of one pane's board.
	 *
	 * A move between variants is a move between boards as far as the server is
	 * concerned — the pane's board key carries the variant — so it goes through
	 * the shell rather than being held here.
	 * @param paneId The pane.
	 * @param variant The variant's id or name, or null for whichever is current.
	 */
	readonly onVariantChange: (paneId: string, variant: string | null) => void;
	/** Narration, offered to every pane, or null where the page does not narrate by hand. */
	readonly narration: Narration | null;
	/** What is laid over one pane's picture, or null: the subtitles of the voice running for it. */
	readonly overlay: PaneOverlay | null;
	/** The page records its one pane (TASK-304), or null. */
	readonly recording: PaneRecording | null;
	/** The vault's boards, which a pane's search for a part reads. */
	readonly boards: readonly CatalogBoard[];
	/** The vault's boards as the navigator places them, for the boards above a pane's own. */
	readonly outline: readonly OutlineNode<CatalogBoard>[];
	/**
	 * Show a board in one pane: where a part its search found is.
	 * @param key The board key.
	 * @param paneId The pane.
	 */
	readonly openBoard: (key: string, paneId: string) => void;
}

/** What a recording page gives its pane. */
interface PaneRecording {
	/** The step the page moves the pane to, or null before the first. */
	readonly step: RecordedStep | null;
	/**
	 * The recorder hears what the pane is reading.
	 * @param reading The reading.
	 */
	readonly onReading: (reading: SemanticPaneReading) => void;
}

/**
 * One pane's mounted element.
 * @param sources Everything the panes are made from.
 * @param paneId The pane.
 * @param index Its place in reading order.
 * @returns The element.
 */
function paneElement(sources: PaneViewSources, paneId: string, index: number): ReactNode {
	const { panes, readings } = sources;
	/**
	 * The person chose a different way of reading this pane's board.
	 * @param view The view's id, or null for the whole variant.
	 */
	function readThrough(view: string | null): void {
		readings.showView(paneId, view);
	}
	/**
	 * The person picked a subject out in this pane, or cleared it.
	 * @param subject The subject, or null.
	 */
	function pickHere(subject: PickedSubject | null): void {
		readings.pick(paneId, subject);
	}
	/**
	 * The person asked for a different state of this pane's architecture.
	 * @param variant The variant's id or name, or null for whichever is current.
	 */
	function showVariantHere(variant: string | null): void {
		sources.onVariantChange(paneId, variant);
	}
	/**
	 * The pane showed a board: where a part its search found is.
	 * @param key The board key.
	 */
	function openBoardHere(key: string): void {
		sources.openBoard(key, paneId);
	}
	return createElement(ApplicationPane, {
		key: paneId,
		paneId,
		...recordedOrNot(sources.recording, index === 0, paneId === panes.list.activePaneId),
		theme: sources.theme,
		callbacks: panes.callbacks,
		handles: panes.handles,
		view: readings.viewOf(paneId),
		onViewChange: readThrough,
		picked: readings.pickedIn(paneId),
		onPick: pickHere,
		onVariantChange: showVariantHere,
		narration: sources.narration?.forPane(paneId),
		overlay: sources.overlay?.paneId === paneId ? sources.overlay.element : undefined,
		reducedMotion: sources.reducedMotion,
		boards: sources.boards,
		outline: sources.outline,
		onOpenBoard: openBoardHere,
	});
}

/**
 * How a pane registers, and what a recording gives it.
 *
 * A recording's pane is nobody's primary or focused pane, and says it is a recording's so the
 * server leaves it out of addressing altogether: the server it records on may be in use in
 * another browser, whose panes those words mean.
 * @param recording The page's recording, or null.
 * @param first Whether the pane is first in reading order.
 * @param active Whether it is the active pane.
 * @returns The pane's registration and its recorded step and reading listener.
 */
function recordedOrNot(
	recording: PaneRecording | null,
	first: boolean,
	active: boolean,
): Pick<ApplicationPaneProps, "primary" | "focused" | "recording" | "step" | "onSemanticReading"> {
	if (recording === null) {
		return {
			primary: first,
			focused: active,
			recording: false,
			step: null,
			onSemanticReading: undefined,
		};
	}
	return {
		primary: false,
		focused: false,
		recording: true,
		step: recording.step,
		onSemanticReading: recording.onReading,
	};
}

/**
 * The mounted panes, one per pane id.
 *
 * The pane list, the callbacks and the handles are what a pane is made from; the
 * records are not, so a status arriving from any pane rebuilds no pane's element.
 * @param sources The panes, the theme, the readings and the motion preference.
 * @returns The mounted panes by pane id.
 */
function usePaneViews(sources: PaneViewSources): Readonly<Record<string, ReactNode>> {
	const {
		panes,
		theme,
		readings,
		reducedMotion,
		onVariantChange,
		narration,
		overlay,
		recording,
		boards,
		outline,
		openBoard,
	} = sources;
	const { list, callbacks, handles } = panes;
	return useMemo(() => {
		const mounted: Record<string, ReactNode> = {};
		list.panes.forEach((entry, index) => {
			mounted[entry.paneId] = paneElement(
				{
					panes: { list, callbacks, handles },
					theme,
					readings,
					reducedMotion,
					onVariantChange,
					narration,
					overlay,
					recording,
					boards,
					outline,
					openBoard,
				},
				entry.paneId,
				index,
			);
		});
		return mounted;
	}, [
		list,
		callbacks,
		handles,
		theme,
		readings,
		reducedMotion,
		onVariantChange,
		narration,
		overlay,
		recording,
		boards,
		outline,
		openBoard,
	]);
}

export { usePaneViews, type PaneOverlay, type PaneRecording, type PaneViewSources };
