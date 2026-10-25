// What a drawing command's receipt says its picture draws and marks
// (TASK-496, TASK-497). `semantic render`, `semantic rasterize` and
// `semantic views` read it here from the render answer, so an agent can choose
// a view and know what a picture marks without reading its pixels. The answer
// already keeps its standing to what the renderer placed, and the counts are
// the key's own `markCounts` over it, so the receipt, the key and the panel
// cannot disagree.

import type {
	DrawnBoard,
	MarkedSubjects,
	RenderedChanges,
} from "@archboard/board/render-reply";
import { markCounts } from "@archboard/renderer/picture";
import { drawnAgainst } from "#cli/operations/semantic/input/semantic-input.ts";
import type { PictureMarksSchema } from "@archboard/board/render-reply";
import type { z } from "zod";

type PictureMarks = z.infer<typeof PictureMarksSchema>;

/** What a receipt says about its picture. */
interface PictureReceipt {
	readonly drawn: MarkedSubjects;
	readonly marks: PictureMarks | null;
}

/**
 * How many subjects stand each marked way, as the key counts them.
 * @param standing How each drawn subject stands.
 * @returns The counts, zero for a mark nothing carries.
 */
function marksOf(standing: RenderedChanges["standing"]): PictureMarks {
	const counted = new Map(markCounts(standing).map((one) => [one.standing, one.count]));
	return {
		added: counted.get("added") ?? 0,
		changed: counted.get("changed") ?? 0,
		removed: counted.get("removed") ?? 0,
	};
}

/**
 * What a picture draws and marks, from its render answer.
 * @param drawn What the render answered: its changes, and the subjects it drew.
 * @param drawn.changes How the drawn subjects stand, or null when nothing is read against.
 * @param drawn.drawn The subjects the picture draws.
 * @param noComparison Whether the caller hid the comparison.
 * @returns Each drawn subject, with how it stands when the picture marks a
 * comparison, and the key's counts, or null when it marks none.
 */
function pictureReceipt(
	drawn: Pick<DrawnBoard, "changes" | "drawn">,
	noComparison: boolean,
): PictureReceipt {
	const standing = drawnAgainst(drawn, noComparison) === null ? undefined : drawn.changes?.standing;
	/**
	 * The subjects of one kind, as the receipt names them.
	 * @param subjects The drawn subjects of that kind.
	 * @returns Each, with how it stands when the picture marks a comparison.
	 */
	const marked = (subjects: DrawnBoard["drawn"]["nodes"]) =>
		standing === undefined
			? subjects
			: subjects.map((subject) => ({ ...subject, standing: standing[subject.id] ?? "unchanged" }));
	return {
		drawn: {
			nodes: marked(drawn.drawn.nodes),
			edges: marked(drawn.drawn.edges),
			flows: marked(drawn.drawn.flows),
			steps: marked(drawn.drawn.steps),
		},
		marks: standing === undefined ? null : marksOf(standing),
	};
}

export { pictureReceipt, type PictureReceipt };
