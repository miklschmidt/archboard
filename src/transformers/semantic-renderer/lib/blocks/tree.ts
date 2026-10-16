// The board, every container and every group region round more than one node
// (`lone.ts`) is a block, laid out on its own from its cards and child blocks.
// Its parent places it as one box, as compact as what it holds.
// A block of blocks gathers the cards it holds outside every block into a
// cluster, so each block holds cards alone or blocks alone.
//
// A relationship is drawn in the lowest block that holds both its ends, and
// crosses the edge of every block below that through a port: out of the
// bottom of each block around its source and into the top of each block
// around its target, or the other way round when it runs upward. Every
// relationship of one kind that crosses a block's edge to or from the same
// item shares one port, and every one that runs between the same two ends of
// a block without a label of its own there shares one line, so what runs
// between two blocks is drawn once, as a trunk. A relationship's label sits in
// the innermost block around its target, or else its source, next to the card
// it names, unless that would part lines joined on the way to it (`joins.ts`).
import type { ElkExtendedEdge, ElkNode } from "@archboard/elk-rs";
import { semanticOrder } from "@/transformers/semantic-renderer/lib/layout/semantic-order";
import {
	addInline,
	holds,
	labelHolder,
	type Cluster,
	type Nesting,
} from "@/transformers/semantic-renderer/lib/blocks/inline";
import { exitKey } from "@/transformers/semantic-renderer/lib/blocks/sides";
import type { Card } from "@/transformers/semantic-renderer/lib/blocks/card";
import { tabOf } from "@/transformers/semantic-renderer/lib/blocks/laid";
import {
	captionsOf,
	cardAs,
	framed,
	placingGroup,
	type Lone,
} from "@/transformers/semantic-renderer/lib/blocks/lone";
import { CycleWalk } from "@/transformers/semantic-renderer/lib/blocks/cycles";
import type { Header } from "@/transformers/semantic-renderer/lib/blocks/headers";
import { joinWays } from "@/transformers/semantic-renderer/lib/blocks/joins";
import { trunkKind } from "@/transformers/semantic-renderer/lib/track/route";

/** A width and a height. */
interface Size {
	readonly width: number;
	readonly height: number;
}

/** The top or the bottom edge of a block. */
type Face = "top" | "bottom";

/**
 * Which edge of a block a line crosses: its top or bottom, or, for a line
 * leaving toward a block beside it, the wall that faces that block.
 */
type Side = Face | "left" | "right";

/** A line's ends: where it comes from and goes to, and which Graphviz ranks above the other. */
interface Ends {
	/** Its source-side end: a card, a pin, a port or the header. */
	readonly from: string;
	/** Its target-side end. */
	readonly to: string;
	/** The end Graphviz ranks above the other. */
	readonly tail: string;
	/** The end Graphviz ranks below. */
	readonly head: string;
}

/** A line inside one block, between two of the block's items. */
interface Line extends Ends {
	/** The line's id in its block: its relationship's when it carries the label. */
	readonly key: string;
	/** The first relationship drawn on it, for its kind, order and label. */
	readonly edge: ElkExtendedEdge;
	/** Whether the relationship's label is drawn on it. */
	readonly labelled: boolean;
}

/**
 * A block: the board, a container, a group region, the cluster of cards a
 * block of blocks holds outside every block, or a column a block folds into.
 */
interface Block {
	readonly id: string;
	readonly kind: "root" | "frame" | "region" | "cluster" | "column";
	parent: Block | undefined;
	/** The group, for a region. */
	readonly group: string | undefined;
	/** A frame's title row at its top-left, or a region's caption tab down to the caption's foot. */
	readonly header: Header | undefined;
	/** Its cards and the blocks directly inside it, in the board's order. */
	readonly items: string[];
	/** The lines it draws, by key. */
	readonly lines: Map<string, Line>;
	/** Its ports, by id, with the edge each crosses. */
	readonly ports: Map<string, Side>;
	/** The containers and regions it draws inline, outermost first. */
	readonly clusters: Map<string, Cluster>;
	/** The innermost inline cluster around each of its items and clusters. */
	readonly clusterOf: Map<string, string>;
	/** The region round a container alone in it, which it is laid out as (`lone.ts`). */
	lone?: Lone;
}

