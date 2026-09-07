import type { DecodedRecord } from "@/runtime/board-inspection/lib/decode";
import {
	classifyBindingTarget,
	classifyBoundElements,
	orderedIdentities,
	type BoundElementsClassification,
	type ConnectorEndpointClassification,
	type InspectionModel,
	type LabelOwnershipClassification,
} from "@/runtime/board-inspection/lib/inspection-model";
import { assignNodeHierarchy, buildNodes } from "@/runtime/board-inspection/lib/node-hierarchy";
import {
	buildObstacles,
	findContainerOnlyIds,
} from "@/runtime/board-inspection/lib/obstacle-components";

export {
	type InspectionNode,
	type InspectionObstacle,
	type AggregateCoordinateFailure,
	type BlockingBindingIssue,
	type BindingTargetClassification,
	type ConnectorEndpointClassification,
	type LabelOwnershipClassification,
	type BoundElementIssue,
	type BoundElementsClassification,
	type InspectionModel,
	KNOWN_ELEMENT_TYPES,
	classifyBoundElements,
	classifyBindingTarget,
	boundElementTargetCompatible,
	archboardMetadata,
	isPlainRecord,
	nodeId,
	groupIds,
	libraryAttribution,
} from "@/runtime/board-inspection/lib/inspection-model";

/** Text labels each container names in its boundElements, and the labels whose reverse side cannot be read. */
interface ReverseLabelOwners {
	readonly ownersByLabel: ReadonlyMap<string, ReadonlySet<string>>;
	readonly blockedLabels: ReadonlySet<string>;
}

/**
 * Record one container's text references from its boundElements.
 * @param owner the container record
 * @param byId live records by usable id
 * @param owners the accumulating owners per label, updated in place
 * @param blocked the accumulating blocked labels, updated in place
 */
function recordReverseOwner(
	owner: DecodedRecord,
	byId: ReadonlyMap<string, DecodedRecord>,
	owners: Map<string, Set<string>>,
	blocked: Set<string>,
): void {
	if (!owner.id || owner.raw?.boundElements == null) {
		return;
	}
	const bounds = classifyBoundElements(owner.raw.boundElements);
	const hasProblems = bounds.problems.length > 0;
	for (const reference of bounds.readableEntries) {
		if (isTextReference(reference, byId)) {
			recordLabelOwner(owner, reference.id, hasProblems, owners, blocked);
		}
	}
}

/** One boundElements entry that read cleanly. */
type ReadableBoundEntry = BoundElementsClassification["readableEntries"][number];

/**
 * Whether a boundElements entry names a text element that is present among the live records.
 * @param reference the readable boundElements entry
 * @param byId live records by usable id
 * @returns true when the entry names a live text element
 */
function isTextReference(
	reference: ReadableBoundEntry,
	byId: ReadonlyMap<string, DecodedRecord>,
): boolean {
	return reference.type === "text" && byId.get(reference.id)?.type === "text";
}

/**
 * Record that one container names a text label, blocking the label instead when the container
 * cannot be identified or its boundElements did not read cleanly.
 * @param owner the container record
 * @param labelId the label it names
 * @param hasProblems whether the container's boundElements had unreadable entries
 * @param owners the accumulating owners per label, updated in place
 * @param blocked the accumulating blocked labels, updated in place
 */
function recordLabelOwner(
	owner: DecodedRecord,
	labelId: string,
	hasProblems: boolean,
	owners: Map<string, Set<string>>,
	blocked: Set<string>,
): void {
	if (!owner.usableId || !owner.id) {
		blocked.add(labelId);
		return;
	}
	const labelOwners = owners.get(labelId) ?? new Set<string>();
	labelOwners.add(owner.id);
	owners.set(labelId, labelOwners);
	if (hasProblems) {
		blocked.add(labelId);
	}
}

/**
 * Collect which containers name each text label in their boundElements.
 * @param live the live decoded records
 * @param byId live records by usable id
 * @returns owners per label and the labels whose reverse side is blocked
 */
function reverseLabelOwners(
	live: readonly DecodedRecord[],
	byId: ReadonlyMap<string, DecodedRecord>,
): ReverseLabelOwners {
	const ownersByLabel = new Map<string, Set<string>>();
	const blockedLabels = new Set<string>();
	for (const owner of live) {
		recordReverseOwner(owner, byId, ownersByLabel, blockedLabels);
	}
	return { ownersByLabel, blockedLabels };
}

