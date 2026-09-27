// Every block put where its parent placed it, and every relationship's lines
// joined end to end through its ports: the drawing's geometry, as the main
// thread reads it.
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import {
	CAPTION_INSET,
	corners,
	moved,
	shifted,
	type Laid,
} from "@/transformers/semantic-renderer/lib/blocks/laid";
import {
	captionIn,
	cardIn,
	carriedLine,
	type Lone,
	type Stop,
} from "@/transformers/semantic-renderer/lib/blocks/lone";
import { unstepped } from "@/transformers/semantic-renderer/lib/blocks/steps";
import {
	headerOf,
	type Block,
	type BlockTree,
	type Projection,
} from "@/transformers/semantic-renderer/lib/blocks/tree";

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
	readonly titles: readonly Title[];
}

/** A container's title row, and the band across the container's top it stands in. */
interface Title {
	readonly box: Box;
	readonly band: Box;
}

/**
 * How many containers a block draws inline around one of its cards.
 * @param block The block.
 * @param card The card.
 * @returns The count.
 */
function framesAround(block: Block, card: string): number {
	let count = 0;
	for (let at = block.clusterOf.get(card); at !== undefined; at = block.clusters.get(at)?.parent)
		if (block.clusters.get(at)?.kind === "frame") count += 1;
	return count;
}

/**
 * The innermost container a block draws inline around one of its items.
 * @param block The block.
 * @param item The item.
 * @returns The container's id, if any.
 */
function clusterFrame(block: Block, item: string): string | undefined {
	let at = block.clusterOf.get(item);
	while (at !== undefined && block.clusters.get(at)!.kind !== "frame")
		at = block.clusters.get(at)!.parent;
	return at;
}

/**
 * The innermost container a block is, or stands in.
 * @param block The block.
 * @returns The container's id, if any.
 */
function blockFrame(block: Block): string | undefined {
	let at: Block | undefined = block;
	while (at !== undefined && at.kind !== "frame") at = at.parent;
	return at?.id;
}

