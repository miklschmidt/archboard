// The subtitles of the voice, and the voice itself in the voice box while the person wants
// subtitles, laid over the pane they are for.

import { createElement, useMemo } from "react";

import { PaneSubtitles } from "@/ui/application/components/PaneSubtitles";
import type { PaneOverlay } from "@/ui/application/hooks/use-pane-views";
import type { Workbench } from "@/ui/application/hooks/use-workbench";
import { heardOver, type VoiceFeed } from "@/ui/application/subtitled-transcript";
import { VOICE_DEMONSTRATING } from "@/ui/workbench/demo";

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
	/** The pane the demonstration of the voice is laid over, where the page demonstrates it. */
	readonly activePaneId: string;
}

/**
 * The subtitles over a pane, and the voice box that carries them.
 * @param sources What they are drawn from.
 * @param feed Where the voice is heard, or null where the page demonstrates it.
 * @returns The element.
 */
function subtitlesFor(
	sources: SubtitleOverlaySources,
	feed: VoiceFeed | null,
): PaneOverlay["element"] {
	return createElement(PaneSubtitles, {
		feed,
		reducedMotion: sources.reducedMotion,
		recording: sources.recording,
		boxAvailable: sources.boxAvailable,
		dockless: sources.presentedPaneId !== null,
	});
}

/**
 * The subtitles of the voice, laid over the pane it runs for, with the voice itself in the voice
 * box while the person wants subtitles. A pane presented fullscreen is the only pane on screen and
 * has no dock, so what is laid over the pane the voice runs for is laid over it instead, and the
 * voice box carries the voice there whatever the person wants. A page opened with `?voiceDemo`
 * demonstrates the voice over the active pane, in place of the voice there is not.
 * @param sources The workbench, the motion preference and where the voice may sit.
 * @returns The overlay and the pane it belongs over, or null.
 */
function useSubtitleOverlay(sources: SubtitleOverlaySources): PaneOverlay | null {
	const { workbench, reducedMotion, recording, boxAvailable, presentedPaneId, activePaneId } =
		sources;
	const { voice } = workbench;
	return useMemo(() => {
		const here = {
			workbench,
			reducedMotion,
			recording,
			boxAvailable,
			presentedPaneId,
			activePaneId,
		};
		if (VOICE_DEMONSTRATING) {
			return { paneId: presentedPaneId ?? activePaneId, element: subtitlesFor(here, null) };
		}
		return voice === null
			? null
			: {
					paneId: presentedPaneId ?? voice.paneId,
					element: subtitlesFor(here, heardOver(voice.transport)),
				};
	}, [workbench, voice, reducedMotion, recording, boxAvailable, presentedPaneId, activePaneId]);
}

export { useSubtitleOverlay, type SubtitleOverlaySources };