/** Where one relationship is drawn: its block, and the blocks it leaves and enters. */
interface Projection {
	readonly edge: ElkExtendedEdge;
	/** The lowest block holding both ends. */
	readonly at: Block;
	/** The blocks it leaves, innermost first. */
	readonly out: readonly Block[];
	/** The blocks it enters, innermost first. */
	readonly into: readonly Block[];
	/** Its source-side item in `at`: a card, a block or the header. */
	readonly from: string;
	/** Its target-side item in `at`. */
	readonly to: string;
}

/** One part of a relationship: the block it is drawn in and its line there. */
type Piece = readonly [Block, string];

/** How one relationship is drawn: its lines in order, and the block that holds its label. */
interface Route {
	/** Each block it passes and its line there, from its source to its target. */
	readonly pieces: readonly Piece[];
	readonly labelAt: Block;
}

/**
 * The id of a block's header item.
 * @param block The block.
 * @returns The id.
 */
function headerOf(block: Block): string {
	return `header:${block.id}`;
}

/**
 * What a port on a side wall adds to its key: the line's end inside the
 * block. Each line crosses a wall on the track it runs on inside, so lines
 * from different items never share a wall port.
 * @param side The edge the port crosses.
 * @param inner The line's end inside the block.
 * @returns The key's part, empty for a port on the top or bottom.
 */
function walled(side: Side, inner: string): string {
	return side === "left" || side === "right" ? `${inner}|` : "";
}

/**
 * The item a chain of blocks reaches its outermost block at, or the node itself.
 * @param chain The blocks, innermost first.
 * @param node The node.
 * @returns The outermost block's id, or the node's.
 */
function outermost(chain: readonly Block[], node: string): string {
	return chain.at(-1)?.id ?? node;
}

/** The board's blocks and every relationship's lines through them. */
class BlockTree {
	readonly blocks = new Map<string, Block>();
	/** The block holding each card as an item. */
	readonly holder = new Map<string, Block>();
	readonly root: Block;
	readonly captions: ReadonlyMap<string, Size>;
	/** Every card's measured size and peer group; a card alone in its region takes the region's box. */
	readonly cards = new Map<string, Card>();
	/** Every card alone in its group's region, by id (`lone.ts`). */
	readonly lone = new Map<string, Lone>();
	/** Nodes drawn inline that are entry points of their container, each true when first (`entry-row.ts`). */
	readonly entries = new Map<string, boolean>();
	/** Every relationship's projection, in the board's order. */
	readonly projections: readonly Projection[];
	/** How each relationship is drawn, by id. */
	readonly routes = new Map<string, Route>();
	/** Where each pin meets its child block: the block and its port. */
	readonly pins = new Map<string, { readonly block: Block; readonly port: string }>();
	/** The blocks that joins of lines on the way to one card move labels to, by id. */
	readonly joining: ReadonlySet<string>;
	/** The relationships that keep ports of their own rather than join others, by id. */
	readonly apart: ReadonlySet<string>;

	/**
	 * Read the blocks of a measured hierarchy and project its relationships.
	 * @param graph The measured hierarchy.
	 * @param exits The wall each port moves to, keyed by `exitKey` (`sides.ts`) by
	 * the port it would otherwise be: an earlier layout's answer, where it
	 * stood the block beside the block its trunk goes to.
	 * @param nesting How containers and group regions are drawn.
	 * @param apart The blocks whose joins keep ports of their own, by id.
	 * @param orders Ports each block holds in an order on a face, keyed `block|face` (`orders.ts`).
	 */
	constructor(
		graph: ElkNode,
		readonly exits: ReadonlyMap<string, Side>,
		readonly nesting: Nesting,
		apart: ReadonlySet<string>,
		readonly orders: ReadonlyMap<string, readonly string[]> = new Map(),
	) {
		this.captions = captionsOf(graph);
		this.root = this.block(":root", "root", undefined, {});
		this.fill(this.root, graph.children ?? []);
		this.gather(this.root);
		const edges = (graph.edges ?? []).filter((edge) => edge.sources[0] !== edge.targets[0]);
		this.projections = edges.map((edge) => this.project(edge));
		const back = this.backEdges();
		const ways = joinWays(this.projections, back, apart);
		[this.joining, this.apart] = [ways.joining, ways.apart];
		for (const projection of this.projections)
			this.draw(projection, back, ways.before.has(projection.edge.id));
	}

