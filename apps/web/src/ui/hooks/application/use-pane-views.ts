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
} from "#ui/components/application/ApplicationPane.tsx";
import type { Narration } from "#ui/hooks/application/use-narration.ts";
import type { PaneReadings } from "#ui/hooks/application/use-pane-reading.ts";
import type { Panes } from "#ui/hooks/application/use-panes.ts";
import type { PaneTheme } from "#ui/rules/pane-session/session-contracts.ts";
import type { PaneReading } from "#ui/state/pane-session/pane-reading.ts";
import { servedVault } from "@archboard/server-requests";
import type { WalkthroughRecorder } from "#ui/state/walkthrough-recording/recorder.ts";

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
	/**
	 * Show a board in one pane: where a part its search found is, or where a drill-down leads.
	 * @param key The board key.
	 * @param paneId The pane.
	 * @param repository The repository the board is in; the pane's own when none is named.
	 * @returns Whether the pane shows it now.
	 */
	readonly openBoard: (key: string, paneId: string, repository?: string) => Promise<boolean>;
}

/** What a recording page gives its pane. */
interface PaneRecording extends ReturnType<WalkthroughRecorder["view"]> {
	/**
	 * The recorder hears what the pane is reading.
	 * @param reading The reading.
	 */
	readonly onReading: (reading: PaneReading) => void;
}

/**
 * One pane's mounted element.
 * @param sources Everything the panes are made from.
 * @param paneId The pane.
 * @param index Its place in reading order.
 * @returns The element.
 */
function paneElement(sources: PaneViewSources, paneId: string, index: number): ReactNode {
	const { panes } = sources;
	return createElement(ApplicationPane, {
		key: paneId,
		paneId,
		...recordedOrNot(sources.recording, index === 0, paneId === panes.list.activePaneId),
		theme: sources.theme,
		callbacks: panes.callbacks,
		handles: panes.handles,
		narration: sources.narration?.forPane(paneId),
		overlay: sources.overlay?.paneId === paneId ? sources.overlay.element : undefined,
		reducedMotion: sources.reducedMotion,
		openingVault: servedVault(),
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
): Pick<
	ApplicationPaneProps,
	"primary" | "focused" | "recording" | "step" | "onRecordedReading" | "recordedArchitecture"
> {
	if (recording === null) {
		return {
			primary: first,
			focused: active,
			recording: false,
			step: null,
			onRecordedReading: undefined,
			recordedArchitecture: undefined,
		};
	}
	return {
		primary: false,
		focused: false,
		recording: true,
		step: recording.step,
		onRecordedReading: recording.onReading,
		recordedArchitecture: recording.architecture,
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
		openBoard,
	]);
}

export { usePaneViews, type PaneOverlay, type PaneRecording, type PaneViewSources };
