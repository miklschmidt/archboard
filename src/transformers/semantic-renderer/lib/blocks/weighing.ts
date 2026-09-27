// What the block engine weighs a layout on when it chooses between layouts on
// how they read (ADR 0039): a block of cards laid out, or a whole drawing as
// placed, each weighed on its lines as drawn (layout/reading-measures.ts).
import { corners, type Laid } from "@/transformers/semantic-renderer/lib/blocks/laid";
import type { Block, BlockTree } from "@/transformers/semantic-renderer/lib/blocks/tree";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import { readingOf } from "@/transformers/semantic-renderer/lib/layout/reading-measures";
import type { Weighed } from "@/transformers/semantic-renderer/lib/track/score";

/** A drawing as placed: its page, its cards, and every relationship's points. */
interface Page {
	readonly width: number;
	readonly height: number;
	readonly cards: readonly { readonly id: string; readonly box: Box }[];
	readonly edges: readonly { readonly id: string; readonly points: readonly Point[] }[];
}

/** What a block of cards laid out is weighed on, by the layout it was laid from. */
const laidWeighed = new WeakMap<Laid, Weighed>();

/**
 * What a block of cards laid out is weighed on, each line that laps round it
 * counted as a crossing more.
 * @param tree The blocks.
 * @param block The block.
 * @param laid The block laid out.
 * @returns What it is weighed on.
 */
function weighedLaid(tree: BlockTree, block: Block, laid: Laid): Weighed {
	const known = laidWeighed.get(laid);
	if (known !== undefined) return known;
	const lines = [...laid.lines].map(([key, points]) => {
		const line = block.lines.get(key);
		return {
			id: key,
			ends: [line?.from ?? key, line?.to ?? key] as const,
			points: corners(points),
		};
	});
	const cards = new Map([...laid.boxes].filter(([id]) => tree.cards.has(id)));
	const read = readingOf(laid, lines, cards);
	const weighed = { ...read, crossings: read.crossings + (laid.laps ?? 0) };
	laidWeighed.set(laid, weighed);
	return weighed;
}

/**
 * What a whole drawing as placed is weighed on, its lines joined end to end
 * through every block. Relationships drawn on one line of a block run on one
 * trunk by design, so they are no stack.
 * @param tree The blocks.
 * @param placed The drawing.
 * @returns What it is weighed on.
 */
function weighedPlaced(tree: BlockTree, placed: Page): Weighed {
	const ends = new Map(
		tree.projections.map(({ edge }) => [edge.id, [edge.sources[0]!, edge.targets[0]!] as const]),
	);
	const lines = placed.edges.map(({ id, points }) => ({
		id,
		ends: ends.get(id) ?? ([id, id] as const),
		points: corners(points),
		trunks: (tree.routes.get(id)?.pieces ?? []).map(([block, key]) => `${block.id}|${key}`),
	}));
	return readingOf(placed, lines, new Map(placed.cards.map(({ id, box }) => [id, box])));
}

export { weighedLaid, weighedPlaced, type Page };