	/**
	 * Make a block.
	 * @param id Its id.
	 * @param kind What it is.
	 * @param parent The block around it.
	 * @param of What it is of: a group, a header, a region round it alone.
	 * @param of.group The group.
	 * @param of.header The header size.
	 * @param of.lone The region.
	 * @returns The block.
	 */
	block(
		id: string,
		kind: Block["kind"],
		parent: Block | undefined,
		of: { group?: string; header?: Header; lone?: Lone | undefined },
	): Block {
		const made: Block = {
			id,
			kind,
			parent,
			group: of.group,
			header: of.header,
			...(of.lone === undefined ? {} : { lone: of.lone }),
			items: [],
			lines: new Map(),
			ports: new Map(),
			clusters: new Map(),
			clusterOf: new Map(),
		};
		this.blocks.set(id, made);
		parent?.items.push(id);
		return made;
	}

	/**
	 * Fill a block with nodes, gathering each group's members into its region.
	 * @param block The block.
	 * @param nodes The nodes directly inside it.
	 */
	fill(block: Block, nodes: readonly ElkNode[]): void {
		const ordered = nodes.toSorted((one, other) => semanticOrder(one) - semanticOrder(other));
		for (const node of ordered) {
			if (this.nesting !== "blocks") addInline(this, block, node, undefined, ordered);
			else {
				const group = placingGroup(this.lone, this.captions, node, ordered);
				this.add(group === undefined ? block : this.region(block, group), node);
			}
		}
	}

	/**
	 * Add one node to a block: a container as a block of its own, a card as an item.
	 * @param holder The block.
	 * @param node The node.
	 */
	add(holder: Block, node: ElkNode): void {
		if (!node.children?.length) {
			holder.items.push(node.id);
			this.holder.set(node.id, holder);
			this.cards.set(node.id, cardAs(node, this.lone.get(node.id)));
			return;
		}
		const frame = this.block(node.id, "frame", holder, framed(node, this.lone.get(node.id)));
		this.fill(frame, node.children);
	}

	/**
	 * Gather the cards a block of blocks holds outside every block into one
	 * cluster, so every block holds cards alone or blocks alone; drawn
	 * inline, a block of cards keeps its packed regions among its cards.
	 * @param block The block, and every block inside it.
	 */
	gather(block: Block): void {
		const inner = block.items.filter((item) => this.blocks.has(item));
		for (const item of inner) this.gather(this.blocks.get(item)!);
		const loose = block.items.filter((item) => !this.blocks.has(item));
		if (this.nesting !== "blocks" || inner.length === 0 || loose.length === 0) return;
		const at = block.items.indexOf(loose[0]!);
		const before = inner.filter((item) => block.items.indexOf(item) < at);
		block.items.length = 0;
		block.items.push(...before);
		const cluster = this.block(`cluster:${block.id}`, "cluster", block, {});
		block.items.push(...inner.slice(before.length));
		cluster.items.push(...loose);
		for (const card of loose) this.holder.set(card, cluster);
	}

	/**
	 * A group's region inside a block, made on first use.
	 * @param block The block.
	 * @param group The group.
	 * @returns The region.
	 */
	region(block: Block, group: string): Block {
		const id = `region:${block.id}:${group}`;
		return (
			this.blocks.get(id) ??
			this.block(id, "region", block, { group, header: tabOf(this.captions.get(group)) })
		);
	}

	/**
	 * The blocks around a node, innermost first.
	 * @param id The node: a card or a container.
	 * @returns The blocks.
	 */
	above(id: string): Block[] {
		const chain: Block[] = [];
		const start = this.blocks.get(id)?.parent ?? this.holder.get(id);
		for (let at = start; at !== undefined; at = at.parent) chain.push(at);
		return chain;
	}

	/**
	 * The blocks between a node and a container around it, innermost first.
	 * @param id The node.
	 * @param frame The container, if it is one.
	 * @returns The blocks, or nothing when the container does not hold the node.
	 */
	inside(id: string, frame: string): Block[] | undefined {
		const block = this.blocks.get(frame);
		const chain = this.above(id);
		const index = block === undefined ? -1 : chain.indexOf(block);
		return index < 0 ? undefined : chain.slice(0, index);
	}

	/**
	 * Where a relationship is drawn: in the container it leaves from or goes
	 * to when that container holds its other end, else in the lowest block
	 * holding both ends.
	 * @param edge The relationship.
	 * @returns Its projection.
	 */
	project(edge: ElkExtendedEdge): Projection {
		const source = edge.sources[0]!;
		const target = edge.targets[0]!;
		const into = this.inside(target, source);
		if (into !== undefined) {
			const at = this.blocks.get(source)!;
			return { edge, at, out: [], into, from: headerOf(at), to: outermost(into, target) };
		}
		const out = this.inside(source, target);
		if (out !== undefined) {
			const at = this.blocks.get(target)!;
			return { edge, at, out, into: [], from: outermost(out, source), to: headerOf(at) };
		}
		return this.between(edge, source, target);
	}

