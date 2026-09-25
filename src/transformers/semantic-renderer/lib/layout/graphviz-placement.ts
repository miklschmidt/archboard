import type { ElkExtendedEdge, ElkLabel, ElkNode, LayoutOptions } from "@archboard/elk-rs";
import type { Graph, Subgraph, Viz } from "@viz-js/viz";
import { z } from "zod";
import type { Box } from "@/transformers/semantic-renderer/lib/geometry";
import { Below } from "@/transformers/semantic-renderer/lib/blocks/clusters";
import { alignColumns } from "@/transformers/semantic-renderer/lib/track/graphviz";
import {
	CARD_GAP,
	CONTAINER_INSET,
	PLACEMENT_MARGIN,
	RANK_GAP,
} from "@/transformers/semantic-renderer/config";

import { CARD_ROUTING_GAP } from "@/transformers/semantic-renderer/lib/layout/routing-clearance";
import { orientLabelChains } from "@/transformers/semantic-renderer/lib/layout/label-chains";
import { semanticOrder } from "@/transformers/semantic-renderer/lib/layout/semantic-order";
import {
	dimensions,
	pack,
	type Offset,
} from "@/transformers/semantic-renderer/lib/layout/packed-frames";

// Viz publishes graph input types, but returns only `object` for Graphviz JSON.
const objectSchema = z.object({
	name: z.string(),
	bb: z.string().optional(),
	pos: z.string().optional(),
});
const outputSchema = z.object({ bb: z.string(), objects: z.array(objectSchema).default([]) });
type Cluster = Subgraph & Required<Pick<Subgraph, "nodes" | "edges" | "subgraphs">>;
/**
 * Read finite coordinates from Graphviz's comma-separated geometry.
 * @param value The serialized point or bounds.
 * @returns The finite coordinates.
 */
function coordinates(value: string): number[] {
	const numbers = value.split(",").map(Number);
	if (numbers.some((number) => !Number.isFinite(number)))
		throw new Error("Graphviz returned non-finite geometry");
	return numbers;
}

/**
 * Build a fixed-size Graphviz rectangle in Graphviz's inch units.
 * @param name Its graph identity.
 * @param shape Its measured dimensions in diagram points.
 * @returns The vendor node.
 */
function rectangle(
	name: string,
	shape: Pick<ElkNode, "width" | "height">,
): NonNullable<Graph["nodes"]>[number] {
	const { width, height } = dimensions(shape);
	return { name, attributes: { width: width / 72, height: height / 72 } };
}

/**
 * A placed shape's box.
 * @param shape A node or label Graphviz placed.
 * @returns Its box.
 */
function readBox(shape: Pick<ElkNode, "x" | "y" | "width" | "height">): Box {
	return { x: shape.x ?? 0, y: shape.y ?? 0, ...dimensions(shape) };
}

/** One graph conversion, keeping vendor identities separate from semantic identities. */
class Placement {
	readonly graph: Graph & Cluster;
	readonly nodes = new Map<string, ElkNode>();
	readonly endpoints = new Map<string, string>();
	readonly parents = new Map<string, Cluster>();
	readonly minimums = new Map<string, ReturnType<typeof dimensions>>();
	readonly reserved = new Map<string, ElkLabel>();
	readonly labelParents = new Map<string, Cluster>();
	readonly packed = new Map<string, Offset[]>();
	readonly connected: ReadonlySet<string>;
	readonly edges: ElkExtendedEdge[];
	readonly result: ElkNode;

	/**
	 * Start an isolated solve so later retries cannot observe mutations.
	 * @param input The measured hierarchy.
	 * @param options The spacing requested for this attempt.
	 */
	constructor(input: ElkNode, options: LayoutOptions) {
		this.result = structuredClone(input);
		this.edges = this.result.edges ?? [];
		this.connected = new Set(this.edges.flatMap((edge) => [...edge.sources, ...edge.targets]));
		this.graph = {
			directed: true,
			graphAttributes: {
				newrank: true,
				compound: true,
				rankdir: "TB",
				splines: "ortho",
				// Graphviz uses inches; spacing constants use diagram points.
				nodesep: Math.max(CARD_GAP, CARD_ROUTING_GAP) / 72,
				ranksep:
					Math.max(
						Number(options["elk.layered.spacing.nodeNodeBetweenLayers"] ?? RANK_GAP),
						CARD_ROUTING_GAP,
					) / 72,
				pad: 0,
				// Graphviz keeps top-level frames apart by the root margin, in points:
				// with none, two frames side by side stood 2 points apart.
				margin: CARD_ROUTING_GAP,
			},
			nodeAttributes: { shape: "box", fixedsize: true, label: "", margin: 0 },
			edgeAttributes: { dir: "none" },
			nodes: [],
			edges: [],
			subgraphs: [],
		};
	}

