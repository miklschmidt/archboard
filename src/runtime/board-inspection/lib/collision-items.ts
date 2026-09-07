import { type DecodedRecord } from "@/runtime/board-inspection/lib/decode";
import { pointBox, type Segment } from "@/runtime/board-inspection/lib/geometry";
import {
	type InspectionModel,
	type InspectionNode,
	type InspectionObstacle,
} from "@/runtime/board-inspection/lib/model";
import {
	buildSweepHierarchy,
	type SweepHierarchy,
	type SweepPartition,
} from "@/runtime/board-inspection/lib/interval-sweep";
import {
	NO_EXCLUSIONS,
	type PairItem,
	unrestrictedPartition,
} from "@/runtime/board-inspection/lib/collision-sweep";

/** What a connector's two ends were found to attach to, when nothing could be resolved. */
const NO_ENDPOINTS = {
	nodeAnalysisEligible: false,
	startElement: undefined,
	endElement: undefined,
	startNode: undefined,
	endNode: undefined,
} as const;

/** What a connector's two ends attach to. */
type ConnectorEndpoints =
	InspectionModel["connectorEndpoints"] extends ReadonlyMap<string, infer Ends> ? Ends : never;

/**
 * The connectors that attach to each thing, so a label sitting on one of them can be excluded
 * from being reported against its own connector.
 * @param model the inspection model
 * @param key which of the endpoint fields to index by
 * @returns the connectors by the thing they attach to
 */
function connectorsByEndpoint(
	model: InspectionModel,
	key: "element" | "node",
): Map<string, Set<string>> {
	const index = new Map<string, Set<string>>();
	for (const [connectorId, ends] of model.connectorEndpoints) {
		remember(index, key === "element" ? ends.startElement : ends.startNode, connectorId);
		remember(index, key === "element" ? ends.endElement : ends.endNode, connectorId);
	}
	return index;
}

/**
 * Note that one connector attaches to one thing.
 * @param index the connectors by the thing they attach to, added to in place
 * @param target the thing, when the end resolved to one
 * @param connectorId the connector
 */
