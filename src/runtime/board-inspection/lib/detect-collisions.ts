import type { InspectionPolicy } from "@/runtime/board-inspection/schemas";
import { type DecodedRecord } from "@/runtime/board-inspection/lib/decode";
import {
	aggregateBoxes,
	intersectSegments,
	overlap,
	point,
	pointBox,
	segmentInsideBox,
	type ExactBox,
	type Segment,
} from "@/runtime/board-inspection/lib/geometry";
import {
	type InspectionModel,
	type InspectionNode,
	type InspectionObstacle,
} from "@/runtime/board-inspection/lib/model";
import {
	buildSweepHierarchy,
	sweepIntervalPairs,
	type SweepPartition,
	type SweepWork,
} from "@/runtime/board-inspection/lib/interval-sweep";
import type { ValidBridgeDecoration } from "@/runtime/board-inspection/bridge";
import {
	BROAD_PHASE_COMPARISON_LIMIT,
	emptySweepWork,
	make,
	uniqueRefs,
	type CollisionPass,
	type CollisionResult,
} from "@/runtime/board-inspection/lib/finding-builder";

interface PairItem<T> {
	id: string;
	box: ExactBox;
	value: T;
	records: readonly DecodedRecord[];
	semantics: SweepPartition;
}

interface ComparisonCounter {
	value: number;
	limited: boolean;
	pass: CollisionPass | null;
	comparisonLimit: number;
}

const partitioned = <T>(
	items: readonly PairItem<T>[],
	semantics: (value: T) => SweepPartition,
): PairItem<T>[] => items.map((item) => ({ ...item, semantics: semantics(item.value) }));

const NO_EXCLUSIONS: ReadonlySet<string> = new Set<string>();

const unrestrictedPartition = (partition: string): SweepPartition => ({
	partition,
	excludedPartitions: NO_EXCLUSIONS,
});

function pairSweep<A, B>(
	left: readonly PairItem<A>[],
	right: readonly PairItem<B>[],
	sameSet: boolean,
	visit: (a: A, b: B) => void,
	counter: ComparisonCounter,
	work: SweepWork,
	pass: CollisionPass,
): void {
	const materialize = <T>(items: readonly PairItem<T>[]) => {
		return items.map((item) => ({
			id: item.id,
			min: item.box.x,
			max: item.box.x + item.box.width,
			value: item,
			semantics: item.semantics,
		})) satisfies Array<{
			id: string;
			min: number;
			max: number;
			value: PairItem<T>;
			semantics: SweepPartition;
		}>;
	};
	const leftIntervals = materialize(left);
	const rightIntervals = materialize(right);
	const measured = emptySweepWork();
	sweepIntervalPairs(
		leftIntervals,
		rightIntervals,
		sameSet,
		(aInterval, bInterval) => {
			const a = aInterval.value;
			const b = bInterval.value;
			counter.value += 1;
			if (counter.value > counter.comparisonLimit) {
				counter.limited = true;
				counter.pass = pass;
				return false;
			}
			if (b.box.y > a.box.y + a.box.height || b.box.y + b.box.height < a.box.y) {
				return true;
			}
			visit(a.value, b.value);
			return true;
		},
		{ work: measured },
	);
	mergeSweepWork(work, measured);
}

function mergeSweepWork(work: SweepWork, measured: SweepWork): void {
	work.events += measured.events;
	work.activeVisits += measured.activeVisits;
	work.expiryPops += measured.expiryPops;
	work.bucketScans += measured.bucketScans;
	work.exactQuerySteps += measured.exactQuerySteps;
	work.hierarchyNodeVisits += measured.hierarchyNodeVisits;
	work.peakActiveBuckets = Math.max(work.peakActiveBuckets, measured.peakActiveBuckets);
	work.peakActiveProfiles = Math.max(work.peakActiveProfiles, measured.peakActiveProfiles);
	work.peakIndexNodes = Math.max(work.peakIndexNodes, measured.peakIndexNodes);
	work.peakSelections = Math.max(work.peakSelections, measured.peakSelections);
}