	/**
	 * Whether a leaf has no relationship and can be packed independently.
	 * @param node The candidate child.
	 * @returns True when no route relies on the child's position.
	 */
	independent(node: ElkNode): boolean {
		return !node.children?.length && !this.connected.has(node.id);
	}

	/**
	 * Map a semantic node and its endpoints into the vendor graph.
	 * @param node The node being added.
	 * @param name Its vendor node identity.
	 * @param parent The containing vendor cluster.
	 */
	register(node: ElkNode, name: string, parent: Cluster): void {
		this.nodes.set(node.id, node);
		this.minimums.set(node.id, dimensions(node));
		this.endpoints.set(node.id, name);
		this.parents.set(name, parent);
	}

	/**
	 * Add a card, packed collection, or nested cluster.
	 * @param node The measured semantic node.
	 * @param parent Its vendor parent.
	 */
	visit(node: ElkNode, parent: Cluster): void {
		if (!node.children?.length) {
			this.register(node, node.id, parent);
			parent.nodes.push(rectangle(node.id, node));
		} else if (node.children.every((child) => this.independent(child))) {
			this.packed.set(node.id, pack(node));
			this.register(node, node.id, parent);
			parent.nodes.push(rectangle(node.id, node));
		} else this.cluster(node, parent);
	}

	/**
	 * Add a globally ranked compound cluster and its measured title anchor.
	 * @param node The frame.
	 * @param parent Its enclosing cluster.
	 */
	cluster(node: ElkNode, parent: Cluster): void {
		const size = Number(node.layoutOptions?.["archboard.header.size"] ?? 0);
		const cluster: Cluster = {
			name: `cluster_${node.id}`,
			graphAttributes: { margin: CONTAINER_INSET },
			nodes: [],
			edges: [],
			subgraphs: [],
		};
		const name = `title_${node.id}`;
		this.register(node, name, cluster);
		parent.subgraphs.push(cluster);
		const anchor = rectangle(name, {
			width: Math.max(
				dimensions(node).width,
				...node.children!.map((child) => dimensions(child).width),
			),
			height: Math.max(1, size),
		});
		cluster.nodes.push(anchor);
		for (const child of node.children!) this.visit(child, cluster);
	}

	/**
	 * Connect semantic endpoints, reserving an extra rank only when necessary.
	 * @param edge The semantic relationship.
	 */
	connect(edge: ElkExtendedEdge): void {
		const tail = this.endpoints.get(edge.sources[0]!)!;
		const head = this.endpoints.get(edge.targets[0]!)!;
		const label = edge.labels?.[0];
		if (label !== undefined) this.reserve(edge.id, tail, head, label);
		else this.graph.edges.push({ tail, head });
	}

	/**
	 * Give an unplaceable label its own obstacle and rank.
	 * @param id The semantic relationship identity.
	 * @param tail The vendor source.
	 * @param head The vendor target.
	 * @param label Its measured label.
	 */
	reserve(id: string, tail: string, head: string, label: ElkLabel): void {
		const name = `label_${id}`;
		const parent =
			this.parents.get(tail) === this.parents.get(head) ? this.parents.get(tail)! : this.graph;
		this.reserved.set(name, label);
		this.labelParents.set(name, parent);
		parent.nodes.push(rectangle(name, label));
		this.graph.edges.push(
			{ tail, head: name, attributes: { headport: "n" } },
			{ tail: name, head, attributes: { tailport: "s" } },
		);
	}

