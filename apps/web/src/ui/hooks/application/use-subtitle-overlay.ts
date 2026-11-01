// The subtitles of the voice, and the voice itself in the voice box while the person wants
// subtitles, laid over the pane they are for.

import { createElement, useMemo } from "react";

import { PaneSubtitles } from "#ui/components/application/PaneSubtitles.tsx";
import type { PaneOverlay } from "#ui/hooks/application/use-pane-views.ts";
import type { Workbench } from "#ui/hooks/application/use-workbench.ts";
import { heardOver } from "#ui/rules/application/subtitled-transcript.ts";

/** What the subtitles over a pane are drawn from. */
interface SubtitleOverlaySources {
	readonly workbench: Workbench;
	/** The pane that receives voice while its transport starts. */
	readonly activePaneId: string;
	readonly reducedMotion: boolean;
	/** Whether the page is a recording. */
	readonly recording: boolean;
	/** The pane presented fullscreen, or null in the workspace. */
	readonly presentedPaneId: string | null;
}

/**
 * The subtitles of the voice, laid over the pane it runs for, with the voice itself in the voice
 * box while the person wants subtitles. A pane presented fullscreen is the only pane on screen and
 * has no dock, so what is laid over the pane the voice runs for is laid over it instead, and the
 * voice box carries the voice there whatever the person wants.
 * @param sources The workbench, the motion preference and where the voice may sit.
 * @returns The overlay and the pane it belongs over, or null.
 */
function useSubtitleOverlay(sources: SubtitleOverlaySources): PaneOverlay | null {
	const { workbench, activePaneId, reducedMotion, recording, presentedPaneId } = sources;
	const { voice } = workbench;
	return useMemo(() => {
		return {
			paneId: presentedPaneId ?? voice?.paneId ?? activePaneId,
			element: createElement(PaneSubtitles, {
				feed: heardOver(voice?.transport ?? null),
				reducedMotion,
				recording,
				dockless: presentedPaneId !== null,
			}),
		};
	}, [voice, activePaneId, reducedMotion, recording, presentedPaneId]);
}

export { useSubtitleOverlay, type SubtitleOverlaySources };
