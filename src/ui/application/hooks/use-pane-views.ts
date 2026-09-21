// The mounted panes, one per pane id. Each is the pane's own element and is
// never remounted by a layout change, which is what lets a comparison be
// rearranged without restarting a pane's session.
//
// The elements are made with `createElement` rather than written as markup:
// this is the hooks concern, and markup belongs to a module's components.

import { createElement, useMemo, type ReactNode } from "react";

import { ApplicationPane } from "@/ui/application/components/ApplicationPane";
import type { Narration } from "@/ui/application/hooks/use-narration";
import type { PaneReadings, PickedSubject } from "@/ui/application/hooks/use-pane-reading";
import type { Panes } from "@/ui/application/hooks/use-panes";
import type { PaneTheme } from "@/ui/pane-session";

/** Something the shell lays over one pane's picture. */
interface PaneOverlay {
	readonly paneId: string;
	readonly element: ReactNode;
}

/** What the mounted panes are assembled from. */
interface PaneViewSources {
	readonly panes: Panes;
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
	/** The focused pane's narration, or null while voice cannot be started for it. */
	readonly narration: Narration | null;
	/** What is laid over one pane's picture, or null: the subtitles of the voice running for it. */
	readonly overlay: PaneOverlay | null;
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
	return createElement(ApplicationPane, {
		key: paneId,
		paneId,
		primary: index === 0,
		focused: paneId === panes.list.activePaneId,
		theme: sources.theme,
		host: panes.host,
		handles: panes.handles,
		view: readings.viewOf(paneId),
		onViewChange: readThrough,
		picked: readings.pickedIn(paneId),
		onPick: pickHere,
		onVariantChange: showVariantHere,
		onNarrate: sources.narration?.paneId === paneId ? sources.narration.start : undefined,
		overlay: sources.overlay?.paneId === paneId ? sources.overlay.element : undefined,
		reducedMotion: sources.reducedMotion,
	});
}

/**
 * The mounted panes, one per pane id.
 *
 * The pane list, the host and the handles are what a pane is made from; the
 * records are not, so a status arriving from one pane never rebuilds the other
 * pane's element.
 * @param sources The panes, the theme, the readings and the motion preference.
 * @returns The mounted panes by pane id.
 */
function usePaneViews(sources: PaneViewSources): Readonly<Record<string, ReactNode>> {
	const { panes, theme, readings, reducedMotion, onVariantChange, narration, overlay } = sources;
	const { list, host, handles } = panes;
	return useMemo(() => {
		const mounted: Record<string, ReactNode> = {};
		list.panes.forEach((entry, index) => {
			mounted[entry.paneId] = paneElement(
				{
					panes: { ...panes, list, host, handles },
					theme,
					readings,
					reducedMotion,
					onVariantChange,
					narration,
					overlay,
				},
				entry.paneId,
				index,
			);
		});
		return mounted;
	}, [
		panes,
		list,
		host,
		handles,
		theme,
		readings,
		reducedMotion,
		onVariantChange,
		narration,
		overlay,
	]);
}

export { usePaneViews, type PaneOverlay, type PaneViewSources };