	/**
	 * Keep a measured title ahead of every child a line from inside the frame
	 * does not already hold below it. That hold would only pull the child under
	 * the title, off its line: each one passes beside the children above it, so
	 * a chain inside a frame stepped sideways a card at a time.
	 * @param node The frame to order.
	 * @param below Which vendor nodes lead down to which, every title to each child included.
	 */
	order(node: ElkNode, below: Below): void {
		if (!node.children?.length || this.packed.has(node.id)) return;
		const members = node.children
			.toSorted((one, other) => semanticOrder(one) - semanticOrder(other))
			.map((child) => this.endpoints.get(child.id)!);
		for (const head of members.filter((member) => !this.held(node, member, below))) {
			this.graph.edges.push({
				tail: this.endpoints.get(node.id)!,
				head,
				attributes: { style: "invis", weight: 10 },
			});
		}
	}

	/**
	 * Whether a line from inside a frame holds one of its children below the
	 * title: a line from another of its descendants, on no loop through the
	 * child, which Graphviz could break by turning that line round.
	 * @param frame The frame.
	 * @param member The child's vendor node.
	 * @param below Which vendor nodes lead down to which.
	 * @returns True when such a line holds it.
	 */
	held(frame: ElkNode, member: string, below: Below): boolean {
		return this.edges.some((edge) => {
			const [source, target] = [edge.sources[0]!, edge.targets[0]!];
			if (this.endpoints.get(target) !== member || !contains(frame, source)) return false;
			return !below.reaches(member, this.endpoints.get(source)!);
		});
	}

	/**
	 * Which vendor nodes lead down to which: every edge, and every title to
	 * each of its frame's children.
	 * @returns The reach.
	 */
	below(): Below {
		const below = new Below();
		for (const { tail, head } of this.graph.edges) below.add(tail, head);
		for (const node of this.nodes.values())
			for (const child of node.children ?? [])
				below.add(this.endpoints.get(node.id)!, this.endpoints.get(child.id)!);
		return below;
	}

	/**
	 * A child calling its own frame must not pull the title below the child.
	 * @param edge The vendor relationship.
	 */
	orderReturn(edge: NonNullable<Graph["edges"]>[number]): void {
		if (!edge.head.startsWith("title_")) return;
		const frame = this.nodes.get(edge.head.slice(6));
		const source = edge.tail.startsWith("label_")
			? this.edges.find((relationship) => relationship.id === edge.tail.slice(6))!.sources[0]!
			: edge.tail.replace(/^title_/, "");
		if (frame !== undefined && contains(frame, source))
			edge.attributes = { ...edge.attributes, constraint: false };
	}

	/**
	 * Copy Graphviz geometry back to the measured semantic shape.
	 * @param object One vendor geometry record.
	 * @param origin The output bounds' top-left corner.
	 */
	read(object: z.infer<typeof objectSchema>, origin: readonly number[]): void {
		const id = object.name.startsWith("cluster_") ? object.name.slice(8) : object.name;
		const node = this.nodes.get(id);
		if (node !== undefined && object.bb !== undefined)
			Object.assign(node, readBounds(object.bb, origin));
		else this.readPoint(object, node, origin);
	}

	/**
	 * Resolve a fixed-size card or reserved label's center coordinate.
	 * @param object One Graphviz node.
	 * @param node Its semantic node, if any.
	 * @param origin The diagram origin.
	 */
	readPoint(
		object: z.infer<typeof objectSchema>,
		node: ElkNode | undefined,
		origin: readonly number[],
	): void {
		const shape = node ?? this.reserved.get(object.name);
		if (shape === undefined || object.pos === undefined) return;
		const point = coordinates(object.pos);
		const { width, height } = dimensions(shape);
		Object.assign(shape, {
			x: point[0]! - width / 2 - origin[0]! + PLACEMENT_MARGIN,
			y: point[1]! - height / 2 - origin[1]! + PLACEMENT_MARGIN,
		});
	}

	/**
	 * Build the vendor graph before invoking the placement engine.
	 */
	build(): void {
		for (const node of this.result.children ?? []) this.visit(node, this.graph);
		for (const edge of this.edges) this.connect(edge);
		const below = this.below();
		for (const node of this.nodes.values()) this.order(node, below);
		for (const edge of this.graph.edges) this.orderReturn(edge);
		orientLabelChains(this.graph);
	}

