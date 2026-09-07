import type { InspectionFinding, InspectionPolicy } from "@/runtime/board-inspection/schemas";
import { type DecodedRecord } from "@/runtime/board-inspection/lib/decode";
import {
	intersectSegments,
	overlap,
	point,
	pointBox,
	segmentInsideBox,
	type ExactBox,
	type ExactPoint,
	type Segment,
} from "@/runtime/board-inspection/lib/geometry";
import {
	type InspectionModel,
	type InspectionNode,
	type InspectionObstacle,
} from "@/runtime/board-inspection/lib/model";
import type { SweepPartition, SweepWork } from "@/runtime/board-inspection/lib/interval-sweep";
import type { ValidBridgeDecoration } from "@/runtime/board-inspection/bridge";
import { make, uniqueRefs } from "@/runtime/board-inspection/lib/finding-builder";
import {
	type ComparisonCounter,
	type PairItem,
	pairSweep,
	partitioned,
} from "@/runtime/board-inspection/lib/collision-sweep";

/** What every pass needs: where findings go, the budget, the totals, and the run's inputs. */
interface PassContext {
	findings: InspectionFinding[];
	counter: ComparisonCounter;
	sweepWork: SweepWork;
	model: InspectionModel;
	policy: InspectionPolicy;
}

/**
 * The records of the connectors a finding is about, skipping any the board does not hold.
 * @param model the inspection model
 * @param connectorIds the connectors the finding is about
 * @returns their records
 */
function connectorRecords(
	model: InspectionModel,
	connectorIds: readonly string[],
): DecodedRecord[] {
	return connectorIds
		.map((id) => model.byId.get(id))
		.filter((record): record is DecodedRecord => record !== undefined);
}

/**
 * Whether an overlap is one worth reporting, or within the tolerance the run allows two things
 * to touch by.
 * @param hit the overlap, when there is one
 * @param tolerance how far two things may overlap before it counts
 * @returns true when the overlap is real
 */
function realOverlap(hit: ExactBox | null, tolerance: number): hit is ExactBox {
	if (hit === null) {
		return false;
	}
	return hit.width > tolerance && hit.height > tolerance;
}

/**
 * Compare every connector segment against the leaf nodes it is not attached to, reporting the
 * connectors that pass through a node's footprint rather than stopping at it.
 * @param context the pass context
 * @param segmentItems the eligible segments
 * @param leafNodeItems the leaf nodes
 * @param partitions the partition each connector sweeps under
 */
function connectorNodePass(
	context: PassContext,
	segmentItems: readonly PairItem<Segment>[],
	leafNodeItems: readonly PairItem<InspectionNode>[],
	partitions: ReadonlyMap<string, SweepPartition>,
): void {
	pairSweep(
		partitioned(segmentItems, (segment) => partitions.get(segment.connectorId)!),
		leafNodeItems,
		false,
		(segment, node) => {
			const hit = segmentInsideBox(
				segment.a,
				segment.b,
				node.body,
				context.policy.overlapTolerance,
			);
			if (!hit) {
				return;
			}
			context.findings.push(
				make({
					code: "CONNECTOR_PENETRATES_NODE",
					reason: "leaf-footprint-interior",
					severity: "error",
					affectsCoverage: false,
					details: {
						connectorId: segment.connectorId,
						segmentIndex: segment.index,
						nodeId: node.id,
						entry: point(hit.entry),
						exit: point(hit.exit),
					},
					message: `Connector ${segment.connectorId} passes through node ${node.id}.`,
					elements: uniqueRefs(connectorRecords(context.model, [segment.connectorId])),
					nodes: [node.ref],
					points: [hit.entry, hit.exit],
					affected: pointBox([hit.entry, hit.exit]),
				}),
			);
		},
		context.counter,
		context.sweepWork,
		"connector-node",
	);
}

/**
 * Compare every connector segment against the obstacles, reporting the connectors that pass
 * through something the layout is meant to route around.
 * @param context the pass context
 * @param segmentItems the segments
 * @param obstacleItems the obstacles
 */
