import {
	piecesOf,
	clearIntervals,
	candidatesOf,
	reachOf,
	type RoutePiece,
	type Candidate,
	type Interval,
	type Obstacles,
} from "@/transformers/semantic-renderer/lib/layout/label-run-geometry";
import { BEND_RADIUS } from "@/transformers/semantic-renderer/config";
import { ANCHOR_CARD_CLEARANCE } from "@/transformers/semantic-renderer/lib/layout/routing-clearance";
import { packChannels } from "@/transformers/semantic-renderer/lib/layout/label-channels";
import { projectionCoordinates } from "@/transformers/semantic-renderer/lib/layout/label-projections";
// Measured badges use clear runs in the layout owner. A missing fit requests
// an engine reservation before the one complete drawing can be returned.
import type {
	ArchitectureDrawing,
	DrawingEdge,
	MeasuredArchitecture,
} from "@/transformers/semantic-renderer/lib/drawing";
import { DIAGRAM_MARGIN } from "@/transformers/semantic-renderer/lib/design";
import { inflate, type Box, type Point } from "@/transformers/semantic-renderer/lib/geometry";
import { pointAt } from "@/transformers/semantic-renderer/lib/layout/curves";
import { COMPOUND_OPTIONS } from "@/transformers/semantic-renderer/lib/layout/compound-graph";

/**
 * The authored relationship order also determines label placement priority.
 * @param one First relationship.
 * @param other Second relationship.
 * @returns Their authored order.
 */
function byOrder(one: DrawingEdge, other: DrawingEdge): number {
	return one.edge.order - other.edge.order;
}

/** A native label waypoint and the straight-run orientation it preserves. */
export interface LabelAnchor extends Box {
	readonly axis?: "x" | "y";
	readonly pinAlign?: boolean;
}

/**
 * Keep badges within the engine's existing page and its quiet outside margin.
 * @param box The current or proposed label box.
 * @param drawing The unchanged engine extent.
 * @returns Whether this box can move without shifting or growing the canvas.
 */
function insidePage(box: Box, drawing: ArchitectureDrawing): boolean {
	return (
		box.x >= DIAGRAM_MARGIN &&
		box.y >= DIAGRAM_MARGIN &&
		box.x + box.width <= drawing.width - DIAGRAM_MARGIN &&
		box.y + box.height <= drawing.height - DIAGRAM_MARGIN
	);
}

/**
 * Protect card bodies and frame ink while leaving each frame's interior usable.
 * @param drawing The engine's cards and measured container headings.
 * @returns Obstacles before the common label-to-node clearance is added.
 */
function nodeObstacles(drawing: ArchitectureDrawing): Box[] {
	return [
		...drawing.cards.map(({ box }) => box),
		...drawing.containers.flatMap(({ box, measured }) => [
			{ ...box, height: measured.headerHeight },
			{ ...box, width: 0 },
			{ ...box, x: box.x + box.width, width: 0 },
			{ ...box, y: box.y + box.height, height: 0 },
		]),
	];
}

/**
 * Recognize an existing single vertical native channel.
 * @param edge Current relationship.
 * @returns Whether its endpoints share one vertical run.
 */
function verticalChannel(edge: DrawingEdge): boolean {
	return edge.curve.segments.length === 1 && edge.curve.from.x === pointAt(edge.curve, 1).x;
}

/** One placement pass shares inflated obstacles and accepted label boxes. */
class LabelPlacement {
	private readonly pieces: RoutePiece[];
	private readonly labels: Map<string, LabelAnchor>;
	private readonly original: ReadonlyMap<string, Box>;
	private readonly accepted = new Set<string>();
	private readonly bounds = new Map<string, Interval>();
	private readonly nodeAir = Number(COMPOUND_OPTIONS["elk.spacing.labelNode"]);
	private readonly labelAir = Number(COMPOUND_OPTIONS["elk.spacing.labelLabel"]);
	private readonly grownCards: Box[];
	private readonly grownPieces: Box[];
	private readonly grownLabels: Map<string, Box>;