	/**
	 * Where a relationship between two nodes neither of which holds the other
	 * is drawn: in the lowest block holding both.
	 * @param edge The relationship.
	 * @param source Its source.
	 * @param target Its target.
	 * @returns Its projection.
	 */
	between(edge: ElkExtendedEdge, source: string, target: string): Projection {
		const fromChain = this.above(source);
		const toChain = this.above(target);
		const at = fromChain.find((block) => toChain.includes(block))!;
		const out = fromChain.slice(0, fromChain.indexOf(at));
		const into = toChain.slice(0, toChain.indexOf(at));
		return { edge, at, out, into, from: outermost(out, source), to: outermost(into, target) };
	}

	/**
	 * The relationships that close a cycle in the block they are drawn in,
	 * found depth-first from the items nothing points at, in the board's
	 * order. A line into its own container, drawn inline or not, runs upward.
	 * @returns The ids of those that run upward.
	 */
	backEdges(): Set<string> {
		return new Set([...this.blocks.values()].flatMap((block) => [...this.backEdgesIn(block)]));
	}

	/**
	 * The relationships that close a cycle in one block.
	 * @param block The block.
	 * @returns Their ids.
	 */
	backEdgesIn(block: Block): Set<string> {
		const here = this.projections.filter((projection) => projection.at === block);
		const upward = here.filter(({ from, to }) => to === headerOf(block) || holds(block, to, from));
		const out = new Map<string, Projection[]>();
		for (const projection of here.filter((one) => !upward.includes(one)))
			out.set(projection.from, [...(out.get(projection.from) ?? []), projection]);
		const pointed = new Set(here.map(({ to }) => to));
		const walk = new CycleWalk(out);
		const items = [headerOf(block), ...block.items];
		for (const item of items.filter((one) => !pointed.has(one))) walk.from(item);
		for (const item of items) walk.from(item);
		return new Set([...upward.map(({ edge }) => edge.id), ...walk.back]);
	}

	/**
	 * Give a relationship its lines: one in each block it leaves or enters,
	 * and one in the block that holds both ends.
	 * @param projection Where it is drawn.
	 * @param back The relationships that run upward where they are drawn.
	 * @param before Whether it carries its label before a join with others to its card.
	 */
	draw(projection: Projection, back: ReadonlySet<string>, before: boolean): void {
		const { edge, at } = projection;
		const upward = back.has(edge.id);
		const labelAt = labelHolder(this, projection, before);
		const leaving = this.leave(projection, upward, labelAt);
		const entering = this.enter(projection, upward, labelAt);
		const ranked = upward
			? { tail: entering.end, head: leaving.end }
			: { tail: leaving.end, head: entering.end };
		const middle = this.line(
			at,
			edge,
			{ from: leaving.end, to: entering.end, ...ranked },
			at === labelAt,
		);
		this.routes.set(edge.id, {
			pieces: [...leaving.pieces, [at, middle], ...entering.pieces],
			labelAt,
		});
	}

	/**
	 * A relationship's lines in the blocks it leaves, innermost first.
	 * @param projection Where it is drawn.
	 * @param upward Whether it runs upward where it is drawn.
	 * @param labelAt The block that holds its label.
	 * @returns The lines, and the end they leave it at in the block that holds both ends.
	 */
	leave(projection: Projection, upward: boolean, labelAt: Block): { pieces: Piece[]; end: string } {
		const { edge, out } = projection;
		const face: Face = upward ? "top" : "bottom";
		const pieces: Piece[] = [];
		let from = this.onEdge(
			out.length === 0 ? projection.from : edge.sources[0]!,
			`from|${face}|${projection.to}|${trunkKind(edge)}`,
			face,
		);
		for (const block of out) {
			const along = `${projection.to}|${this.kindOf(edge)}`;
			const side = block === labelAt ? face : this.exitOf(block, "out", face, along);
			const port = this.port(block, `out|${side}|${walled(side, from)}${along}`, side);
			const ranked = side === "top" ? { tail: port, head: from } : { tail: from, head: port };
			const line = this.line(block, edge, { from, to: port, ...ranked }, block === labelAt);
			pieces.push([block, line]);
			from = this.pin(block, port);
		}
		return { pieces, end: from };
	}

