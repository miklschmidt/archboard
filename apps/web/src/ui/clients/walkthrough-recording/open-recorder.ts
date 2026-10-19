// The recorder a page's address asks for.

import { recordingAskedOf } from "@archboard/walkthrough/recording";

import { WalkthroughRecorder } from "#ui/state/walkthrough-recording/recorder.ts";

/**
 * The recorder a page's address asks for.
 * @param search The address's search string as the page was opened.
 * @param board The board the page was opened on, by name, or null.
 * @returns The recorder, or null when the page is not a recording.
 */
function openWalkthroughRecorder(search: string, board: string | null): WalkthroughRecorder | null {
	const asked = recordingAskedOf(search);
	return asked === null ? null : new WalkthroughRecorder({ board, ...asked });
}

export { openWalkthroughRecorder };