	/** Keep reserved labels aligned with their endpoints after sibling slots change. */
	orderLabels(): void {
		const rows = new Map<string, { label: ElkLabel; center: number; order: number }[]>();
		for (const edge of this.edges) {
			const id = `label_${edge.id}`;
			const label = this.reserved.get(id);
			if (label === undefined) continue;
			const from = this.nodes.get(edge.sources[0]!)!;
			const to = this.nodes.get(edge.targets[0]!)!;
			const key = `${this.labelParents.get(id)!.name}:${label.y}:${label.width}:${label.height}`;
			const row = rows.get(key) ?? [];
			row.push({
				label,
				center: from.x! + from.width! / 2 + to.x! + to.width! / 2,
				order: semanticOrder(edge),
			});
			rows.set(key, row);
		}
		for (const row of rows.values()) {
			const positions = row.map(({ label }) => label.x!).toSorted((one, other) => one - other);
			row.sort((one, other) => one.center - other.center || one.order - other.order);
			for (const [index, { label }] of row.entries()) label.x = positions[index]!;
		}
	}

	/**
	 * Line up the joined cards Graphviz stacked a few points out of one column
	 * (`alignColumns`): a card or reserved label moves inside its frame, or the
	 * drawing, and keeps the routing gap from everything beside it.
	 * @param width The drawing's width.
	 */
	lineUp(width: number): void {
		const boxes = new Map<string, Box>();
		for (const [id, node] of this.nodes) boxes.set(id, readBox(node));
		for (const [name, label] of this.reserved) boxes.set(name, readBox(label));
		const joins = this.edges
			.filter((edge) => this.card(edge.sources[0]!) && this.card(edge.targets[0]!))
			.map((edge) => {
				const ends = [edge.sources[0]!, edge.targets[0]!].toSorted(
					(one, other) => boxes.get(one)!.y - boxes.get(other)!.y,
				);
				return { tail: ends[0]!, head: ends[1]!, label: `label_${edge.id}` };
			});
		alignColumns(boxes, joins, {
			gap: CARD_ROUTING_GAP,
			/**
			 * Where a card or reserved label may move.
			 * @param name The card's id or the label's name.
			 * @returns Its span, or nothing when it stays.
			 */
			within: (name) => this.spanOf(name, width),
		});
		for (const [name, { x }] of boxes) (this.nodes.get(name) ?? this.reserved.get(name))!.x = x;
	}

	/**
	 * Whether a semantic node is a card Graphviz placed: no frame around others.
	 * @param id The node.
	 * @returns True for a card.
	 */
	card(id: string): boolean {
		return this.nodes.has(id) && !this.nodes.get(id)!.children?.length;
	}

	/**
	 * The span a card or reserved label may move in: inside its frame, clear
	 * of the frame's inset, or inside the drawing.
	 * @param name The card's id or the label's name.
	 * @param width The drawing's width.
	 * @returns The span, or nothing for a frame, which stays.
	 */
	spanOf(name: string, width: number): { left: number; right: number } | undefined {
		if (!this.card(name) && !this.reserved.has(name)) return undefined;
		const frame = this.frameOf(name);
		if (frame === undefined) return { left: 0, right: width };
		return { left: frame.x! + CONTAINER_INSET, right: frame.x! + frame.width! - CONTAINER_INSET };
	}

	/**
	 * The frame a card or reserved label stands in.
	 * @param name The card's id or the label's name.
	 * @returns The frame, or nothing when it stands on the drawing itself.
	 */
	frameOf(name: string): ElkNode | undefined {
		const holder = this.labelParents.get(name) ?? this.parents.get(name);
		return holder?.name === undefined
			? undefined
			: this.nodes.get(holder.name.slice("cluster_".length));
	}

	/** Expand each disconnected collection at its globally placed origin. */
	unpack(): void {
		for (const [id, children] of this.packed) {
			const frame = this.nodes.get(id)!;
			for (const child of children)
				Object.assign(child.node, { x: frame.x! + child.x, y: frame.y! + child.y });
		}
	}