	/**
	 * Prepare the unchanged drawing and its measured obstacles.
	 * @param drawing Current native routes and available reservations.
	 * @param measured Measured semantic labels.
	 * @param eligible When present, propose waypoints only for these relationships.
	 */
	constructor(
		private readonly drawing: ArchitectureDrawing,
		private readonly measured: MeasuredArchitecture["labels"],
		private readonly eligible?: ReadonlySet<string>,
	) {
		this.pieces = piecesOf(drawing.edges);
		this.labels = new Map(
			drawing.edges.flatMap(({ edge, label }) =>
				label === undefined ? [] : [[edge.id, label.box] as const],
			),
		);
		this.original = new Map(this.labels);
		this.grownCards = nodeObstacles(drawing).map((box) =>
			inflate(
				box,
				this.eligible !== undefined && box.width > 0 && box.height > 0
					? Math.max(this.nodeAir, ANCHOR_CARD_CLEARANCE)
					: this.nodeAir,
			),
		);
		const routeAir = Number(COMPOUND_OPTIONS["elk.spacing.edgeLabel"]);
		this.grownPieces = this.pieces.map(({ box }) => inflate(box, routeAir));
		this.grownLabels = new Map(
			[...this.labels].map(([id, box]) => [id, inflate(box, this.labelAir)]),
		);
	}

	/** Place eligible labels in stable semantic order. */
	place(): void {
		for (const edge of this.drawing.edges.toSorted(byOrder)) this.placeEdge(edge);
		if (this.eligible === undefined) return;
		packChannels(this.drawing, this.labels, this.accepted, this.original, this.bounds);
		if (this.invalid()) this.alignRows();
	}

	/** Retry only small channel corrections when moving whole label rows conflicted. */
	alignRows(): void {
		this.reset();
		for (const edge of this.drawing.edges.toSorted(byOrder)) {
			if (!this.allows(edge)) continue;
			const candidate = this.channelCandidate(edge);
			if (candidate) this.accept(edge, candidate);
		}
		if (this.invalid()) this.reset();
	}

	/** Propose one collision-free joint pin/label adjustment per detouring ordinary relationship. */
	projectChannels(): void {
		for (const edge of this.drawing.edges.toSorted(byOrder)) this.projectEdge(edge);
		packChannels(this.drawing, this.labels, this.accepted, this.original, this.bounds);
		if (
			this.invalid() ||
			[...this.accepted].some((id) => !this.clearProjection(id, this.labels.get(id)!))
		)
			this.reset();
	}

	/**
	 * Select one clear native waypoint candidate for a detouring relationship.
	 * @param edge Current native relationship.
	 */
	private projectEdge(edge: DrawingEdge): void {
		if (!this.allows(edge) || edge.curve.segments.filter((s) => s.kind === "cubic").length < 2)
			return;
		const original = this.original.get(edge.edge.id);
		if (original === undefined) return;
		const box = projectionCoordinates(this.drawing, edge, original)
			.map((center) => ({ ...original, x: center - original.width / 2 }))
			.find((candidate) => this.clearProjection(edge.edge.id, candidate));
		if (box === undefined) return;
		if (!this.boundProjection(edge, box)) return;
		this.accepted.add(edge.edge.id);
		this.labels.set(edge.edge.id, { ...box, axis: "y", pinAlign: true });
		this.grownLabels.set(edge.edge.id, inflate(box, this.labelAir));
	}

