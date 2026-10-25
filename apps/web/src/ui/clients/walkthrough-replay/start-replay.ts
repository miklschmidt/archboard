// Making a page the renderer of a recorded talk.

import { publishReplayPage } from "@archboard/walkthrough/talk";

import { WalkthroughReplay } from "#ui/clients/walkthrough-replay/replay-page.ts";

/**
 * Make this page the renderer of a talk: publish what the recorder drives, and wait to be given one.
 * @param root The element the talk is mounted in.
 */
function startWalkthroughReplay(root: HTMLElement): void {
	publishReplayPage(new WalkthroughReplay(root).page);
}

export { startWalkthroughReplay };