/**
 * Whether a label's ownership cannot be classified: an unreadable or duplicate container id, or a blocked reverse side.
 * @param labelId the label id
 * @param rawContainer the label's raw containerId
 * @param reverse the reverse owners collected from containers
 * @param duplicateIds ids shared by more than one live record
 * @returns true when classification is blocked
 */
function ownershipBlocked(
	labelId: string,
	rawContainer: unknown,
	reverse: ReverseLabelOwners,
	duplicateIds: ReadonlySet<string>,
): boolean {
	if (isUnreadableContainerId(rawContainer) || reverse.blockedLabels.has(labelId)) {
		return true;
	}
	return typeof rawContainer === "string" && duplicateIds.has(rawContainer);
}

/**
 * Whether a label's containerId is present but not a readable identity.
 * @param rawContainer the label's raw containerId
 * @returns true when the forward side cannot be read
 */
function isUnreadableContainerId(rawContainer: unknown): boolean {
	if (rawContainer === undefined || rawContainer === null) {
		return false;
	}
	return typeof rawContainer !== "string" || rawContainer.length === 0;
}

/**
 * Resolve the ownership state from the forward and reverse sides.
 * @param blocked whether classification is blocked
 * @param forwardOwnerId the container the label names, or null
 * @param reverseOwnerIds the containers naming the label, in identity order
 * @returns the state and the owner it resolves to, if any
 */
function ownershipState(
	blocked: boolean,
	forwardOwnerId: string | null,
	reverseOwnerIds: readonly string[],
): Pick<LabelOwnershipClassification, "state" | "resolvedOwnerId"> {
	if (blocked) {
		return { state: "blocked", resolvedOwnerId: null };
	}
	if (forwardOwnerId === null) {
		return reverseOnlyState(reverseOwnerIds);
	}
	return forwardState(forwardOwnerId, reverseOwnerIds);
}

/**
 * The state of a label no container is named by, judged only on which containers name it.
 * @param reverseOwnerIds the containers naming the label, in identity order
 * @returns the state and the owner it resolves to, if any
 */
function reverseOnlyState(
	reverseOwnerIds: readonly string[],
): Pick<LabelOwnershipClassification, "state" | "resolvedOwnerId"> {
	if (reverseOwnerIds.length === 1) {
		return { state: "reverse-only", resolvedOwnerId: reverseOwnerIds[0]! };
	}
	if (reverseOwnerIds.length > 1) {
		return { state: "conflicting", resolvedOwnerId: null };
	}
	return { state: "none", resolvedOwnerId: null };
}

/**
 * The state of a label that names a container, judged on whether that container agrees.
 * @param forwardOwnerId the container the label names
 * @param reverseOwnerIds the containers naming the label, in identity order
 * @returns the state and the owner it resolves to, if any
 */
function forwardState(
	forwardOwnerId: string,
	reverseOwnerIds: readonly string[],
): Pick<LabelOwnershipClassification, "state" | "resolvedOwnerId"> {
	if (reverseOwnerIds.length === 0) {
		return { state: "forward-only", resolvedOwnerId: forwardOwnerId };
	}
	if (reverseOwnerIds.length === 1 && reverseOwnerIds[0] === forwardOwnerId) {
		return { state: "matching", resolvedOwnerId: forwardOwnerId };
	}
	return { state: "conflicting", resolvedOwnerId: null };
}

/**
 * Classify one text label's ownership from both sides.
 * @param record the text record with a usable id
 * @param labelId the label id
 * @param reverse the reverse owners collected from containers
 * @param duplicateIds ids shared by more than one live record
 * @returns the label's ownership classification
 */
function classifyLabelOwnership(
	record: DecodedRecord,
	labelId: string,
	reverse: ReverseLabelOwners,
	duplicateIds: ReadonlySet<string>,
): LabelOwnershipClassification {
	const rawContainer = record.raw?.containerId;
	const blocked = ownershipBlocked(labelId, rawContainer, reverse, duplicateIds);
	const forwardOwnerId =
		typeof rawContainer === "string" && rawContainer.length > 0 ? rawContainer : null;
	const reverseOwnerIds = orderedIdentities([...(reverse.ownersByLabel.get(labelId) ?? [])]);
	const candidateOwnerIds = orderedIdentities([
		...new Set([...(forwardOwnerId ? [forwardOwnerId] : []), ...reverseOwnerIds]),
	]);
	return {
		labelId,
		forwardOwnerId,
		reverseOwnerIds,
		candidateOwnerIds,
		...ownershipState(blocked, forwardOwnerId, reverseOwnerIds),
	};
}

