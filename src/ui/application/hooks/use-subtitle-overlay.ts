// The subtitles of the voice, and the voice itself in the voice box while the person wants
// subtitles, laid over the pane they are for.

import { createElement, useMemo } from "react";

import { PaneSubtitles } from "@/ui/application/components/PaneSubtitles";
import type { PaneOverlay } from "@/ui/application/hooks/use-pane-views";
import type { Workbench } from "@/ui/application/hooks/use-workbench";
import { heardOver } from "@/ui/application/subtitled-transcript";

/** What the subtitles over a pane are drawn from. */
interface SubtitleOverlaySources {
	readonly workbench: Workbench;
	readonly reducedMotion: boolean;
	/** Whether the page is a recording. */
	readonly recording: boolean;
	/** Whether the voice box may carry the voice: the pane has a voice owner and the page is not a recording. */
	readonly boxAvailable: boolean;
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
	const { workbench, reducedMotion, recording, boxAvailable, presentedPaneId } = sources;
	const { voice } = workbench;
	return useMemo(() => {
		if (voice === null) return null;
		return {
			paneId: presentedPaneId ?? voice.paneId,
			element: createElement(PaneSubtitles, {
				feed: heardOver(voice.transport),
				reducedMotion,
				recording,
				boxAvailable,
				dockless: presentedPaneId !== null,
			}),
		};
	}, [voice, reducedMotion, recording, boxAvailable, presentedPaneId]);
}

export { useSubtitleOverlay, type SubtitleOverlaySources };