function remember(
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

/**
 * The connector segments as sweep items, each standing for one drawn stretch of one connector.
 * @param segments the run's segments
 * @param model the inspection model
 * @returns the items
 */
function segmentItemsOf(segments: readonly Segment[], model: InspectionModel): PairItem<Segment>[] {
	return segments.map((segment) => {
		const record = model.byId.get(segment.connectorId);
		return {
			id: `${segment.connectorId}:${segment.index}`,
			box: pointBox([segment.a, segment.b])!,
			value: segment,
			records: record ? [record] : [],
			semantics: unrestrictedPartition(segment.connectorId),
		};
	});
}

/**
 * One node as a sweep item, standing for its own footprint.
 * @param node the node
 * @returns the item
 */
function nodeItem(node: InspectionNode): PairItem<InspectionNode> {
	return {
		id: node.id,
		box: node.body,
		value: node,
		records: node.bodies,
		semantics: unrestrictedPartition(node.id),
	};
}

/**
 * The obstacles as sweep items.
 * @param model the inspection model
 * @returns the items
 */
function obstacleItemsOf(model: InspectionModel): PairItem<InspectionObstacle>[] {
	return model.obstacles.map((obstacle) => ({
		id: obstacle.id,
		box: obstacle.box,
		value: obstacle,
		records: obstacle.members,
		semantics: unrestrictedPartition(obstacle.id),
	}));
}

/**
 * Whether a text record is one a connector can be said to pass through: it must be live, have
 * a usable identity, have a box with real extent, and carry no rotation the sweep cannot model.
 * @param record the record
 * @returns true when the text takes part in the sweep
 */
function sweepableText(record: DecodedRecord): boolean {
	if (!identifiedText(record) || !hasExtent(record)) {
		return false;
	}
	const angle = record.raw?.angle;
	return angle === undefined || angle === 0;
}

/**
 * Whether a record is a live text element with an identity nothing else claims.
 * @param record the record
 * @returns true when it is such a text element
 */
function identifiedText(record: DecodedRecord): boolean {
	if (!record.live || !record.usableId) {
		return false;
	}
	return record.id !== null && record.type === "text";
}

/**
 * Whether a record's box has real extent, which is what makes it something a connector can be
 * said to pass through.
 * @param record the record
 * @returns true when the box has width and height
 */
function hasExtent(record: DecodedRecord): boolean {
	const box = record.box;
	if (box === null) {
		return false;
	}
	return box.width > 0 && box.height > 0;
}

/**
 * The connectors a text element must not be reported against: the ones attached to it, to the
 * element that owns it, and to the node it belongs to. A connector reaching its own label is
 * how a bound label is drawn, not a collision.
 * @param textId the text's identity
 * @param model the inspection model
 * @param byElement the connectors attached to each element
 * @param byNode the connectors attached to each node
 * @returns the connectors to exclude
 */
function excludedConnectorsFor(
	textId: string,
	model: InspectionModel,
	byElement: ReadonlyMap<string, ReadonlySet<string>>,
	byNode: ReadonlyMap<string, ReadonlySet<string>>,
): Set<string> {
	const excluded = new Set<string>();
	const ownerId = model.confirmedLabels.get(textId);
	if (ownerId !== undefined && model.connectorEndpoints.has(ownerId)) {
		excluded.add(ownerId);
	}
	addAll(excluded, byElement.get(textId));
	if (ownerId !== undefined) {
		addAll(excluded, byElement.get(ownerId));
	}
	const textNode = model.nodeOfElement.get(textId);
	if (textNode !== undefined) {
		addAll(excluded, byNode.get(textNode));
	}
	return excluded;
}

/**
 * Add every connector of a set to the exclusions.
 * @param excluded the exclusions, added to in place
 * @param connectors the connectors to exclude, when there are any
 */
function addAll(excluded: Set<string>, connectors: ReadonlySet<string> | undefined): void {
	for (const connectorId of connectors ?? []) {
		excluded.add(connectorId);
	}
}

/**
 * The text elements as sweep items, each excluding the connectors that legitimately reach it.
 * @param records the decoded records
 * @param model the inspection model
 * @returns the text records that take part and their items
 */
function textItemsOf(
	records: readonly DecodedRecord[],
	model: InspectionModel,
): { textRecords: DecodedRecord[]; textItems: PairItem<DecodedRecord>[] } {
	const byElement = connectorsByEndpoint(model, "element");
	const byNode = connectorsByEndpoint(model, "node");
	const textRecords = records.filter((record) => sweepableText(record));
	const textItems = textRecords.flatMap((text) => {
		const box = text.box;
		const textId = text.id ?? "";
		if (box === null) {
			return [];
		}
		return [
			{
				id: textId,
				box,
				value: text,
				records: [text],
				semantics: {
					partition: `text:${textId}`,
					excludedPartitions: excludedConnectorsFor(textId, model, byElement, byNode),
				},
			},
		];
	});
	return { textRecords, textItems };
}

/**
 * The nodes each connector's ends attach to, or a resolved-nothing when the connector's
 * endpoints could not be read.
 * @param model the inspection model
 * @param connectorId the connector
 * @returns what its ends attach to
 */
function connectorEndsOf(model: InspectionModel, connectorId: string): ConnectorEndpoints {
	return model.connectorEndpoints.get(connectorId) ?? NO_ENDPOINTS;
}

/**
 * The partition each connector sweeps under against the node tree: it is compared against
 * every node except the ancestors of the nodes its own ends attach to, since a connector
 * reaching into its own node's ancestry is how it attaches at all.
 * @param segments the run's segments
 * @param model the inspection model
 * @param hierarchy the node hierarchy the sweep excludes ancestors through
 * @returns the partitions by connector
 */
function connectorNodePartitionsOf(
	segments: readonly Segment[],
	model: InspectionModel,
	hierarchy: SweepHierarchy,
): Map<string, SweepPartition> {
	const partitions = new Map<string, SweepPartition>();
	for (const segment of segments) {
		if (partitions.has(segment.connectorId)) {
			continue;
		}
		const ends = connectorEndsOf(model, segment.connectorId);
		if (!ends.nodeAnalysisEligible) {
			continue;
		}
		const ancestorTargets = [ends.startNode, ends.endNode].filter(
			(node): node is string => node !== undefined,
		);
		partitions.set(segment.connectorId, {
			partition: `connector:${segment.connectorId}`,
			excludedPartitions: NO_EXCLUSIONS,
			ancestorTargets,
			hierarchy,
		});
	}
	return partitions;
}

/**
 * The hierarchy the sweep excludes ancestors through, built from the model's node parentage.
 * @param model the inspection model
 * @returns the hierarchy
 */
function sweepHierarchyOf(model: InspectionModel): SweepHierarchy {
	const parents = new Map<string, string | null>();
	for (const node of model.nodes.values()) {
		parents.set(node.id, node.parentId);
	}
	return buildSweepHierarchy(parents);
}

/**
 * Whether a text record is a label the run compares against nodes: one the model has given an
 * ownership state that is neither absent nor blocked.
 * @param record the record
 * @param model the inspection model
 * @returns true when the record is such a label
 */
function comparableLabel(record: DecodedRecord, model: InspectionModel): boolean {
	if (!record.live || record.id === null) {
		return false;
	}
	if (record.type !== "text" || record.box === null) {
		return false;
	}
	return ownedLabelState(model, record.id);
}

/** The ownership states that mean nothing has claimed a label. */
const UNOWNED_LABEL_STATES = new Set(["none", "blocked"]);

/**
 * Whether the model has given a label an ownership state that puts it on the board as a label.
 * @param model the inspection model
 * @param labelId the label's identity
 * @returns true when the label is owned
 */
function ownedLabelState(model: InspectionModel, labelId: string): boolean {
	const state = model.labelOwnership.get(labelId)?.state;
	if (state === undefined) {
		return false;
	}
	return !UNOWNED_LABEL_STATES.has(state);
}

/**
 * The labels as sweep items, each excluding the nodes its candidate owners belong to, since a
 * label sitting on the node that owns it is how a bound label is drawn.
 * @param records the decoded records
 * @param model the inspection model
 * @param hierarchy the node hierarchy the sweep excludes ancestors through
 * @returns the label records, their items, and their partitions
 */
function labelItemsOf(
	records: readonly DecodedRecord[],
	model: InspectionModel,
	hierarchy: SweepHierarchy,
): {
	labelRecords: DecodedRecord[];
	labelItems: PairItem<DecodedRecord>[];
	labelPartitions: Map<string, SweepPartition>;
} {
	const labelRecords = records.filter((record) => comparableLabel(record, model));
	const labelItems = labelRecords.flatMap((label) => {
		const box = label.box;
		if (box === null) {
			return [];
		}
		return [
			{
				id: label.id ?? "",
				box,
				value: label,
				records: [label],
				semantics: unrestrictedPartition(label.id ?? ""),
			},
		];
	});
	const labelPartitions = new Map<string, SweepPartition>();
	for (const label of labelRecords) {
		const labelId = label.id ?? "";
		const ownerIds = model.labelOwnership.get(labelId)?.candidateOwnerIds ?? [];
		const candidateNodes = ownerIds
			.map((owner) => model.nodeOfElement.get(owner))
			.filter((node): node is string => node !== undefined);
		labelPartitions.set(labelId, {
			partition: `label:${labelId}`,
			excludedPartitions: NO_EXCLUSIONS,
			ancestorTargets: candidateNodes,
			hierarchy,
		});
	}
	return { labelRecords, labelItems, labelPartitions };
}

export {
	connectorEndsOf,
	connectorNodePartitionsOf,
	labelItemsOf,
	nodeItem,
	obstacleItemsOf,
	segmentItemsOf,
	sweepHierarchyOf,
	textItemsOf,
};
