// The block engine's hierarchy. The board, every container and every group
// region is a block, laid out on its own; a block's items are the cards and
// the blocks directly inside it, so a block is as compact as what it holds
// and its parent places it as one box. A block of blocks gathers the cards it
// holds outside every block into a cluster, so each block holds cards alone
// or blocks alone.
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
// it names.
import type { ElkExtendedEdge, ElkNode } from "@archboard/elk-rs";
import { z } from "zod";
import {
	GROUP_CAPTIONS,
	PLACING_GROUP,
} from "@/transformers/semantic-renderer/lib/layout/compound-graph";
import { semanticOrder } from "@/transformers/semantic-renderer/lib/layout/semantic-order";

/** A width and a height. */
interface Size {
	readonly width: number;
	readonly height: number;
}

/** Which edge of a block a line crosses. */
type Side = "top" | "bottom";

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
	/** The title row a frame, or the caption a region, keeps at its top-left. */
	readonly header: Size | undefined;
	/** Its cards and the blocks directly inside it, in the board's order. */
	readonly items: string[];
	/** The lines it draws, by key. */
	readonly lines: Map<string, Line>;
	/** Its ports, by id, with the edge each crosses. */
	readonly ports: Map<string, Side>;
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

const CaptionsSchema = z.array(z.tuple([z.string(), z.number(), z.number()]));

/**
 * The id of a block's header item.
 * @param block The block.
 * @returns The id.
 */
function headerOf(block: Block): string {
	return `header:${block.id}`;
}

/**
 * The kind a line is bundled by: the relationship's kind and comparison standing.
 * @param edge The relationship.
 * @returns The kind.
 */
function kindOf(edge: ElkExtendedEdge): string {
	const options = edge.layoutOptions ?? {};
	const kind = options["archboard.relationship.kind"] ?? "";
	return `${kind}|${options["archboard.relationship.standing"] ?? "unchanged"}`;
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

/** A depth-first walk over one block's projections that finds the ones closing a cycle. */
class CycleWalk {
	readonly back = new Set<string>();
	readonly state = new Map<string, "open" | "done">();

	/**
	 * A walk over the projections leaving each item.
	 * @param out The projections leaving each item.
	 */
	constructor(readonly out: ReadonlyMap<string, readonly Projection[]>) {}

	/**
	 * Walk from one item, unless the walk has been there.
	 * @param item The item.
	 */
	from(item: string): void {
		if (this.state.has(item)) return;
		this.state.set(item, "open");
		for (const projection of this.out.get(item) ?? []) {
			if (this.state.get(projection.to) === "open") this.back.add(projection.edge.id);
			else this.from(projection.to);
		}
		this.state.set(item, "done");
	}
}

/** The board's blocks and every relationship's lines through them. */
class BlockTree {
	readonly blocks = new Map<string, Block>();
	/** The block holding each card as an item. */
	readonly holder = new Map<string, Block>();
	readonly root: Block;
	readonly captions: ReadonlyMap<string, Size>;
	/** Every card's measured size. */
	readonly cards = new Map<string, Size>();
	/** Every relationship's projection, in the board's order. */
	readonly projections: readonly Projection[];
	/** How each relationship is drawn, by id. */
	readonly routes = new Map<string, Route>();
	/** Where each pin meets its child block: the block and its port. */
	readonly pins = new Map<string, { readonly block: Block; readonly port: string }>();

	/**
	 * Read the blocks of a measured hierarchy and project its relationships.
	 * @param graph The measured hierarchy.
	 */
	constructor(graph: ElkNode) {
		const rows = CaptionsSchema.parse(JSON.parse(graph.layoutOptions?.[GROUP_CAPTIONS] ?? "[]"));
		this.captions = new Map(rows.map(([id, width, height]) => [id, { width, height }]));
		this.root = this.block("root", "root", undefined, {});
		this.fill(this.root, graph.children ?? []);
		this.gather(this.root);
		const edges = (graph.edges ?? []).filter((edge) => edge.sources[0] !== edge.targets[0]);
		this.projections = edges.map((edge) => this.project(edge));
		const back = this.backEdges();
		for (const projection of this.projections) this.draw(projection, back.has(projection.edge.id));
	}

	/**
	 * Make a block.
	 * @param id Its id.
	 * @param kind What it is.
	 * @param parent The block around it.
	 * @param of What it is of: a region's group, and a frame's or region's header.
	 * @param of.group The group.
	 * @param of.header The header size.
	 * @returns The block.
	 */
	block(
		id: string,
		kind: Block["kind"],
		parent: Block | undefined,
		of: { group?: string; header?: Size },
	): Block {
		const made: Block = {
			id,
			kind,
			parent,
			group: of.group,
			header: of.header,
			items: [],
			lines: new Map(),
			ports: new Map(),
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
			const group = node.layoutOptions?.[PLACING_GROUP];
			this.add(group === undefined ? block : this.region(block, group), node);
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
			this.cards.set(node.id, { width: node.width!, height: node.height! });
			return;
		}
		const header = Number(node.layoutOptions?.["archboard.header.size"] ?? 0);
		const frame = this.block(node.id, "frame", holder, {
			header: { width: node.width!, height: Math.max(1, header) },
		});
		this.fill(frame, node.children);
	}

	/**
	 * Gather the cards a block of blocks holds outside every block into one
	 * cluster, so every block holds either cards alone or blocks alone, and
	 * every line between blocks runs between two blocks.
	 * @param block The block, and every block inside it.
	 */
	gather(block: Block): void {
		const inner = block.items.filter((item) => this.blocks.has(item));
		for (const item of inner) this.gather(this.blocks.get(item)!);
		const loose = block.items.filter((item) => !this.blocks.has(item));
		if (inner.length === 0 || loose.length === 0) return;
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
			this.block(id, "region", block, {
				group,
				header: this.captions.get(group) ?? { width: 1, height: 1 },
			})
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
	 * order. A line into a container's own header always runs upward.
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
		const upward = here.filter(({ to }) => to === headerOf(block));
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
	 * @param upward Whether it runs upward where it is drawn.
	 */
	draw(projection: Projection, upward: boolean): void {
		const { edge, at, out, into } = projection;
		const labelAt = into[0] ?? out[0] ?? at;
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
		const side: Side = upward ? "top" : "bottom";
		const pieces: Piece[] = [];
		let from = out.length === 0 ? projection.from : edge.sources[0]!;
		for (const block of out) {
			const port = this.port(block, `out|${side}|${projection.to}|${kindOf(edge)}`, side);
			const ranked = upward ? { tail: port, head: from } : { tail: from, head: port };
			pieces.push([
				block,
				this.line(block, edge, { from, to: port, ...ranked }, block === labelAt),
			]);
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
		const side: Side = upward ? "bottom" : "top";
		const pieces: Piece[] = [];
		let to = into.length === 0 ? projection.to : edge.targets[0]!;
		for (const block of into) {
			const port = this.port(block, `in|${side}|${projection.from}|${kindOf(edge)}`, side);
			const ranked = upward ? { tail: to, head: port } : { tail: port, head: to };
			pieces.unshift([
				block,
				this.line(block, edge, { from: port, to, ...ranked }, block === labelAt),
			]);
			to = this.pin(block, port);
		}
		return { pieces, end: to };
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
		const key = carries ? edge.id : `${ends.from}>${ends.to}|${kindOf(edge)}`;
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
	type Route,
	type Side,
	type Size,
};