function connectorObstaclePass(
	context: PassContext,
	segmentItems: readonly PairItem<Segment>[],
	obstacleItems: readonly PairItem<InspectionObstacle>[],
): void {
	pairSweep(
		segmentItems,
		obstacleItems,
		false,
		(segment, obstacle) => {
			const hit = segmentInsideBox(
				segment.a,
				segment.b,
				obstacle.box,
				context.policy.overlapTolerance,
			);
			if (!hit) {
				return;
			}
			context.findings.push(
				make({
					code: "CONNECTOR_PENETRATES_OBSTACLE",
					reason: "obstacle-footprint-interior",
					severity: "error",
					affectsCoverage: false,
					details: {
						connectorId: segment.connectorId,
						segmentIndex: segment.index,
						obstacleId: obstacle.id,
						entry: point(hit.entry),
						exit: point(hit.exit),
					},
					message: `Connector ${segment.connectorId} passes through obstacle ${obstacle.id}.`,
					elements: uniqueRefs([
						...connectorRecords(context.model, [segment.connectorId]),
						...obstacle.members,
					]),
					obstacles: [obstacle.ref],
					points: [hit.entry, hit.exit],
					affected: pointBox([hit.entry, hit.exit]),
				}),
			);
		},
		context.counter,
		context.sweepWork,
		"connector-obstacle",
	);
}

/**
 * Compare every connector segment against the text it is not attached to, reporting the
 * connectors that pass through words a reader has to read.
 * @param context the pass context
 * @param segmentItems the segments
 * @param textItems the text elements
 */
function connectorTextPass(
	context: PassContext,
	segmentItems: readonly PairItem<Segment>[],
	textItems: readonly PairItem<DecodedRecord>[],
): void {
	pairSweep(
		segmentItems,
		textItems,
		false,
		(segment, text) => {
			const textId = text.id ?? "";
			const box = text.box;
			if (box === null) {
				return;
			}
			const hit = segmentInsideBox(segment.a, segment.b, box, context.policy.overlapTolerance);
			if (!hit) {
				return;
			}
			context.findings.push(
				make({
					code: "CONNECTOR_PENETRATES_TEXT",
					reason: "text-interior",
					severity: "error",
					affectsCoverage: false,
					details: {
						connectorId: segment.connectorId,
						segmentIndex: segment.index,
						textId,
						entry: point(hit.entry),
						exit: point(hit.exit),
					},
					message: `Connector ${segment.connectorId} passes through text ${textId}.`,
					elements: uniqueRefs([...connectorRecords(context.model, [segment.connectorId]), text]),
					points: [hit.entry, hit.exit],
					affected: pointBox([hit.entry, hit.exit]),
				}),
			);
		},
		context.counter,
		context.sweepWork,
		"connector-text",
	);
}

/**
 * Whether a crossing is one a bridge decoration already marks, which is how a deliberate
 * hop-over is drawn rather than a crossing nobody accounted for.
 * @param a one segment
 * @param b the other
 * @param crossing where the two cross
 * @param validBridges the bridges the board carries
 * @returns true when a bridge marks this crossing
 */
function bridged(
	a: Segment,
	b: Segment,
	crossing: ExactPoint,
	validBridges: readonly ValidBridgeDecoration[],
): boolean {
	return validBridges.some(({ mask }) => marksCrossing(mask.metadata, a, b, crossing));
}

/**
 * Whether one bridge marks this exact crossing of these two segments, in either direction: the
 * bridge names one segment as passing over and the other as passing under.
 * @param bridge the bridge's metadata
 * @param a one segment
 * @param b the other
 * @param crossing where the two cross
 * @returns true when the bridge marks it
 */
function marksCrossing(
	bridge: ValidBridgeDecoration["mask"]["metadata"],
	a: Segment,
	b: Segment,
	crossing: ExactPoint,
): boolean {
	if (!namesPair(bridge, a, b) && !namesPair(bridge, b, a)) {
		return false;
	}
	return crossing.x === bridge.crossing.x && crossing.y === bridge.crossing.y;
}

/**
 * Whether a bridge names one segment as the one passing over and the other as passing under.
 * @param bridge the bridge's metadata
 * @param over the segment the bridge would have passing over
 * @param under the segment the bridge would have passing under
 * @returns true when the bridge names them that way round
 */
function namesPair(
	bridge: ValidBridgeDecoration["mask"]["metadata"],
	over: Segment,
	under: Segment,
): boolean {
	if (over.connectorId !== bridge.overConnectorId || over.index !== bridge.overSegmentIndex) {
		return false;
	}
	return under.connectorId === bridge.underConnectorId && under.index === bridge.underSegmentIndex;
}

/**
 * The finding for two connectors that cross without a bridge marking it.
 * @param context the pass context
 * @param a one segment
 * @param b the other
 * @param crossing where they cross
 * @returns the finding
 */