	/**
	 * Mark only channels that can become straight between both endpoint spans as movable.
	 * @param edge Relationship whose endpoints may align.
	 * @param box Proposed waypoint.
	 * @returns Whether the waypoint has a usable movement interval.
	 */
	private boundProjection(edge: DrawingEdge, box: Box): boolean {
		const ends = this.drawing.cards.filter(({ measured }) =>
			[edge.edge.from, edge.edge.to].includes(measured.node.id),
		);
		const center = box.x + box.width / 2;
		if (
			ends.length !== 2 ||
			ends.some(({ box: card }) => center < card.x || center > card.x + card.width)
		)
			return true;
		return this.boundChannel(edge, box, true);
	}

	/**
	 * Retain foreign route, card and page clearance while jointly packing eligible labels.
	 * @param id Relationship whose own route may cross its label.
	 * @param box Proposed waypoint.
	 * @returns Whether the fixed obstacles permit the waypoint.
	 */
	private clearProjection(id: string, box: Box): boolean {
		const otherLabels = [...this.grownLabels]
			.filter(([other]) => id !== other && !this.eligible?.has(other))
			.map(([, b]) => b);
		const otherRuns = this.grownPieces.filter((_, index) => this.pieces[index]!.edgeId !== id);
		return (
			insidePage(box, this.drawing) &&
			![...this.grownCards, ...otherLabels, ...otherRuns].some((other) => overlaps(box, other))
		);
	}

	/**
	 * Natural labels and waypoints use their own runs; only eligible reservations may move.
	 * @param edge Current native route.
	 * @returns Whether this pass may move its label.
	 */
	private allows(edge: DrawingEdge): boolean {
		return this.eligible === undefined || this.eligible.has(edge.edge.id);
	}

	/**
	 * Select a clear label box without changing any native route.
	 * @param edge One relationship and its solved curve.
	 */
	private placeEdge(edge: DrawingEdge): void {
		const measured = this.measured.get(edge.edge.id);
		if (measured === undefined || !this.allows(edge)) return;
		const size = { x: 0, y: 0, width: measured.width, height: measured.height };
		const chosen = this.candidates(edge, size).toSorted(
			(one, other) =>
				one.reach - other.reach || other.length - one.length || one.index - other.index,
		)[0];
		const selected =
			chosen ?? (this.eligible === undefined ? undefined : this.channelCandidate(edge));
		if (selected) this.accept(edge, selected);
	}

	/**
	 * Retain the run orientation with an accepted physical waypoint.
	 * @param edge Native relationship.
	 * @param chosen Feasible badge placement on its own route.
	 */
	private accept(edge: DrawingEdge, chosen: Candidate): void {
		if (!this.boundChannel(edge, chosen.box)) return;
		this.accepted.add(edge.edge.id);
		this.labels.set(
			edge.edge.id,
			this.eligible === undefined
				? chosen.box
				: { ...chosen.box, axis: chosen.axis, pinAlign: edge.curve.segments.length === 1 },
		);
		this.grownLabels.set(edge.edge.id, inflate(chosen.box, this.labelAir));
	}

	/** Restore the entire reservation set after a conflicting proposal. */
	private reset(): void {
		this.labels.clear();
		this.grownLabels.clear();
		this.accepted.clear();
		this.bounds.clear();
		for (const [id, box] of this.original) {
			this.labels.set(id, box);
			this.grownLabels.set(id, inflate(box, this.labelAir));
		}
	}
	/**
	 * Remove an unroundable sideways step by aligning the existing row to its own channel.
	 * Larger established detours retain their original reservation; this is bounded
	 * by the space two fixed-radius bends require, not another placement search.
	 * @param edge Native relationship whose reserved row remains fixed.
	 * @returns Nearest clear channel correction, when one fits.
	 */
	private channelCandidate(edge: DrawingEdge): Candidate | undefined {
		const original = this.original.get(edge.edge.id);
		if (!original) return undefined;
		const ends = [edge.curve.from, pointAt(edge.curve, 1)] as const;
		const others = [...this.grownLabels]
			.filter(([id]) => id !== edge.edge.id)
			.map(([, box]) => box);
		return this.pieces
			.filter((p) => p.edgeId === edge.edge.id && p.axis === "y")
			.map((piece) => {
				const box = { ...original, x: piece.box.x - original.width / 2 };
				return {
					axis: "y" as const,
					box,
					index: piece.index,
					length: piece.box.height,
					reach: reachOf(box, ends),
				};
			})
			.filter(
				(c) =>
					Math.abs(c.box.x - original.x) > 0.000001 &&
					Math.abs(c.box.x - original.x) < 2 * BEND_RADIUS &&
					insidePage(c.box, this.drawing) &&
					![...this.grownCards, ...others].some((box) => overlaps(c.box, box)),
			)
			.toSorted(
				(a, b) =>
					Math.abs(a.box.x - original.x) - Math.abs(b.box.x - original.x) || a.index - b.index,
			)[0];
	}