function rememberConnectorRelationship(
	index: Map<string, Set<string>>,
	target: string | undefined,
	connectorId: string,
): void {
	if (target === undefined) {
		return;
	}
	const connectors = index.get(target) ?? new Set<string>();
	connectors.add(connectorId);
	index.set(target, connectors);
}

function collisionFindings(
	records: readonly DecodedRecord[],
	model: InspectionModel,
	segments: readonly Segment[],
	policy: InspectionPolicy,
	result: CollisionResult,
	validBridges: readonly ValidBridgeDecoration[],
	comparisonLimit: number,
): CollisionResult {
	const findings = result.findings;
	const counter: ComparisonCounter = {
		value: 0,
		limited: false,
		pass: null,
		comparisonLimit,
	};
	const sweepWork = result.sweepWork;
	const byId = model.byId;
	const segmentItems = segments.map((segment) => {
		const record = byId.get(segment.connectorId);
		return {
			id: `${segment.connectorId}:${segment.index}`,
			box: pointBox([segment.a, segment.b])!,
			value: segment,
			records: record ? [record] : [],
			semantics: unrestrictedPartition(segment.connectorId),
		};
	});
	const nodeValues = [...model.nodes.values()];
	const leaves = nodeValues.filter((node) => node.children.length === 0);
	const leafNodeItems = leaves.map((node) => ({
		id: node.id,
		box: node.body,
		value: node,
		records: node.bodies,
		semantics: unrestrictedPartition(node.id),
	}));
	let allNodeItems: PairItem<InspectionNode>[] = [];
	let obstacleItems: PairItem<InspectionObstacle>[] = [];
	const endpointConnectorsByElement = new Map<string, Set<string>>();
	const endpointConnectorsByNode = new Map<string, Set<string>>();
	for (const [connectorId, ends] of model.connectorEndpoints) {
		rememberConnectorRelationship(endpointConnectorsByElement, ends.startElement, connectorId);
		rememberConnectorRelationship(endpointConnectorsByElement, ends.endElement, connectorId);
		rememberConnectorRelationship(endpointConnectorsByNode, ends.startNode, connectorId);
		rememberConnectorRelationship(endpointConnectorsByNode, ends.endNode, connectorId);
	}
	const textRecords = records.filter((record) => {
		const angle = record.raw?.angle;
		return (
			record.live &&
			record.usableId &&
			Boolean(record.id) &&
			record.type === "text" &&
			Boolean(record.box && record.box.width > 0 && record.box.height > 0) &&
			(angle === undefined || angle === 0)
		);
	});
	const textItems = textRecords.map((text) => {
		const textId = text.id!;
		const ownerId = model.confirmedLabels.get(textId);
		const textNode = model.nodeOfElement.get(textId);
		const excludedConnectors = new Set<string>();
		const exclude = (connectors: ReadonlySet<string> | undefined) => {
			if (connectors) {
				for (const connectorId of connectors) {
					excludedConnectors.add(connectorId);
				}
			}
		};
		if (ownerId && model.connectorEndpoints.has(ownerId)) {
			excludedConnectors.add(ownerId);
		}
		exclude(endpointConnectorsByElement.get(textId));
		if (ownerId) {
			exclude(endpointConnectorsByElement.get(ownerId));
		}
		if (textNode) {
			exclude(endpointConnectorsByNode.get(textNode));
		}
		return {
			id: textId,
			box: text.box!,
			value: text,
			records: [text],
			semantics: { partition: `text:${textId}`, excludedPartitions: excludedConnectors },
		};
	});
	let labelNodeRecords: DecodedRecord[] = [];
	let labelNodeItems: PairItem<DecodedRecord>[] = [];
	let labelLabelItems: PairItem<DecodedRecord>[] = [];
	const connectorEnds = (segment: Segment) => {
		return (
			model.connectorEndpoints.get(segment.connectorId) ?? {
				nodeAnalysisEligible: false,
				startElement: undefined,
				endElement: undefined,
				startNode: undefined,
				endNode: undefined,
			}
		);
	};
	const hierarchyParents = new Map<string, string | null>();
	for (const node of model.nodes.values()) {
		hierarchyParents.set(node.id, node.parentId);
	}
	const sweepHierarchy = buildSweepHierarchy(hierarchyParents);
	const connectorNodePartitions = new Map<string, SweepPartition>();
	for (const segment of segments) {
		if (connectorNodePartitions.has(segment.connectorId)) {
			continue;
		}
		const ends = connectorEnds(segment);
		if (!ends.nodeAnalysisEligible) {
			continue;
		}
		const ancestorTargets: string[] = [];
		if (ends.startNode !== undefined) {
			ancestorTargets.push(ends.startNode);
		}
		if (ends.endNode !== undefined) {
			ancestorTargets.push(ends.endNode);
		}
		connectorNodePartitions.set(segment.connectorId, {
			partition: `connector:${segment.connectorId}`,
			excludedPartitions: NO_EXCLUSIONS,
			ancestorTargets,
			hierarchy: sweepHierarchy,
		});
	}
	const labelNodePartitions = new Map<string, SweepPartition>();
	const nodeEligibleSegmentItems = segmentItems.filter(
		(item) => connectorEnds(item.value).nodeAnalysisEligible,
	);
	pairSweep(
		partitioned(nodeEligibleSegmentItems, (segment) =>
			connectorNodePartitions.get(segment.connectorId)!,
		),
		leafNodeItems,
		false,
		(segment, node) => {
			const hit = segmentInsideBox(segment.a, segment.b, node.body, policy.overlapTolerance);
			if (!hit) {
				return;
			}
			findings.push(
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
					elements: uniqueRefs([byId.get(segment.connectorId)!].filter(Boolean)),
					nodes: [node.ref],
					points: [hit.entry, hit.exit],
					affected: pointBox([hit.entry, hit.exit]),
				}),
			);
		},
		counter,
		sweepWork,
		"connector-node",
	);
	if (!counter.limited) {
		obstacleItems = model.obstacles.map((obstacle) => ({
			id: obstacle.id,
			box: obstacle.box,
			value: obstacle,
			records: obstacle.members,
			semantics: unrestrictedPartition(obstacle.id),
		}));
		pairSweep(
			segmentItems,
			obstacleItems,
			false,
			(segment, obstacle) => {
				const hit = segmentInsideBox(segment.a, segment.b, obstacle.box, policy.overlapTolerance);
				if (!hit) {
					return;
				}
				findings.push(
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
						elements: uniqueRefs(
							[byId.get(segment.connectorId)!, ...obstacle.members].filter(Boolean),
						),
						obstacles: [obstacle.ref],
						points: [hit.entry, hit.exit],
						affected: pointBox([hit.entry, hit.exit]),
					}),
				);
			},
			counter,
			sweepWork,
			"connector-obstacle",
		);
	}
	if (!counter.limited) {
		pairSweep(
			segmentItems,
			textItems,
			false,
			(segment, text) => {
				const textId = text.id!;
				const hit = segmentInsideBox(segment.a, segment.b, text.box!, policy.overlapTolerance);
				if (!hit) {
					return;
				}
				findings.push(
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
						elements: uniqueRefs([byId.get(segment.connectorId)!, text].filter(Boolean)),
						points: [hit.entry, hit.exit],
						affected: pointBox([hit.entry, hit.exit]),
					}),
				);
			},
			counter,
			sweepWork,
			"connector-text",
		);
	}
	if (!counter.limited) {
		const partitions = new Map<string, SweepPartition>();
		for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
			const segment = segments[segmentIndex]!;
			if (!partitions.has(segment.connectorId)) {
				partitions.set(segment.connectorId, {
					partition: segment.connectorId,
					excludedPartitions: new Set([segment.connectorId]),
				});
			}
		}
		pairSweep(
			partitioned(segmentItems, (segment) => partitions.get(segment.connectorId)!),
			partitioned(segmentItems, (segment) => partitions.get(segment.connectorId)!),
			true,
			(a, b) => {
				const hit = intersectSegments(a.a, a.b, b.a, b.b, policy.intersectionTolerance);
				const suppressed =
					hit.kind === "proper" &&
					validBridges.some(({ mask }) => {
						const bridge = mask.metadata;
						const direct =
							a.connectorId === bridge.overConnectorId &&
							a.index === bridge.overSegmentIndex &&
							b.connectorId === bridge.underConnectorId &&
							b.index === bridge.underSegmentIndex;
						const reverse =
							b.connectorId === bridge.overConnectorId &&
							b.index === bridge.overSegmentIndex &&
							a.connectorId === bridge.underConnectorId &&
							a.index === bridge.underSegmentIndex;
						const canonical = point(hit.point);
						return (
							(direct || reverse) &&
							canonical.x === bridge.crossing.x &&
							canonical.y === bridge.crossing.y
						);
					});
				if (hit.kind === "proper" && !suppressed) {
					findings.push(
						make({
							code: "CONNECTOR_INTERSECTION_UNMARKED",
							reason: "proper-interior-crossing",
							severity: "error",
							affectsCoverage: false,
							details: {
								firstConnectorId: a.connectorId,
								firstSegmentIndex: a.index,
								secondConnectorId: b.connectorId,
								secondSegmentIndex: b.index,
								point: point(hit.point),
							},
							message: `Connectors ${a.connectorId} and ${b.connectorId} cross.`,
							elements: uniqueRefs(
								[byId.get(a.connectorId)!, byId.get(b.connectorId)!].filter(Boolean),
							),
							points: [hit.point],
							affected: pointBox([hit.point]),
						}),
					);
				} else if (hit.kind === "collinear") {
					findings.push(
						make({
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
							elements: uniqueRefs(
								[byId.get(a.connectorId)!, byId.get(b.connectorId)!].filter(Boolean),
							),
							points: hit.points,
							affected: pointBox(hit.points),
						}),
					);
				}
			},
			counter,
			sweepWork,
			"connector-intersection",
		);
	}
	if (!counter.limited) {
		const partitions = new Map<string, SweepPartition>();
		for (let nodeIndex = 0; nodeIndex < leaves.length; nodeIndex += 1) {
			const node = leaves[nodeIndex]!;
			const excludedPartitions = new Set<string>();
			if (node.parentId) {
				excludedPartitions.add(node.parentId);
			}
			partitions.set(node.id, { partition: node.id, excludedPartitions });
		}
		pairSweep(
			partitioned(leafNodeItems, (node) => partitions.get(node.id)!),
			partitioned(leafNodeItems, (node) => partitions.get(node.id)!),
			true,
			(a, b) => {
				const hit = overlap(a.body, b.body);
				if (!hit || hit.width <= policy.overlapTolerance || hit.height <= policy.overlapTolerance) {
					return;
				}
				findings.push(
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
			counter,
			sweepWork,
			"node-overlap",
		);
	}
	if (!counter.limited) {
		allNodeItems = nodeValues.map((node) => ({
			id: node.id,
			box: node.body,
			value: node,
			records: node.bodies,
			semantics: unrestrictedPartition(node.id),
		}));
		labelNodeRecords = records.filter((record) => {
			if (!record.live || !record.id || record.type !== "text" || !record.box) {
				return false;
			}
			const state = model.labelOwnership.get(record.id)?.state;
			return state !== undefined && state !== "none" && state !== "blocked";
		});
		labelNodeItems = labelNodeRecords.map((label) => ({
			id: label.id!,
			box: label.box!,
			value: label,
			records: [label],
			semantics: unrestrictedPartition(label.id!),
		}));
		labelLabelItems = labelNodeItems.filter((item) => model.confirmedLabels.has(item.id));
		for (let labelIndex = 0; labelIndex < labelNodeRecords.length; labelIndex += 1) {
			const label = labelNodeRecords[labelIndex]!;
			const ownership = model.labelOwnership.get(label.id!);
			const candidateNodes: string[] = [];
			const ownerIds = ownership?.candidateOwnerIds ?? [];
			for (let ownerIndex = 0; ownerIndex < ownerIds.length; ownerIndex += 1) {
				const owner = ownerIds[ownerIndex]!;
				const candidate = model.nodeOfElement.get(owner);
				if (candidate !== undefined) {
					candidateNodes.push(candidate);
				}
			}
			labelNodePartitions.set(label.id!, {
				partition: `label:${label.id!}`,
				excludedPartitions: NO_EXCLUSIONS,
				ancestorTargets: candidateNodes,
				hierarchy: sweepHierarchy,
			});
		}
		pairSweep(
			partitioned(labelNodeItems, (label) => labelNodePartitions.get(label.id!)!),
			allNodeItems,
			false,
			(label, node) => {
				const hit = overlap(label.box!, node.body);
				if (!hit || hit.width <= policy.overlapTolerance || hit.height <= policy.overlapTolerance) {
					return;
				}
				findings.push(
					make({
						code: "LABEL_OVERLAP",
						reason: "label-node-overlap",
						severity: "error",
						affectsCoverage: false,
						details: {
							labelId: label.id!,
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
			counter,
			sweepWork,
			"label-node-overlap",
		);
	}
	if (!counter.limited) {
		const partitions = new Map<string, SweepPartition>();
		for (let labelIndex = 0; labelIndex < labelLabelItems.length; labelIndex += 1) {
			const label = labelLabelItems[labelIndex]!;
			const owner = model.confirmedLabels.get(label.id)!;
			if (!partitions.has(owner)) {
				partitions.set(owner, {
					partition: owner,
					excludedPartitions: new Set([owner]),
				});
			}
		}
		pairSweep(
			partitioned(labelLabelItems, (label) => {
				const owner = model.confirmedLabels.get(label.id!)!;
				return partitions.get(owner)!;
			}),
			partitioned(labelLabelItems, (label) => {
				const owner = model.confirmedLabels.get(label.id!)!;
				return partitions.get(owner)!;
			}),
			true,
			(a, b) => {
				const hit = overlap(a.box!, b.box!);
				if (!hit || hit.width <= policy.overlapTolerance || hit.height <= policy.overlapTolerance) {
					return;
				}
				findings.push(
					make({
						code: "LABEL_OVERLAP",
						reason: "label-label-overlap",
						severity: "error",
						affectsCoverage: false,
						details: {
							firstLabelId: a.id!,
							secondLabelId: b.id!,
							overlapWidth: hit.width,
							overlapHeight: hit.height,
						},
						message: `Labels ${a.id} and ${b.id} overlap.`,
						elements: [a.ref, b.ref],
						affected: hit,
					}),
				);
			},
			counter,
			sweepWork,
			"label-label-overlap",
		);
	}
	if (counter.limited) {
		const allBoxes = [
			...segmentItems,
			...allNodeItems,
			...obstacleItems,
			...textItems,
			...labelNodeItems,
		].map((item) => item.box);
		const aggregate = aggregateBoxes(allBoxes);
		findings.push(
			make({
				code: "INSPECTION_LIMIT_EXCEEDED",
				reason: "broad-phase-comparison-ceiling",
				severity: "warning",
				affectsCoverage: true,
				details: {
					limit: BROAD_PHASE_COMPARISON_LIMIT,
					attempted: 2_000_001,
					pass: counter.pass!,
					segmentCount: segments.length,
					nodeCount: leaves.length,
					obstacleCount: model.obstacles.length,
					labelCount: labelNodeRecords.length,
					textCount: textRecords.length,
				},
				message: `Inspection stopped pair analysis at comparison ${counter.value}.`,
				elements: uniqueRefs(
					[
						...segmentItems,
						...allNodeItems,
						...obstacleItems,
						...textItems,
						...labelNodeItems,
					].flatMap((item) => item.records),
				),
				affected:
					aggregate.kind === "representable"
						? aggregate.box
						: aggregate.kind === "unrepresentable"
							? aggregate.representative
							: null,
			}),
		);
	}
	return {
		findings,
		broadPhaseComparisons: counter.value,
		sweepWork,
		terminalLimit: counter.limited ? "comparison" : null,
	};
}

export { collisionFindings };
