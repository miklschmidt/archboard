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
import type { PaneReadings, PickedSubject } from "#ui/hooks/application/use-pane-reading.ts";
import type { Panes } from "#ui/hooks/application/use-panes.ts";
import type { PaneLinks } from "#ui/rules/application/pane-link.ts";
import type { PaneEntry } from "#ui/rules/application/pane-list.ts";
import type { PaneTheme } from "#ui/rules/pane-session/session-contracts.ts";
import type { SemanticPaneReading } from "#ui/rules/semantic-board-canvas/board/address.ts";
import { servedVault } from "@archboard/server-requests";
import type { RecordedStep } from "#ui/state/walkthrough-recording/recorder.ts";

/** Something the shell lays over one pane's picture. */
interface PaneOverlay {
	readonly paneId: string;
	readonly element: ReactNode;
}

/**
 * Ask the agent of one pane's checkout a question, sent at once.
 * @param paneId The pane.
 * @param text The question.
 */
type PaneAskFrom = (paneId: string, text: string) => void;

/** What the mounted panes are assembled from. */
interface PaneViewSources {
	/** What a pane is made from: never the records, which change with every pane's news. */
	readonly panes: Pick<Panes, "list" | "callbacks" | "handles">;
	readonly theme: PaneTheme;
	/** What each pane is reading, and how that changes. */
	readonly readings: PaneReadings;
	/** Which panes are linked (TASK-538.02). */
	readonly links: PaneLinks;
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
	/** Ask the agent about what a pane shows, or null where the page has no agent to ask. */
	readonly ask: PaneAskFrom | null;
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
	/**
	 * Show a board in the pane beside one pane, read through that pane's view.
	 * @param key The board key, in the repository of the pane.
	 * @param paneId The pane it is beside.
	 */
	readonly openBeside: (key: string, paneId: string) => void;
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
 * Where a pane opens: in the vault and on the board it was added for, else in the
 * vault the server serves, on the board the server gives it.
 * @param entry The pane.
 * @returns Its opening vault, and its opening board if it has one.
 */
function openingOf(entry: PaneEntry): {
	readonly openingVault: string;
	readonly openingBoard?: string;
} {
	const { opensOn } = entry;
	return opensOn === undefined
		? { openingVault: servedVault() }
		: { openingVault: opensOn.vault, openingBoard: opensOn.board };
}

/**
 * One pane's mounted element.
 * @param sources Everything the panes are made from.
 * @param entry The pane, and the board it was added for if any.
 * @param index Its place in reading order.
 * @returns The element.
 */
function paneElement(sources: PaneViewSources, entry: PaneEntry, index: number): ReactNode {
	const { panes, readings } = sources;
	const { paneId } = entry;
	/**
	 * The person chose a different way of reading this pane's board.
	 * @param view The view's id, or null for the overview.
	 */
	function readThrough(view: string | null): void {
		readings.chooseView(paneId, view);
	}
	/**
	 * The person picked a subject out in this pane, or cleared it.
	 * @param subject The subject, or null.
	 */
	function pickHere(subject: PickedSubject | null): void {
		readings.pick(paneId, subject);
	}
	/** This pane left the board its pick was made on. */
	function leaveHere(): void {
		readings.leave(paneId);
	}
	/**
	 * The person asked for a different state of this pane's architecture.
	 * @param variant The variant's id or name, or null for whichever is current.
	 */
	function showVariantHere(variant: string | null): void {
		sources.onVariantChange(paneId, variant);
	}
	/**
	 * Show a board in this pane: where a part its search found is, or where a drill-down leads.
	 * @param key The board key.
	 * @param repository The repository the board is in; the pane's own when none is named.
	 * @returns Whether the pane shows it now.
	 */
	function openBoardHere(key: string, repository?: string): Promise<boolean> {
		return sources.openBoard(key, paneId, repository);
	}
	/**
	 * Show a board in the pane beside this one.
	 * @param key The board key.
	 */
	function openBesideHere(key: string): void {
		sources.openBeside(key, paneId);
	}
	const { ask } = sources;
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
		onLeave: leaveHere,
		beside: sources.links[paneId] ?? null,
		onVariantChange: showVariantHere,
		narration: sources.narration?.forPane(paneId),
		overlay: sources.overlay?.paneId === paneId ? sources.overlay.element : undefined,
		reducedMotion: sources.reducedMotion,
		...openingOf(entry),
		onOpenBoard: openBoardHere,
		onOpenBeside: openBesideHere,
		ask: ask === null ? null : (text: string): void => ask(paneId, text),
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
		links,
		reducedMotion,
		onVariantChange,
		narration,
		overlay,
		ask,
		recording,
		openBoard,
		openBeside,
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
					links,
					reducedMotion,
					onVariantChange,
					narration,
					overlay,
					ask,
					recording,
					openBoard,
					openBeside,
				},
				entry,
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
		links,
		reducedMotion,
		onVariantChange,
		narration,
		overlay,
		ask,
		recording,
		openBoard,
		openBeside,
	]);
}

export {
	usePaneViews,
	type PaneAskFrom,
	type PaneOverlay,
	type PaneRecording,
	type PaneViewSources,
};