	/**
	 * Reuse the same obstacle-free horizontal interval when balancing adjacent channels.
	 * @param edge Relationship whose straight channel may shift.
	 * @param box Proposed badge on that channel.
	 * @param projected Whether a joint projection can create a straight channel.
	 * @returns Whether its original connected free interval exists.
	 */
	private boundChannel(edge: DrawingEdge, box: Box, projected = false): boolean {
		if (this.eligible === undefined) return true;
		if (!projected && !verticalChannel(edge)) return true;
		const intervals = clearIntervals(
			[[DIAGRAM_MARGIN, this.drawing.width - DIAGRAM_MARGIN - box.width]],
			{ groups: [this.grownCards], pieces: [], ownPiece: -1 },
			box,
			"x",
			box.y,
		);
		const interval = intervals.find(([low, high]) => box.x >= low && box.x <= high);
		if (interval === undefined) return false;
		this.bounds.set(edge.edge.id, [interval[0] + box.width / 2, interval[1] + box.width / 2]);
		return true;
	}

	/**
	 * Find clear intervals on this relationship's own runs.
	 * @param edge Native route and semantic identity.
	 * @param size Measured badge size.
	 * @returns Candidate boxes ordered later by endpoint proximity.
	 */
	private candidates(edge: DrawingEdge, size: Box): Candidate[] {
		const ends: readonly [Point, Point] = [edge.curve.from, pointAt(edge.curve, 1)];
		const found: Candidate[] = [];
		const obstacles = this.obstacles(edge.edge.id);
		for (const [index, piece] of this.pieces.entries()) {
			if (piece.edgeId !== edge.edge.id) continue;
			const ownPiece = obstacles.pieces.indexOf(this.grownPieces[index]!);
			for (const candidate of candidatesOf(
				piece,
				size,
				{ ...obstacles, ownPiece },
				ends,
				this.nodeAir,
				this.eligible !== undefined,
			)) {
				if (insidePage(candidate.box, this.drawing)) found.push(candidate);
			}
		}
		return found;
	}

	/**
	 * Native waypoints preserve the same clear foreign runs as natural badges.
	 * @param id Relationship whose own label and run are excluded.
	 * @returns Shared obstacle groups for this relationship.
	 */
	private obstacles(id: string): Omit<Obstacles, "ownPiece"> {
		const natural = this.eligible === undefined;
		const pieces = this.grownPieces;
		const labels = natural
			? [...this.grownLabels].filter(([other]) => other !== id).map(([, box]) => box)
			: [];
		return { groups: [this.grownCards, labels, pieces], pieces };
	}

	/**
	 * Reject the complete proposal if an accepted anchor enters a reserved clearance.
	 * @returns Whether any proposed anchor violates the unchanged obstacle set.
	 */
	private invalid(): boolean {
		const labels = [...this.labels];
		return labels.some(
			([id, box]) =>
				this.accepted.has(id) &&
				(this.grownCards.some((other) => overlaps(box, other)) ||
					labels.some(
						([otherId, other]) => otherId !== id && overlaps(box, inflate(other, this.labelAir)),
					)),
		);
	}