/** Every block put where its parent placed it, and every relationship joined. */
class Assembly {
	readonly origins = new Map<string, Point>();
	readonly depths = new Map<string, number>();
	/** Every card or container alone in its region, laid out as its region's box. */
	readonly lone: ReadonlyMap<string, { lone: Lone; block: Block; stop: Stop }>;

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
		this.lone = this.loneLaid();
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
				.map((id) => {
					const lone = this.tree.lone.get(id);
					const box = this.inside(block, id);
					return {
						id,
						box: lone === undefined ? box : cardIn(box, lone),
						depth: this.depths.get(block.id)! + framesAround(block, id),
					};
				}),
		);
	}

	/**
	 * Every region round one card or container that the blocks laid out as
	 * its node (`lone.ts`), in the drawing, captioned clear of the lines into it.
	 * @param lines Every line in the drawing.
	 * @returns The regions.
	 */
	loneRegions(lines: readonly (readonly Point[])[]): PlacedRegion[] {
		return [...this.lone].map(([id, { lone, block, stop }]) => {
			const parent = clusterFrame(block, id) ?? blockFrame(block);
			return {
				group: lone.group,
				...(parent === undefined ? {} : { parent }),
				box: stop.region,
				caption: captionIn(stop.region, lone, lines),
				depth: this.depths.get(block.id)! + framesAround(block, id),
			};
		});
	}

	/**
	 * Every card or container alone in its region, laid out as the region's
	 * box: a card as an item of its block, a container as a block of its own
	 * or as a cluster of the block that draws it inline.
	 * @returns Each one's region, the block around it, and its region's box and its own, by id.
	 */
	loneLaid(): Map<string, { lone: Lone; block: Block; stop: Stop }> {
		const found = new Map<string, { lone: Lone; block: Block; stop: Stop }>();
		for (const [id, lone] of this.tree.lone) {
			const frame = this.tree.blocks.get(id);
			const block = frame?.parent ?? this.tree.holder.get(id)!;
			const stop =
				frame === undefined
					? this.laidIn(block, id, lone)
					: { region: this.boxOf(frame), card: this.frameBox(frame) };
			found.set(id, { lone, block, stop });
		}
		return found;
	}

	/**
	 * The box a block laid a card or container alone in its region out as,
	 * and the node's own: a card's as an item, or round a container it draws
	 * inline.
	 * @param block The block.
	 * @param id The card or container.
	 * @param lone Its region.
	 * @returns The boxes.
	 */
	laidIn(block: Block, id: string, lone: Lone): Stop {
		const inline = this.laid.get(block.id)!.frames?.find((frame) => frame.id === id);
		if (inline === undefined) {
			const region = this.inside(block, id);
			return { region, card: cardIn(region, lone) };
		}
		const origin = this.origins.get(block.id)!;
		return { region: moved(inline.region!, origin), card: moved(inline.box, origin) };
	}

	/**
	 * Where a line stops at a card or container alone in its region: that
	 * region's box and the node's.
	 * @param end The line's end.
	 * @returns The boxes, when the end is such a node.
	 */
	loneEnd(end: string | undefined): Stop | undefined {
		return end === undefined ? undefined : this.lone.get(end)?.stop;
	}

	/**
	 * Every container, in the drawing.
	 * @returns The containers.
	 */
	frames(): PlacedNode[] {
		const blocks = [...this.tree.blocks.values()];
		return [
			...blocks
				.filter((block) => block.kind === "frame")
				.map((block) => ({
					id: block.id,
					box: this.frameBox(block),
					depth: this.depths.get(block.parent!.id)!,
				})),
			...blocks.flatMap((block) =>
				(this.laid.get(block.id)!.frames ?? []).map(({ id, box, depth }) => ({
					id,
					box: moved(box, this.origins.get(block.id)!),
					depth: this.depths.get(block.id)! + depth,
				})),
			),
		];
	}

	/**
	 * A container's box in the drawing: inside the region it was laid out as,
	 * when it is alone in one (`lone.ts`).
	 * @param block The container.
	 * @returns Its box.
	 */
	frameBox(block: Block): Box {
		const box = this.boxOf(block);
		return block.lone === undefined ? box : cardIn(box, block.lone);
	}

	/**
	 * Every group region, in the drawing.
	 * @returns The regions.
	 */
	regions(): PlacedRegion[] {
		const blocks = [...this.tree.blocks.values()];
		return [
			...blocks
				.filter((block) => block.kind === "region")
				.map((block) => ({
					group: block.group!,
					...(block.parent?.kind === "frame" ? { parent: block.parent.id } : {}),
					box: this.boxOf(block),
					caption: this.caption(block),
					depth: this.depths.get(block.id)!,
				})),
			...blocks.flatMap((block) => this.inlineRegions(block)),
		];
	}

	/**
	 * The group regions a block draws inline, in the drawing.
	 * @param block The block.
	 * @returns Its regions.
	 */
	inlineRegions(block: Block): PlacedRegion[] {
		const origin = this.origins.get(block.id)!;
		return (this.laid.get(block.id)!.regions ?? []).map(
			({ group, parent, box, caption, depth }) => ({
				group,
				...(parent === undefined ? {} : { parent }),
				box: moved(box, origin),
				caption: moved(caption, origin),
				depth: this.depths.get(block.id)! + depth,
			}),
		);
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
		const source = this.loneEnd(edge.sources[0]);
		const target = this.loneEnd(edge.targets[0]);
		const carried = carriedLine(corners(points), source, target);
		return { id: edge.id, points: corners(carried), ...label };
	}

	/**
	 * The drawing's geometry.
	 * @returns What the main thread reads.
	 */
	placed(): Placed {
		const root = this.laid.get(this.tree.root.id)!;
		const edges = this.tree.projections.map((projection) => this.joined(projection));
		return {
			width: root.width,
			height: root.height,
			cards: this.cards(),
			frames: this.frames(),
			regions: [...this.regions(), ...this.loneRegions(edges.map(({ points }) => points))],
			edges,
			titles: this.titles(),
		};
	}

	/**
	 * Every container's title row and the band across its top it stands in, in the drawing.
	 * @returns Each title's box and its band's.
	 */
	titles(): Title[] {
		const inline = [...this.tree.blocks.values()].flatMap((block) => {
			const { frames, boxes } = this.laid.get(block.id)!;
			return (frames ?? [])
				.filter(({ id }) => boxes.has(`title:${id}`))
				.map(({ id, box }) => ({
					title: this.inside(block, `title:${id}`),
					frame: moved(box, this.origins.get(block.id)!),
				}));
		});
		const framed = [...this.tree.blocks.values()]
			.filter((block) => block.kind === "frame")
			.map((block) => {
				return { title: this.inside(block, headerOf(block)), frame: this.frameBox(block) };
			});
		return [...framed, ...inline].map(({ title, frame }) => ({
			box: title,
			band: { ...frame, height: title.y + title.height - frame.y },
		}));
	}

	/**
	 * The drawing with the steps its joined lines need not take taken out (`steps.ts`).
	 * @param placed The drawing's geometry.
	 * @returns It, its lines unstepped.
	 */
	static unstepped(placed: Placed): Placed {
		const boxes = [
			...placed.cards.map(({ box }) => box),
			...placed.regions.map(({ caption }) => caption),
			...placed.titles.map(({ box }) => box),
		];
		const walls = [...placed.frames, ...placed.regions].map(({ box }) => box);
		const bands = [
			...placed.titles.map(({ band }) => band),
			...placed.regions.map(({ box, caption }) => ({
				...box,
				height: caption.y + caption.height - box.y,
			})),
		];
		const routes = unstepped(placed.edges, { boxes, walls, bands });
		return {
			...placed,
			edges: placed.edges.map((edge, index) => ({ ...edge, points: routes[index]! })),
		};
	}
}

export { Assembly, type Placed };
