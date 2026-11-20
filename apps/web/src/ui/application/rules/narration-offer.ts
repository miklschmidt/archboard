// What each pane is offered of narration: one object per pane, made once and given again, so a
// pane is not drawn again for being offered what it was offered already.

import type { WalkthroughNarration } from "#ui/architecture-drawing/canvas/picture/rules/narration.ts";

/**
 * What each pane is offered.
 * @param start Narrate one walkthrough of one pane's model.
 * @param held Why a narration cannot start now, or null when one can.
 * @param starting Whether voice is still connecting.
 * @returns What a pane is offered.
 */
function offerNarration(
	start: (paneId: string, walkthrough: string) => void,
	held: string | null,
	starting: boolean,
): (paneId: string) => WalkthroughNarration {
	const offered = new Map<string, WalkthroughNarration>();
	return (paneId) => {
		const known = offered.get(paneId);
		if (known !== undefined) {
			return known;
		}
		const made: WalkthroughNarration = {
			held,
			starting,
			/**
			 * Narrate one of this pane's walkthroughs.
			 * @param walkthrough The walkthrough's id.
			 */
			start: (walkthrough) => {
				start(paneId, walkthrough);
			},
		};
		offered.set(paneId, made);
		return made;
	};
}

export { offerNarration };