	/**
	 * Publish label placement without changing solved geometry.
	 * @returns Drawing with natural labels and preserved fallbacks.
	 */
	drawn(): ArchitectureDrawing {
		return {
			...this.drawing,
			edges: this.drawing.edges.map((edge) => {
				const box = this.labels.get(edge.edge.id);
				const measured = this.measured.get(edge.edge.id);
				return box === undefined || measured === undefined
					? edge
					: { ...edge, label: { measured, box } };
			}),
		};
	}

	/**
	 * Return only proposals that passed complete reservation-set validation.
	 * @returns Accepted native waypoint boxes, with rejected proposals absent.
	 */
	anchors(): ReadonlyMap<string, LabelAnchor> {
		return new Map([...this.accepted].map((id) => [id, this.labels.get(id)!]));
	}
}

/**
 * Test meaningful overlap while tolerating floating-point addition at an exact clearance.
 * @param one First box.
 * @param two Second box, already inflated by the declared clearance.
 * @returns Whether the interiors overlap beyond numerical noise.
 */
function overlaps(one: Box, two: Box): boolean {
	return (
		one.x < two.x + two.width - 0.000001 &&
		one.x + one.width > two.x + 0.000001 &&
		one.y < two.y + two.height - 0.000001 &&
		one.y + one.height > two.y + 0.000001
	);
}

/**
 * Place measured labels on clear runs near their endpoints, preserving reserved fallbacks.
 * @param drawing Solved cards and routes.
 * @param measured Measured semantic labels.
 * @returns Complete drawing with every naturally fitting label placed.
 */
function placeLabelsOnRuns(
	drawing: ArchitectureDrawing,
	measured: MeasuredArchitecture["labels"],
): ArchitectureDrawing {
	const placement = new LabelPlacement(drawing, measured);
	placement.place();
	return placement.drawn();
}

/**
 * Propose clear waypoints along existing straight routes before accepting off-route reservations.
 * @param drawing Native routes with all reserved label boxes retained.
 * @param measured Measured semantic labels.
 * @param eligible Relationships now requiring a waypoint.
 * @returns An atomic set of feasible anchors, or no changes when the proposal is invalid.
 */
function anchorLabelsOnRuns(
	drawing: ArchitectureDrawing,
	measured: MeasuredArchitecture["labels"],
	eligible: ReadonlySet<string>,
): ReadonlyMap<string, LabelAnchor> {
	const placement = new LabelPlacement(drawing, measured, eligible);
	placement.place();
	return placement.anchors();
}

/**
 * Correct only unroundable channel offsets while retaining existing label rows.
 * @param drawing Native routes with their current reserved boxes.
 * @param measured Measured semantic labels.
 * @param eligible Forced labels whose final routes lack bend clearance.
 * @returns One atomic set of small physical channel corrections.
 */
function alignLabelRows(
	drawing: ArchitectureDrawing,
	measured: MeasuredArchitecture["labels"],
	eligible: ReadonlySet<string>,
): ReadonlyMap<string, LabelAnchor> {
	const placement = new LabelPlacement(drawing, measured, eligible);
	placement.alignRows();
	return placement.anchors();
}

/**
 * Suggest one atomic set of joint channel adjustments for a complete reroute.
 * @param drawing Current native geometry.
 * @param measured Measured semantic labels.
 * @param eligible Forced reservations that may move together.
 * @returns Collision-validated native waypoint proposals.
 */
function projectLabelChannels(
	drawing: ArchitectureDrawing,
	measured: MeasuredArchitecture["labels"],
	eligible: ReadonlySet<string>,
): ReadonlyMap<string, LabelAnchor> {
	const placement = new LabelPlacement(drawing, measured, eligible);
	placement.projectChannels();
	return placement.anchors();
}

export { placeLabelsOnRuns, anchorLabelsOnRuns, alignLabelRows, projectLabelChannels };
