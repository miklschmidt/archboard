// Decode the private placement metadata before the routing scene fits headers.
import { z } from "zod";
import type { ElkNode } from "@archboard/elk-rs";
import type { Item } from "#shared/rules/track/scene/scene.ts";

/** The region's extra bottom inset and the lone frame's horizontal inset. */
const TRACK_BELOW = "archboard.track.below";
/** Measured title sizes as JSON `[words, height]` rows, narrowest first. */
const TRACK_STEPS = "archboard.track.steps";

/** A title row's words' reach and height at one measured width. */
interface TitleStep {
	readonly words: number;
	readonly height: number;
}

const TitleStepsSchema = z.array(z.tuple([z.number(), z.number()]));

/**
 * Read a combined caption/title row and the actual frame's insets.
 * The top inset stays relative to the row as its header fits and its band moves.
 * @param node The frame carrying its insets and measured header sizes.
 * @param title The row's box, words' reach and caption inset.
 * @returns The row, its words' reach and its measured sizes.
 */
function titleRow(
	node: ElkNode,
	title: string,
): { item: Item; words: number; steps: readonly TitleStep[] } {
	const [x, y, width, height, words, topInset] = title.split(",").map(Number);
	const inset = Number(node.layoutOptions?.[TRACK_BELOW] ?? 0);
	const item: Item = {
		box: { x: x!, y: y!, width: width!, height: height! },
		band: -1,
		topInset,
	};
	if (inset > 0) item.inset = inset;
	const rows = node.layoutOptions?.[TRACK_STEPS];
	const steps =
		rows === undefined
			? []
			: TitleStepsSchema.parse(JSON.parse(rows)).map(([reach, tall]) => ({
					words: reach,
					height: tall,
				}));
	return { item, words: words!, steps };
}

export { TRACK_BELOW, TRACK_STEPS, titleRow, type TitleStep };
