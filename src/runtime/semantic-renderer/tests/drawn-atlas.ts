// A drawing's arrangement, apart from where its page puts it.
//
// A mark on a subject's corner may reach past the subject, and where that
// subject stands on the page's top or left margin the page grows to keep the
// margin and moves the whole drawing in by the same amount. Two readers of one
// board still see one arrangement: every subject in the same place against
// every other, and the same room right of and below the drawing. This is the
// form those tests compare.

import type { DiagramAtlas, DiagramBox } from "@archboard/board/render-reply";

/** A drawing's subjects against one another, and the page's room right of and below them. */
interface Arrangement {
	/** The atlas, moved so its topmost and leftmost subjects stand at the origin. */
	readonly atlas: DiagramAtlas;
	/** The page's width, less how far in its leftmost subject stands. */
	readonly width: number;
	/** The page's height, less how far down its topmost subject stands. */
	readonly height: number;
}

/**
 * Every box of a record moved by one offset.
 * @param boxes The boxes, by id.
 * @param by How far to move them back.
 * @param by.x Across.
 * @param by.y Down.
 * @returns The moved boxes.
 */
function movedBack(
	boxes: Readonly<Record<string, DiagramBox>>,
	by: { x: number; y: number },
): Record<string, DiagramBox> {
	return Object.fromEntries(
		Object.entries(boxes).map(([id, box]) => [id, { ...box, x: box.x - by.x, y: box.y - by.y }]),
	);
}

/**
 * A drawing's arrangement, apart from where its page puts it.
 * @param drawing The drawing's page size and atlas.
 * @param drawing.width Its page's width.
 * @param drawing.height Its page's height.
 * @param drawing.atlas Where it drew each subject.
 * @returns Its arrangement.
 */
function arrangementOf(drawing: {
	readonly width: number;
	readonly height: number;
	readonly atlas: DiagramAtlas;
}): Arrangement {
	const { atlas } = drawing;
	const subjects = [...Object.values(atlas.nodes), ...Object.values(atlas.regions)];
	const origin = {
		x: Math.min(...subjects.map(({ x }) => x)),
		y: Math.min(...subjects.map(({ y }) => y)),
	};
	return {
		atlas: {
			nodes: movedBack(atlas.nodes, origin),
			edges: movedBack(atlas.edges, origin),
			regions: movedBack(atlas.regions, origin),
		},
		width: drawing.width - origin.x,
		height: drawing.height - origin.y,
	};
}

export { arrangementOf, type Arrangement };
