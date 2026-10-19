// Keeping each flow's head of participant cards in view as the camera moves.
//
// The head follows the camera the surface is drawn with, read back off its
// transform whenever that changes: a glide writes it every frame without a
// render, and a pan or a zoom writes it with one. So the head stands at the top
// of the room through a whole glide, not only where it lands.
//
// What moves is the head's group, by a transform of its own, and a class that
// shows the frame's ground the picture draws behind it (`is-stuck`). A moved
// head is drawn over the rest of the picture, as a selected card is, because
// the messages it stands over are drawn after it. All of it is taken off again
// as soon as the head is back where the picture drew it.

import { useLayoutEffect } from "react";

import type { SemanticAtlas } from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
import type { StagedPicture } from "#ui/hooks/semantic-board-canvas/use-picture-transition.ts";
import { cameraOf } from "#ui/rules/semantic-board-canvas/camera/camera.ts";
import { flowRows, headDrop } from "#ui/rules/semantic-board-canvas/camera/flow-head.ts";
import { raise } from "#ui/clients/semantic-board-canvas/subjects/subjects.ts";

/** The attribute on the group holding one flow's head of cards, naming the flow. */
const HEAD_ATTRIBUTE = "data-flow-head";

/** The class a head carries while it has moved down to stay in view. */
const STUCK_CLASS = "is-stuck";

/**
 * Put one head where it stays in view, or back where the picture drew it.
 * @param head The head's group.
 * @param drop How far down it goes, in the drawing's own units.
 */
function placeHead(head: SVGElement, drop: number): void {
	head.style.transform = drop > 0 ? `translate(0px, ${drop}px)` : "";
	head.classList.toggle(STUCK_CLASS, drop > 0);
	raise(head, drop > 0);
}

/**
 * Keep every flow's head in view on the picture on screen.
 * @param picture The picture on the surface, or null while there is none.
 * @param atlas Where the picture drew each subject.
 */
function useStickyHeads(picture: StagedPicture | null, atlas: SemanticAtlas): void {
	useLayoutEffect(() => {
		if (picture === null) {
			return undefined;
		}
		const heads = [...picture.root.querySelectorAll<SVGElement>(`[${HEAD_ATTRIBUTE}]`)].flatMap(
			(group) => {
				const rows = flowRows(atlas, group.getAttribute(HEAD_ATTRIBUTE) ?? "");
				return rows === null ? [] : [{ group, rows }];
			},
		);
		if (heads.length === 0) {
			return undefined;
		}
		/** Place every head for the camera the surface is drawn with now. */
		const place = (): void => {
			const camera = cameraOf(picture.surface.style.transform);
			if (camera !== null) {
				for (const { group, rows } of heads) {
					placeHead(group, headDrop(rows, camera));
				}
			}
		};
		place();
		const watching = new MutationObserver(place);
		watching.observe(picture.surface, { attributes: true, attributeFilter: ["style"] });
		return () => {
			watching.disconnect();
		};
	}, [picture, atlas]);
}

export { useStickyHeads };
