// The page as a recording of one walkthrough (TASK-304), when its address asks
// for one: the recorder is made once, from the address the page was opened on,
// before the panes are, because every pane's media owner hears the voice
// through it.

import { useMemo, useState, type ReactNode } from "react";

import type { Narration } from "#ui/hooks/application/use-narration.ts";
import type { PaneOverlay, PaneRecording } from "#ui/hooks/application/use-pane-views.ts";
import type { PaneList } from "#ui/rules/application/pane-list.ts";
import type { BrowserWorkbenchMediaOwnerOptions } from "@archboard/agent-workbench/browser";
import type { Workbench } from "#ui/hooks/application/use-workbench.ts";
import type { WorkspaceAddress } from "#ui/rules/board-routing/address.ts";
import { boardAddressOf } from "#ui/rules/semantic-board-canvas/board/address.ts";
import { openWalkthroughRecorder } from "#ui/clients/walkthrough-recording/open-recorder.ts";
import { useWalkthroughRecording } from "#ui/hooks/walkthrough-recording/use-walkthrough-recording.ts";
import { type WalkthroughRecorder } from "#ui/state/walkthrough-recording/recorder.ts";

/**
 * The page's recorder, made once from the address it was opened on.
 *
 * Read from the location rather than the router: the parameter is the page's mode, not part of
 * the workspace, so the router drops it from the address it writes, and this reads it before the
 * first write.
 * @param opening The workspace the page was opened on.
 * @returns The recorder, or null when the page is not a recording.
 */
function usePageRecorder(opening: WorkspaceAddress): WalkthroughRecorder | null {
	return useState(() => {
		const key = opening.panes[0]?.boardKey ?? null;
		return openWalkthroughRecorder(window.location.search, boardAddressOf(key)?.board ?? null);
	})[0];
}

/**
 * How each pane's media owner is made: hearing the voice for a recording, and as usual otherwise.
 * @param recorder The page's recorder, or null.
 * @returns The options, or undefined for the usual ones.
 */
function recordedMedia(
	recorder: WalkthroughRecorder | null,
): BrowserWorkbenchMediaOwnerOptions | undefined {
	return recorder === null ? undefined : { audioElements: recorder.audioElements };
}

/** What the panes are given that depends on whether the page is a recording. */
interface RecordedViews {
	readonly narration: Narration | null;
	readonly overlay: PaneOverlay | null;
	readonly recording: PaneRecording | null;
}

/**
 * What a recording gives its pane, kept in step with the server's agent and voice. A recording is
 * not narrated by hand; its subtitles are the page's own.
 * @param recorder The page's recorder, or null.
 * @param workbench The workbench.
 * @param usual The narration and the subtitles the page gives its panes.
 * @returns What the panes are given.
 */
function useRecordedViews(
	recorder: WalkthroughRecorder | null,
	workbench: Workbench,
	usual: Omit<RecordedViews, "recording">,
): RecordedViews {
	const step = useWalkthroughRecording(recorder, {
		setup: workbench.setup,
		voice: workbench.voice,
	});
	const { narration, overlay } = usual;
	return useMemo(
		() =>
			recorder === null
				? { narration, overlay, recording: null }
				: { narration: null, overlay, recording: { step, onReading: recorder.reading } },
		[recorder, step, narration, overlay],
	);
}

/**
 * The pane a recording page shows.
 * @param recording The page's recording, or null.
 * @param list The panes.
 * @param mounted The mounted panes by pane id.
 * @returns The first pane, or null when the page is not a recording.
 */
function recordedPaneOf(
	recording: PaneRecording | null,
	list: PaneList,
	mounted: Readonly<Record<string, ReactNode>>,
): ReactNode | null {
	const first = list.panes[0];
	return recording === null || first === undefined ? null : (mounted[first.paneId] ?? null);
}

export { recordedMedia, recordedPaneOf, usePageRecorder, useRecordedViews };