/**
 * Classify every text label's ownership and confirm the labels with one resolved container.
 * @param live the live decoded records
 * @param byId live records by usable id
 * @param duplicateIds ids shared by more than one live record
 * @returns ownership per label and container per confirmed label
 */
function buildLabelClassifications(
	live: readonly DecodedRecord[],
	byId: ReadonlyMap<string, DecodedRecord>,
	duplicateIds: ReadonlySet<string>,
): Pick<InspectionModel, "labelOwnership" | "confirmedLabels"> {
	const reverse = reverseLabelOwners(live, byId);
	const labelOwnership = new Map<string, LabelOwnershipClassification>();
	const confirmedLabels = new Map<string, string>();
	for (const record of live) {
		const labelId = classifiableLabelId(record);
		if (labelId === null) {
			continue;
		}
		const classification = classifyLabelOwnership(record, labelId, reverse, duplicateIds);
		labelOwnership.set(labelId, classification);
		const owner = confirmedOwnerId(classification, labelId, byId);
		if (owner !== null) {
			confirmedLabels.set(labelId, owner);
		}
	}
	return { labelOwnership, confirmedLabels };
}

interface EndpointFacts {
	readonly blocked: boolean;
	readonly element: string | undefined;
	readonly node: string | undefined;
}

/**
 * Classify one binding end of a connector.
 * @param value the raw binding value
 * @param nodeOfElement the node of each member element
 * @param duplicateIds ids shared by more than one live record
 * @returns whether node analysis is blocked, and the target element and node
 */
function endpointFacts(
	value: unknown,
	nodeOfElement: ReadonlyMap<string, string>,
	duplicateIds: ReadonlySet<string>,
): EndpointFacts {
	if (value == null) {
		return { blocked: false, element: undefined, node: undefined };
	}
	const target = classifyBindingTarget(value);
	const targetId = target.readableTargetId;
	return {
		blocked: target.blockingIssue !== null || (targetId !== null && duplicateIds.has(targetId)),
		element: targetId ?? undefined,
		node: targetId ? nodeOfElement.get(targetId) : undefined,
	};
}

/**
 * Classify both endpoints of every usable connector.
 * @param live the live decoded records
 * @param nodeOfElement the node of each member element
 * @param duplicateIds ids shared by more than one live record
 * @returns endpoint classification per connector id
 */
function buildConnectorEndpoints(
	live: readonly DecodedRecord[],
	nodeOfElement: ReadonlyMap<string, string>,
	duplicateIds: ReadonlySet<string>,
): Map<string, ConnectorEndpointClassification> {
	const connectorEndpoints = new Map<string, ConnectorEndpointClassification>();
	for (const record of live) {
		if (!isUsableConnector(record)) {
			continue;
		}
		const start = endpointFacts(record.raw?.startBinding, nodeOfElement, duplicateIds);
		const end = endpointFacts(record.raw?.endBinding, nodeOfElement, duplicateIds);
		connectorEndpoints.set(record.id!, {
			nodeAnalysisEligible: !start.blocked && !end.blocked,
			startElement: start.element,
			endElement: end.element,
			startNode: start.node,
			endNode: end.node,
		});
	}
	return connectorEndpoints;
}

/**
 * The id of a text record that can be classified: one identity, readable, and unique.
 * @param record the live record
 * @returns the label id, or null when the record is not a classifiable label
 */
function classifiableLabelId(record: DecodedRecord): string | null {
	if (record.type !== "text" || !record.usableId || !record.id) {
		return null;
	}
	return record.id;
}

/**
 * The container a label is confirmed to belong to: one resolved owner that is not the label
 * itself and is present among the live records.
 * @param classification the label's ownership classification
 * @param labelId the label id
 * @param byId live records by usable id
 * @returns the container id, or null when nothing is confirmed
 */