function crossingFinding(
	context: PassContext,
	a: Segment,
	b: Segment,
	crossing: ExactPoint,
): InspectionFinding {
	return make({
		code: "CONNECTOR_INTERSECTION_UNMARKED",
		reason: "proper-interior-crossing",
		severity: "error",
		affectsCoverage: false,
		details: {
			firstConnectorId: a.connectorId,
			firstSegmentIndex: a.index,
			secondConnectorId: b.connectorId,
			secondSegmentIndex: b.index,
			point: point(crossing),
		},
		message: `Connectors ${a.connectorId} and ${b.connectorId} cross.`,
		elements: uniqueRefs(connectorRecords(context.model, [a.connectorId, b.connectorId])),
		points: [crossing],
		affected: pointBox([crossing]),
	});
}

/**
 * The finding for two connectors that run along each other, where nothing says which of them a
 * reader is looking at.
 * @param context the pass context
 * @param a one segment
 * @param b the other
 * @param points the stretch they share
 * @returns the finding
 */
function collinearFinding(
	context: PassContext,
	a: Segment,
	b: Segment,
	points: readonly ExactPoint[],
): InspectionFinding {
	return make({
		code: "AMBIGUOUS_GEOMETRY",
		reason: "collinear-overlap",
		severity: "warning",
		affectsCoverage: true,
		details: {
			firstConnectorId: a.connectorId,
			firstSegmentIndex: a.index,
			secondConnectorId: b.connectorId,
			secondSegmentIndex: b.index,
		},
		message: `Connectors ${a.connectorId} and ${b.connectorId} overlap collinearly.`,
		elements: uniqueRefs(connectorRecords(context.model, [a.connectorId, b.connectorId])),
		points,
		affected: pointBox(points),
	});
}

/**
 * Compare every connector segment against every other connector's, reporting unmarked crossings
 * and stretches where two connectors run along each other.
 * @param context the pass context
 * @param segmentItems the segments
 * @param segments the run's segments, for the per-connector partitions
 * @param validBridges the bridges the board carries
 */
function connectorIntersectionPass(
	context: PassContext,
	segmentItems: readonly PairItem<Segment>[],
	segments: readonly Segment[],
	validBridges: readonly ValidBridgeDecoration[],
): void {
	const partitions = new Map<string, SweepPartition>();
	for (const segment of segments) {
		if (!partitions.has(segment.connectorId)) {
			partitions.set(segment.connectorId, {
				partition: segment.connectorId,
				excludedPartitions: new Set([segment.connectorId]),
			});
		}
	}
	/**
	 * The partition one connector's segments sweep under.
	 * @param segment the segment
	 * @returns its connector's partition
	 */
	const byConnector = (segment: Segment): SweepPartition => partitions.get(segment.connectorId)!;
	pairSweep(
		partitioned(segmentItems, byConnector),
		partitioned(segmentItems, byConnector),
		true,
		(a, b) => {
			const hit = intersectSegments(a.a, a.b, b.a, b.b, context.policy.intersectionTolerance);
			if (hit.kind === "proper") {
				if (!bridged(a, b, point(hit.point), validBridges)) {
					context.findings.push(crossingFinding(context, a, b, hit.point));
				}
				return;
			}
			if (hit.kind === "collinear") {
				context.findings.push(collinearFinding(context, a, b, hit.points));
			}
		},
		context.counter,
		context.sweepWork,
		"connector-intersection",
	);
}

/**
 * Compare the leaf nodes against each other, reporting footprints that sit on top of one
 * another. A node is not compared against its own parent, which contains it by design.
 * @param context the pass context
 * @param leafNodeItems the leaf nodes
 * @param leaves the leaf nodes themselves, for their parentage
 */
