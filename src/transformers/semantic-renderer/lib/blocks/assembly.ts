// Every block put where its parent placed it, and every relationship's lines
// joined end to end through its ports: the drawing's geometry, as the main
// thread reads it.
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import {
	corners,
	moved,
	shifted,
	type Laid,
} from "@/transformers/semantic-renderer/lib/blocks/laid";
import {
	headerOf,
	type Block,
	type BlockTree,
	type Projection,
} from "@/transformers/semantic-renderer/lib/blocks/tree";

/** How far a region's caption sits in from its band's corner. */
const CAPTION_INSET = 4;

/** A card or container, placed. */
interface PlacedNode {
	readonly id: string;
	readonly box: Box;
	readonly depth: number;
}

/** A group region, placed. */
interface PlacedRegion {
	readonly group: string;
	readonly parent?: string;
	readonly box: Box;
	readonly caption: Box;
	readonly depth: number;
}

/** A relationship's route and label, placed. */
interface PlacedEdge {
	readonly id: string;
	readonly points: Point[];
	readonly label?: Box;
}

/** The whole drawing's geometry. */
interface Placed {
	readonly width: number;
	readonly height: number;
	readonly cards: readonly PlacedNode[];
	readonly frames: readonly PlacedNode[];
	readonly regions: readonly PlacedRegion[];
	readonly edges: readonly PlacedEdge[];
}

/** Every block put where its parent placed it, and every relationship joined. */
class Assembly {
	readonly origins = new Map<string, Point>();
	readonly depths = new Map<string, number>();

	/**
	 * Place every block from the root down.
	 * @param tree The blocks.
	 * @param laid Every block laid out.
	 */
	constructor(
		readonly tree: BlockTree,
		readonly laid: ReadonlyMap<string, Laid>,
	) {
		this.origins.set(tree.root.id, { x: 0, y: 0 });
		this.depths.set(tree.root.id, 0);
		this.descend(tree.root);
	}

	/**
	 * Give the blocks inside one block their origins and containment depths.
	 * @param block The block, already placed.
	 */
	descend(block: Block): void {
		const origin = this.origins.get(block.id)!;
		const depth = this.depths.get(block.id)!;
		for (const item of block.items) {
			const inner = this.tree.blocks.get(item);
			if (inner === undefined) continue;
			this.origins.set(item, moved(this.laid.get(block.id)!.boxes.get(item)!, origin));
			this.depths.set(item, depth + (inner.kind === "frame" ? 1 : 0));
			this.descend(inner);
		}
	}

	/**
	 * A box of one block's, in the drawing.
	 * @param block The block.
	 * @param id The box's id in it.
	 * @returns The box.
	 */
	inside(block: Block, id: string): Box {
		return moved(this.laid.get(block.id)!.boxes.get(id)!, this.origins.get(block.id)!);
	}

	/**
	 * A block's box in the drawing.
	 * @param block The block.
	 * @returns Its box.
	 */
	boxOf(block: Block): Box {
		const { width, height } = this.laid.get(block.id)!;
		return { ...this.origins.get(block.id)!, width, height };
	}

	/**
	 * Every card, in the drawing.
	 * @returns The cards.
	 */
	cards(): PlacedNode[] {
		return [...this.tree.blocks.values()].flatMap((block) =>
			block.items
				.filter((item) => !this.tree.blocks.has(item))
				.map((id) => ({ id, box: this.inside(block, id), depth: this.depths.get(block.id)! })),
		);
	}

	/**
	 * Every container, in the drawing.
	 * @returns The containers.
	 */
	frames(): PlacedNode[] {
		return [...this.tree.blocks.values()]
			.filter((block) => block.kind === "frame")
			.map((block) => ({
				id: block.id,
				box: this.boxOf(block),
				depth: this.depths.get(block.parent!.id)!,
			}));
	}

	/**
	 * Every group region, in the drawing.
	 * @returns The regions.
	 */
	regions(): PlacedRegion[] {
		return [...this.tree.blocks.values()]
			.filter((block) => block.kind === "region")
			.map((block) => ({
				group: block.group!,
				...(block.parent?.kind === "frame" ? { parent: block.parent.id } : {}),
				box: this.boxOf(block),
				caption: this.caption(block),
				depth: this.depths.get(block.id)!,
			}));
	}

	/**
	 * A region's caption box: in the band's top-left corner, as a frame's
	 * title is, whatever slot Graphviz kept for it on the first rank. Graphviz
	 * keeps the slot left of every port on that rank, so the corner is free.
	 * @param block The region.
	 * @returns The caption's box.
	 */
	caption(block: Block): Box {
		const slot = this.inside(block, headerOf(block));
		const band = this.boxOf(block);
		return { ...slot, x: band.x + CAPTION_INSET, y: band.y + CAPTION_INSET };
	}

	/**
	 * One relationship's lines joined end to end, and its label's box.
	 * @param projection Where it is drawn.
	 * @returns Its points and label.
	 */
	joined(projection: Projection): PlacedEdge {
		const { edge } = projection;
		const { pieces, labelAt } = this.tree.routes.get(edge.id)!;
		const points = pieces.flatMap(([block, key]) =>
			shifted(this.laid.get(block.id)!.lines.get(key) ?? [], this.origins.get(block.id)!),
		);
		const label = this.laid.get(labelAt.id)!.boxes.has(`label:${edge.id}`)
			? { label: this.inside(labelAt, `label:${edge.id}`) }
			: {};
		return { id: edge.id, points: corners(points), ...label };
	}

	/**
	 * The drawing's geometry.
	 * @returns What the main thread reads.
	 */
	placed(): Placed {
		const root = this.laid.get(this.tree.root.id)!;
		return {
			width: root.width,
			height: root.height,
			cards: this.cards(),
			frames: this.frames(),
			regions: this.regions(),
			edges: this.tree.projections.map((projection) => this.joined(projection)),
		};
	}
}

export { Assembly, type Placed };