function confirmedOwnerId(
	classification: LabelOwnershipClassification,
	labelId: string,
	byId: ReadonlyMap<string, DecodedRecord>,
): string | null {
	const { resolvedOwnerId } = classification;
	if (resolvedOwnerId === null || resolvedOwnerId === labelId || !byId.has(resolvedOwnerId)) {
		return null;
	}
	return resolvedOwnerId;
}

/**
 * Whether a record is a connector whose identity can carry an endpoint classification.
 * @param record the live record
 * @returns true for a uniquely identified arrow or line
 */
function isUsableConnector(record: DecodedRecord): boolean {
	if (!record.usableId || !record.id) {
		return false;
	}
	return record.type === "arrow" || record.type === "line";
}

/**
 * Whether a record names an identity that more than one live record claims.
 * @param record the live record
 * @returns true when the identity is duplicated
 */
function isDuplicateIdentity(record: DecodedRecord): boolean {
	return Boolean(record.id) && !record.usableId;
}

/**
 * Whether a record names an identity nothing else claims.
 * @param record the live record
 * @returns true when the identity can index the record
 */
function isUsableIdentity(record: DecodedRecord): boolean {
	return record.usableId && record.id !== null;
}

/**
 * The parent of one node, if it has one the model knows.
 * @param model the inspection model
 * @param nodeId the node to look up
 * @returns the parent node id, or null
 */
function parentOf(model: InspectionModel, nodeId: string): string | null {
	return model.nodes.get(nodeId)?.parentId ?? null;
}

/**
 * Index live records by usable id and collect the ids that are duplicated.
 * @param live the live decoded records
 * @returns records by usable id and the duplicate id set
 */
function indexLiveRecords(live: readonly DecodedRecord[]): {
	byId: Map<string, DecodedRecord>;
	duplicateIds: Set<string>;
} {
	const byId = new Map<string, DecodedRecord>();
	const duplicateIds = new Set<string>();
	for (const record of live) {
		if (isDuplicateIdentity(record)) {
			duplicateIds.add(record.id!);
		}
	}
	for (const record of live) {
		if (isUsableIdentity(record)) {
			byId.set(record.id!, record);
		}
	}
	return { byId, duplicateIds };
}

/**
 * Build the semantic model detectors read: identities, labels, nodes, connectors and obstacles.
 * @param records the decoded records
 * @returns the inspection model
 */
function buildInspectionModel(records: readonly DecodedRecord[]): InspectionModel {
	const live = records.filter((record) => record.live && record.raw !== null);
	const { byId, duplicateIds } = indexLiveRecords(live);
	const { labelOwnership, confirmedLabels } = buildLabelClassifications(live, byId, duplicateIds);
	const nodeBuild = buildNodes(live, byId, confirmedLabels);
	const hierarchyWork = assignNodeHierarchy(nodeBuild.nodes);
	const connectorEndpoints = buildConnectorEndpoints(live, nodeBuild.nodeOfElement, duplicateIds);
	const containerOnly = findContainerOnlyIds(live, nodeBuild.nodes, nodeBuild.nodeOfElement);
	const obstacleBuild = buildObstacles(
		live,
		nodeBuild.nodeOfElement,
		confirmedLabels,
		containerOnly.ids,
	);
	return {
		byId,
		duplicateIds,
		nodes: nodeBuild.nodes,
		nodeOfElement: nodeBuild.nodeOfElement,
		confirmedLabels,
		labelOwnership,
		connectorEndpoints,
		containerOnlyIds: containerOnly.ids,
		qualifyingGroupedObstacleElementIds: obstacleBuild.qualifyingGroupedObstacleElementIds,
		obstacles: obstacleBuild.obstacles,
		aggregateFailures: [...nodeBuild.aggregateFailures, ...obstacleBuild.aggregateFailures],
		hierarchyWork,
		containerBoundaryWork: containerOnly.work,
	};
}

/**
 * Every ancestor node of a starting node, nearest first, stopping at cycles.
 * @param model the inspection model
 * @param startingNodeId the node to start from, if any
 * @returns the ancestor node ids
 */
function semanticParents(model: InspectionModel, startingNodeId: string | undefined): Set<string> {
	const found = new Set<string>();
	let current = startingNodeId === undefined ? null : parentOf(model, startingNodeId);
	while (current !== null && !found.has(current)) {
		found.add(current);
		current = parentOf(model, current);
	}
	return found;
}

export { buildInspectionModel, semanticParents };