function nodeOverlapPass(
	context: PassContext,
	leafNodeItems: readonly PairItem<InspectionNode>[],
	leaves: readonly InspectionNode[],
): void {
	const partitions = new Map<string, SweepPartition>();
	for (const node of leaves) {
		const excludedPartitions = new Set<string>();
		if (node.parentId !== null) {
			excludedPartitions.add(node.parentId);
		}
		partitions.set(node.id, { partition: node.id, excludedPartitions });
	}
	/**
	 * The partition one node sweeps under.
	 * @param node the node
	 * @returns its partition
	 */
	const byNode = (node: InspectionNode): SweepPartition => partitions.get(node.id)!;
	pairSweep(
		partitioned(leafNodeItems, byNode),
		partitioned(leafNodeItems, byNode),
		true,
		(a, b) => {
			const hit = overlap(a.body, b.body);
			if (!realOverlap(hit, context.policy.overlapTolerance)) {
				return;
			}
			context.findings.push(
				make({
					code: "NODE_OVERLAP",
					reason: "leaf-footprint-overlap",
					severity: "error",
					affectsCoverage: false,
					details: {
						firstNodeId: a.id,
						secondNodeId: b.id,
						overlapWidth: hit.width,
						overlapHeight: hit.height,
					},
					message: `Nodes ${a.id} and ${b.id} overlap.`,
					nodes: [a.ref, b.ref],
					elements: uniqueRefs([...a.bodies, ...b.bodies]),
					affected: hit,
				}),
			);
		},
		context.counter,
		context.sweepWork,
		"node-overlap",
	);
}

/**
 * Compare the labels against the nodes they do not belong to, reporting labels that sit on a
 * node a reader would then attribute them to.
 * @param context the pass context
 * @param labelItems the labels
 * @param allNodeItems every node, not only the leaves
 * @param labelPartitions the partition each label sweeps under
 */
function labelNodePass(
	context: PassContext,
	labelItems: readonly PairItem<DecodedRecord>[],
	allNodeItems: readonly PairItem<InspectionNode>[],
	labelPartitions: ReadonlyMap<string, SweepPartition>,
): void {
	pairSweep(
		partitioned(labelItems, (label) => labelPartitions.get(label.id ?? "")!),
		allNodeItems,
		false,
		(label, node) => {
			const box = label.box;
			if (box === null) {
				return;
			}
			const hit = overlap(box, node.body);
			if (!realOverlap(hit, context.policy.overlapTolerance)) {
				return;
			}
			context.findings.push(
				make({
					code: "LABEL_OVERLAP",
					reason: "label-node-overlap",
					severity: "error",
					affectsCoverage: false,
					details: {
						labelId: label.id ?? "",
						nodeId: node.id,
						overlapWidth: hit.width,
						overlapHeight: hit.height,
					},
					message: `Label ${label.id} overlaps node ${node.id}.`,
					elements: [label.ref],
					nodes: [node.ref],
					affected: hit,
				}),
			);
		},
		context.counter,
		context.sweepWork,
		"label-node-overlap",
	);
}

/**
 * Compare the confirmed labels against each other, reporting labels that sit on top of one
 * another. Two labels of the same owner are drawn together by design and are not compared.
 * @param context the pass context
 * @param labelLabelItems the confirmed labels
 */
function labelLabelPass(
	context: PassContext,
	labelLabelItems: readonly PairItem<DecodedRecord>[],
): void {
	const partitions = new Map<string, SweepPartition>();
	for (const label of labelLabelItems) {
		const owner = context.model.confirmedLabels.get(label.id) ?? label.id;
		if (!partitions.has(owner)) {
			partitions.set(owner, { partition: owner, excludedPartitions: new Set([owner]) });
		}
	}
	/**
	 * The partition one label sweeps under, which is its owner's.
	 * @param label the label
	 * @returns its owner's partition
	 */
	const byOwner = (label: DecodedRecord): SweepPartition => {
		const owner = context.model.confirmedLabels.get(label.id ?? "") ?? label.id ?? "";
		return partitions.get(owner)!;
	};
	pairSweep(
		partitioned(labelLabelItems, byOwner),
		partitioned(labelLabelItems, byOwner),
		true,
		(a, b) => {
			if (a.box === null || b.box === null) {
				return;
			}
			const hit = overlap(a.box, b.box);
			if (!realOverlap(hit, context.policy.overlapTolerance)) {
				return;
			}
			context.findings.push(
				make({
					code: "LABEL_OVERLAP",
					reason: "label-label-overlap",
					severity: "error",
					affectsCoverage: false,
					details: {
						firstLabelId: a.id ?? "",
						secondLabelId: b.id ?? "",
						overlapWidth: hit.width,
						overlapHeight: hit.height,
					},
					message: `Labels ${a.id} and ${b.id} overlap.`,
					elements: [a.ref, b.ref],
					affected: hit,
				}),
			);
		},
		context.counter,
		context.sweepWork,
		"label-label-overlap",
	);
}

export {
	type PassContext,
	connectorIntersectionPass,
	connectorNodePass,
	connectorObstaclePass,
	connectorTextPass,
	labelLabelPass,
	labelNodePass,
	nodeOverlapPass,
};
