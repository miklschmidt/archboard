// Making a page the renderer of a recorded talk.

import { rendererBuild } from "virtual:archboard-renderer";
import { browserPictureStorage } from "#ui/clients/semantic-board-canvas/reads/picture-cache.ts";
import { createLocalPictureSource } from "#ui/clients/semantic-board-canvas/reads/local-pictures.ts";
import { takePicturesFrom } from "#ui/clients/semantic-board-canvas/reads/picture-source.ts";
import { publishReplayPage } from "@archboard/walkthrough/talk";

import { WalkthroughReplay } from "#ui/clients/walkthrough-replay/replay-page.ts";

/**
 * Make this page the renderer of a talk: publish what the recorder drives, and wait to be given one.
 * @param root The element the talk is mounted in.
 * @param renderer The browser renderer that draws retained content.
 */
function startWalkthroughReplay(
	root: HTMLElement,
	renderer: Promise<Pick<typeof import("@archboard/renderer/browser"), "drawBoardHere">>,
): void {
	takePicturesFrom(
		createLocalPictureSource({
			/**
			 * Draw the captured original with the existing renderer.
			 * @param board The original document.
			 * @param choices Its selected variant and view.
			 * @param policy The captured presentation policy.
			 * @returns The retained drawing.
			 */
			draw: async (board, choices, policy) =>
				(await renderer).drawBoardHere(board, choices, policy),
			renderer: rendererBuild,
			storage: browserPictureStorage(),
		}),
	);
	publishReplayPage(new WalkthroughReplay(root).page);
}

export { startWalkthroughReplay };