	/**
	 * Trim symmetric vendor cluster margins to the measured title and container inset.
	 * @param node The frame to trim before routing begins.
	 */
	tighten(node: ElkNode): void {
		if (!node.children?.length || this.packed.has(node.id)) return;
		const labels = [...this.reserved]
			.filter(([id]) => this.labelParents.get(id)?.name === `cluster_${node.id}`)
			.map(([, label]) => label);
		const size = Number(node.layoutOptions?.["archboard.header.size"] ?? 0);
		const contents = [...node.children, ...labels];
		const inset = {
			x: CONTAINER_INSET,
			// Connected children must leave an open corridor below the buffered title.
			y: size + Math.max(CONTAINER_INSET, CARD_ROUTING_GAP),
			width: this.minimums.get(node.id)!.width,
		};
		const x = Math.min(...contents.map((child) => child.x!)) - inset.x;
		const y = Math.min(...contents.map((child) => child.y!)) - inset.y;
		const right = Math.max(...contents.map((child) => child.x! + child.width!)) + CONTAINER_INSET;
		const bottom = Math.max(...contents.map((child) => child.y! + child.height!)) + CONTAINER_INSET;
		Object.assign(node, {
			x,
			y,
			width: Math.max(right - x, inset.width),
			height: bottom - y,
		});
	}
}

/**
 * Assign equal leaf slots on each fresh row to peers sharing kind and responsibility.
 * Graphviz keeps every row, gap and frame; routing sees the resulting identities.
 * @param parent The peers' direct parent, including the diagram root.
 */
function orderSiblingSlots(parent: ElkNode): void {
	const rows = new Map<string, ElkNode[]>();
	const children = parent.children ?? [];
	children.forEach(orderSiblingSlots);
	children
		.filter((node) => !node.children?.length)
		.forEach((child, index) => {
			const group = child.layoutOptions?.["archboard.order-group"] ?? String(index);
			const key = `${group}:${child.y}:${child.width}:${child.height}`;
			const row = rows.get(key) ?? [];
			row.push(child);
			rows.set(key, row);
		});
	for (const row of rows.values()) {
		const positions = row.map((child) => child.x!).toSorted((one, other) => one - other);
		row.sort((one, other) => semanticOrder(one) - semanticOrder(other));
		for (const [index, child] of row.entries()) child.x = positions[index]!;
	}
}

/**
 * Whether an endpoint belongs to a frame at any containment depth.
 * @param frame The potential ancestor.
 * @param id The semantic endpoint identity.
 * @returns True for one of the frame's descendants.
 */
function contains(frame: ElkNode, id: string): boolean {
	return (frame.children ?? []).some((child) => child.id === id || contains(child, id));
}

/**
 * Convert Graphviz bounds into diagram coordinates.
 * @param value The vendor bounds.
 * @param origin The vendor diagram origin.
 * @returns The complete box in diagram coordinates.
 */
function readBounds(value: string, origin: readonly number[]): Box {
	const box = coordinates(value);
	return {
		x: Math.min(box[0]!, box[2]!) - origin[0]! + PLACEMENT_MARGIN,
		y: Math.min(box[1]!, box[3]!) - origin[1]! + PLACEMENT_MARGIN,
		width: Math.abs(box[2]! - box[0]!),
		height: Math.abs(box[3]! - box[1]!),
	};
}

/**
 * Globally place the containment tree and every relationship across its clusters.
 * @param viz The initialized Graphviz instance.
 * @param input The measured compound hierarchy.
 * @param options Measured row spacing.
 * @returns Global node coordinates and optional reserved label boxes.
 */
export function placeGraph(viz: Viz, input: ElkNode, options: LayoutOptions): ElkNode {
	const placed = new Placement(input, options);
	placed.build();
	const output = outputSchema.parse(viz.renderJSON(placed.graph, { yInvert: true }));
	const bounds = readBounds(output.bb, [0, 0]);
	const origin = [bounds.x - PLACEMENT_MARGIN, bounds.y - PLACEMENT_MARGIN];
	for (const object of output.objects) placed.read(object, origin);
	placed.unpack();
	orderSiblingSlots(placed.result);
	placed.orderLabels();
	placed.lineUp(bounds.width + 2 * PLACEMENT_MARGIN);
	for (const node of [...placed.nodes.values()].toReversed()) placed.tighten(node);
	return {
		...placed.result,
		x: 0,
		y: 0,
		width: bounds.width + 2 * PLACEMENT_MARGIN,
		height: bounds.height + 2 * PLACEMENT_MARGIN,
		edges: placed.edges,
	};
}
