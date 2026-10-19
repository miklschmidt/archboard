// A recording's picture, rendered frame by frame against the talk it recorded
// (TASK-381): the page the recorder drives to draw each frame. The contract with
// the recorder is in `@archboard/walkthrough/talk`.

import { REPLAY_PAGE_GLOBAL } from "@archboard/walkthrough/talk";

import { WalkthroughReplay } from "@/ui/walkthrough-replay/lib/replay-page";

export { TalkPlayback, frameOf, type TalkMoment } from "@/ui/walkthrough-replay/lib/talk-playback";

/**
 * Make this page the renderer of a talk: publish what the recorder drives, and wait to be given one.
 * @param root The element the talk is mounted in.
 */
function startWalkthroughReplay(root: HTMLElement): void {
	Reflect.set(window, REPLAY_PAGE_GLOBAL, new WalkthroughReplay(root).page);
}

export { startWalkthroughReplay };