	/**
	 * A relationship's lines in the blocks it enters, outermost first.
	 * @param projection Where it is drawn.
	 * @param upward Whether it runs upward where it is drawn.
	 * @param labelAt The block that holds its label.
	 * @returns The lines, and the end they enter from in the block that holds both ends.
	 */
	enter(projection: Projection, upward: boolean, labelAt: Block): { pieces: Piece[]; end: string } {
		const { edge, into } = projection;
		const face: Face = upward ? "bottom" : "top";
		const pieces: Piece[] = [];
		let to = this.onEdge(
			into.length === 0 ? projection.to : edge.targets[0]!,
			`to|${face}|${projection.from}|${trunkKind(edge)}`,
			face,
		);
		for (const block of into) {
			const along = `${projection.from}|${this.kindOf(edge)}`;
			const side = this.exitOf(block, "in", face, along);
			const port = this.port(block, `in|${side}|${walled(side, to)}${along}`, side);
			const ranked = side === "bottom" ? { tail: to, head: port } : { tail: port, head: to };
			const line = this.line(block, edge, { from: port, to, ...ranked }, block === labelAt);
			pieces.unshift([block, line]);
			to = this.pin(block, port);
		}
		return { pieces, end: to };
	}

	/**
	 * What a relationship's ports on a block's edge share: its kind and look, or its own id.
	 * @param edge The relationship.
	 * @returns The key's part.
	 */
	kindOf(edge: ElkExtendedEdge): string {
		return this.apart.has(edge.id) ? `${trunkKind(edge)}|${edge.id}` : trunkKind(edge);
	}

	/**
	 * Where a line meets a container the relationship names as its end: a
	 * port on the container's own edge, so the line stops at the box the
	 * reader sees instead of running in to its middle.
	 * @param end The line's end.
	 * @param key What the relationships ending there share.
	 * @param face The edge the port stands on.
	 * @returns The port's pin on a container, else the end itself.
	 */
	onEdge(end: string, key: string, face: Face): string {
		const block = this.blocks.get(end);
		return block?.kind === "frame" ? this.pin(block, this.port(block, key, face)) : end;
	}

	/**
	 * The edge a port crosses: the wall an earlier layout moved it to, or its face.
	 * @param block The block.
	 * @param way Whether the line leaves or enters the block there.
	 * @param face Its face.
	 * @param along What the lines through the port share.
	 * @returns The edge.
	 */
	exitOf(block: Block, way: "in" | "out", face: Face, along: string): Side {
		return this.exits.get(exitKey(block.id, way, face, along)) ?? face;
	}

	/**
	 * A block's port, made on first use.
	 * @param block The block.
	 * @param key What the relationships through it share.
	 * @param side The edge it crosses.
	 * @returns Its id.
	 */
	port(block: Block, key: string, side: Side): string {
		const id = `port:${key}`;
		block.ports.set(id, side);
		return id;
	}

	/**
	 * The item where a child block's port meets its parent's lines.
	 * @param block The child block.
	 * @param port Its port.
	 * @returns The pin's id.
	 */
	pin(block: Block, port: string): string {
		const id = `pin:${block.id}:${port}`;
		this.pins.set(id, { block, port });
		return id;
	}

	/**
	 * A line in a block, shared with every relationship that runs between the
	 * same ends here without a label of its own.
	 * @param block The block.
	 * @param edge The relationship.
	 * @param ends Its ends.
	 * @param labelled Whether its label is drawn here.
	 * @returns The line's key.
	 */
	line(block: Block, edge: ElkExtendedEdge, ends: Ends, labelled: boolean): string {
		const carries = labelled && (edge.labels?.length ?? 0) > 0;
		const key = carries ? edge.id : `${ends.from}>${ends.to}|${trunkKind(edge)}`;
		if (!block.lines.has(key)) block.lines.set(key, { key, edge, ...ends, labelled: carries });
		return key;
	}

	/**
	 * Every block, each after the blocks inside it.
	 * @param block Where to start.
	 * @returns The blocks, innermost first.
	 */
	innermostFirst(block: Block = this.root): Block[] {
		return [
			...block.items.flatMap((item) => {
				const inner = this.blocks.get(item);
				return inner === undefined ? [] : this.innermostFirst(inner);
			}),
			block,
		];
	}
}

export {
	BlockTree,
	headerOf,
	type Block,
	type Ends,
	type Line,
	type Piece,
	type Projection,
	type Face,
	type Route,
	type Side,
	type Size,
};
