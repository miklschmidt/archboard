import type { NodeRef, ObstacleRef } from "../schemas.js";
import type { DecodedRecord } from "./decode.js";
import { aggregateBoxes, contains, type ExactBox } from "./geometry.js";
import { sweepIntervalPairs, type SweepWork } from "./interval-sweep.js";
import {
	comparePreprocessingIdentity,
	encodePreprocessingObstacleIdentity,
	PreprocessingOperations,
	stablePreprocessingSort,
	type PreprocessingBudget,
} from "./preprocessing-budget.js";

export interface InspectionNode {
	id: string;
	members: DecodedRecord[];
	bodies: DecodedRecord[];
	labels: DecodedRecord[];
	aggregate: ExactBox | null;
	body: ExactBox;
	boundaries: DecodedRecord[];
	parentId: string | null;
	children: string[];
	ref: NodeRef;
}

export interface InspectionObstacle {
	id: string;
	kind: "library-component" | "grouped-component";
	members: DecodedRecord[];
	box: ExactBox;
	ref: ObstacleRef;
}

export interface AggregateCoordinateFailure {
	scope: "semantic-node-body" | "semantic-node-aggregate" | "obstacle-component";
	subjectId: string;
	members: DecodedRecord[];
}

export type BlockingBindingIssue =
	| "not-object"
	| "array"
	| "missing-element-id"
	| "empty-element-id"
	| "non-string-element-id";

export interface BindingTargetClassification {
	readableTargetId: string | null;
	blockingIssue: BlockingBindingIssue | null;
}

export interface ConnectorEndpointClassification {
	nodeAnalysisEligible: boolean;
	startNode: string | undefined;
	endNode: string | undefined;
}

export interface LabelOwnershipClassification {
	labelId: string;
	forwardOwnerId: string | null;
	reverseOwnerIds: string[];
	candidateOwnerIds: string[];
	resolvedOwnerId: string | null;
	state: "none" | "forward-only" | "reverse-only" | "matching" | "conflicting" | "blocked";
}

export type BoundElementIssue =
	| "not-array"
	| "entry-not-object"
	| "missing-id"
	| "empty-id"
	| "non-string-id"
	| "missing-type"
	| "invalid-type";

export interface BoundElementsClassification {
	readableEntries: Array<{ id: string; type: "text" | "arrow" }>;
	problems: Array<{ issue: BoundElementIssue; entryIndex: number | null }>;
}

export interface InspectionModel {
	byId: Map<string, DecodedRecord>;
	duplicateIds: Set<string>;
	nodes: Map<string, InspectionNode>;
	nodeOfElement: Map<string, string>;
	confirmedLabels: Map<string, string>;
	labelOwnership: Map<string, LabelOwnershipClassification>;
	connectorEndpoints: Map<string, ConnectorEndpointClassification>;
	containerOnlyIds: Set<string>;
	qualifyingGroupedObstacleElementIds: Set<string>;
	obstacles: InspectionObstacle[];
	aggregateFailures: AggregateCoordinateFailure[];
	hierarchyWork: SweepWork;
	containerBoundaryWork: SweepWork;
}

const CLOSED = new Set(["rectangle", "ellipse", "diamond", "frame"]);
const OBSTACLE_BODY = new Set(["rectangle", "ellipse", "diamond"]);

type ModelPass = "node-hierarchy" | "container-boundary";

function chargeIdentity(
	budget: PreprocessingBudget,
	pass: ModelPass,
	value: string | null | undefined,
): void {
	if (value) budget.charge(pass, "prepare-events", value.length);
}

function orderedIdentities(
	values: readonly string[],
	budget: PreprocessingBudget,
	pass: ModelPass,
): string[] {
	return stablePreprocessingSort(values, budget, pass, "order-events", (left, right) =>
		comparePreprocessingIdentity(budget, pass, "order-events", left, right),
	);
}

function collected<T, U>(
	values: readonly T[],
	budget: PreprocessingBudget,
	pass: ModelPass,
	mapValue: (value: T) => U,
): U[] {
	const operations = new PreprocessingOperations(budget, pass, "prepare-events");
	const output = operations.array<U>();
	for (let index = 0; index < values.length; index += 1) {
		const value = operations.read(values, index)!;
		operations.push(output, mapValue(value));
	}
	return output;
}

function filteredValues<T>(
	values: readonly T[],
	budget: PreprocessingBudget,
	pass: ModelPass,
	keep: (value: T) => boolean,
): T[] {
	const operations = new PreprocessingOperations(budget, pass, "prepare-events");
	const output = operations.array<T>();
	for (let index = 0; index < values.length; index += 1) {
		const value = operations.read(values, index)!;
		if (!keep(value)) continue;
		operations.push(output, value);
	}
	return output;
}

function object(value: unknown): Readonly<Record<string, unknown>> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Readonly<Record<string, unknown>>)
		: null;
}

export function classifyBoundElements(value: unknown): BoundElementsClassification {
	const readableEntries: BoundElementsClassification["readableEntries"] = [];
	const problems: BoundElementsClassification["problems"] = [];
	if (!Array.isArray(value))
		return { readableEntries, problems: [{ issue: "not-array", entryIndex: null }] };
	value.forEach((entry, entryIndex) => {
		const item = object(entry);
		let issue: BoundElementIssue | null = null;
		if (!item) issue = "entry-not-object";
		else if (!("id" in item)) issue = "missing-id";
		else if (item.id === "") issue = "empty-id";
		else if (typeof item.id !== "string") issue = "non-string-id";
		else if (!("type" in item)) issue = "missing-type";
		else if (item.type !== "text" && item.type !== "arrow") issue = "invalid-type";
		else readableEntries.push({ id: item.id, type: item.type });
		if (issue) problems.push({ issue, entryIndex });
	});
	return { readableEntries, problems };
}

export function classifyBindingTarget(value: unknown): BindingTargetClassification {
	if (!value || typeof value !== "object")
		return {
			readableTargetId: null,
			blockingIssue: Array.isArray(value) ? "array" : "not-object",
		};
	if (Array.isArray(value)) return { readableTargetId: null, blockingIssue: "array" };
	if (!("elementId" in value))
		return { readableTargetId: null, blockingIssue: "missing-element-id" };
	if (value.elementId === "") return { readableTargetId: null, blockingIssue: "empty-element-id" };
	if (typeof value.elementId !== "string")
		return { readableTargetId: null, blockingIssue: "non-string-element-id" };
	return { readableTargetId: value.elementId, blockingIssue: null };
}

export function boundElementTargetCompatible(
	declaredType: "text" | "arrow",
	actualType: string,
): boolean {
	return declaredType === "text"
		? actualType === "text"
		: actualType === "arrow" || actualType === "line";
}

export function archboardMetadata(record: DecodedRecord): Readonly<Record<string, unknown>> | null {
	return object(object(record.raw?.customData)?.archboard);
}

export function nodeId(record: DecodedRecord): string | null {
	const value = archboardMetadata(record)?.node;
	return typeof value === "string" && value.length > 0 ? value : null;
}

export function groupIds(record: DecodedRecord): string[] {
	return Array.isArray(record.raw?.groupIds)
		? record.raw.groupIds.filter(
				(value): value is string => typeof value === "string" && value.length > 0,
			)
		: [];
}

function budgetedGroupIds(
	record: DecodedRecord,
	budget: PreprocessingBudget,
	pass: ModelPass,
): string[] {
	const operations = new PreprocessingOperations(budget, pass, "prepare-events");
	const output = operations.array<string>();
	const raw = record.raw?.groupIds;
	if (!Array.isArray(raw)) return output;
	for (let index = 0; index < raw.length; index += 1) {
		const value = operations.read(raw, index);
		if (typeof value !== "string" || value.length === 0) continue;
		operations.push(output, value);
	}
	return output;
}

export function libraryAttribution(record: DecodedRecord): {
	valid: boolean;
	item?: string;
	source?: string;
	issues: string[];
} | null {
	const custom = object(record.raw?.customData);
	if (!custom || !("library" in custom)) return null;
	const library = object(custom.library);
	if (!library) return { valid: false, issues: ["library must be an object"] };
	const item =
		typeof library.itemId === "string" && library.itemId.length > 0
			? library.itemId
			: typeof library.item === "string" && library.item.length > 0
				? library.item
				: undefined;
	const issues: string[] = [];
	if (!item) issues.push("itemId or item must be a nonempty string");
	if (
		library.source !== undefined &&
		(typeof library.source !== "string" || library.source.length === 0)
	)
		issues.push("source must be a nonempty string");
	return {
		valid: issues.length === 0,
		...(item ? { item } : {}),
		...(typeof library.source === "string" && library.source.length > 0
			? { source: library.source }
			: {}),
		issues,
	};
}

function validBoundary(record: DecodedRecord, operations: PreprocessingOperations): boolean {
	const angle = record.raw?.angle;
	return (
		!!record.id &&
		!!record.box &&
		record.box.width > 0 &&
		record.box.height > 0 &&
		!!record.type &&
		operations.setHas(CLOSED, record.type) &&
		(angle === undefined || angle === 0)
	);
}

function buildLabelClassifications(
	live: readonly DecodedRecord[],
	byId: ReadonlyMap<string, DecodedRecord>,
	duplicateIds: ReadonlySet<string>,
	budget: PreprocessingBudget,
): Pick<InspectionModel, "labelOwnership" | "confirmedLabels"> {
	const operations = new PreprocessingOperations(budget, "node-hierarchy", "prepare-events");
	const reverseLabelOwners = operations.map<string, Set<string>>();
	const labelsWithBlockedReverseClassification = operations.set<string>();
	for (let ownerIndex = 0; ownerIndex < live.length; ownerIndex += 1) {
		const owner = operations.read(live, ownerIndex)!;
		chargeIdentity(budget, "node-hierarchy", owner.id);
		if (!owner.id || owner.raw?.boundElements == null) continue;
		if (Array.isArray(owner.raw.boundElements))
			for (let entryIndex = 0; entryIndex < owner.raw.boundElements.length; entryIndex += 1) {
				const entry = operations.read(owner.raw.boundElements, entryIndex);
				if (entry && typeof entry === "object" && !Array.isArray(entry)) {
					const candidate = entry as Readonly<Record<string, unknown>>;
					chargeIdentity(
						budget,
						"node-hierarchy",
						typeof candidate.id === "string" ? candidate.id : null,
					);
				}
			}
		const bounds = classifyBoundElements(owner.raw.boundElements);
		for (
			let referenceIndex = 0;
			referenceIndex < bounds.readableEntries.length;
			referenceIndex += 1
		) {
			const reference = operations.read(bounds.readableEntries, referenceIndex)!;
			if (reference.type !== "text" || operations.mapGet(byId, reference.id)?.type !== "text")
				continue;
			if (!owner.usableId) {
				operations.setAdd(labelsWithBlockedReverseClassification, reference.id);
				continue;
			}
			const owners =
				operations.mapGet(reverseLabelOwners, reference.id) ?? operations.set<string>();
			operations.setAdd(owners, owner.id);
			operations.mapSet(reverseLabelOwners, reference.id, owners);
			if (bounds.problems.length > 0) {
				operations.setAdd(labelsWithBlockedReverseClassification, reference.id);
			}
		}
	}
	const labelOwnership = operations.map<string, LabelOwnershipClassification>();
	const confirmedLabels = operations.map<string, string>();
	for (let recordIndex = 0; recordIndex < live.length; recordIndex += 1) {
		const record = operations.read(live, recordIndex)!;
		chargeIdentity(budget, "node-hierarchy", record.id);
		if (record.type !== "text" || !record.usableId || !record.id) continue;
		const rawContainer = record.raw?.containerId;
		const blocked =
			(rawContainer !== undefined &&
				rawContainer !== null &&
				(typeof rawContainer !== "string" || rawContainer.length === 0)) ||
			operations.setHas(labelsWithBlockedReverseClassification, record.id) ||
			(typeof rawContainer === "string" && operations.setHas(duplicateIds, rawContainer));
		const forwardOwnerId =
			typeof rawContainer === "string" && rawContainer.length > 0 ? rawContainer : null;
		const reverseOwners = operations.mapGet(reverseLabelOwners, record.id);
		const reverseOwnerInput = operations.array<string>();
		if (reverseOwners)
			operations.forEachSet(reverseOwners, (owner) => operations.push(reverseOwnerInput, owner));
		const reverseOwnerIds = orderedIdentities(reverseOwnerInput, budget, "node-hierarchy");
		const candidateOwnerSet = operations.set<string>();
		if (forwardOwnerId) operations.setAdd(candidateOwnerSet, forwardOwnerId);
		for (let index = 0; index < reverseOwnerIds.length; index += 1)
			operations.setAdd(candidateOwnerSet, operations.read(reverseOwnerIds, index)!);
		const candidateOwnerInput = operations.array<string>();
		operations.forEachSet(candidateOwnerSet, (owner) =>
			operations.push(candidateOwnerInput, owner),
		);
		const candidateOwnerIds = orderedIdentities(candidateOwnerInput, budget, "node-hierarchy");
		let state: LabelOwnershipClassification["state"];
		let resolvedOwnerId: string | null = null;
		if (blocked) state = "blocked";
		else if (forwardOwnerId && reverseOwnerIds.length === 0) {
			state = "forward-only";
			resolvedOwnerId = forwardOwnerId;
		} else if (!forwardOwnerId && reverseOwnerIds.length === 1) {
			state = "reverse-only";
			resolvedOwnerId = operations.read(reverseOwnerIds, 0)!;
		} else if (
			forwardOwnerId &&
			reverseOwnerIds.length === 1 &&
			operations.read(reverseOwnerIds, 0) === forwardOwnerId
		) {
			state = "matching";
			resolvedOwnerId = forwardOwnerId;
		} else if (forwardOwnerId || reverseOwnerIds.length > 0) state = "conflicting";
		else state = "none";
		const classification = {
			labelId: record.id,
			forwardOwnerId,
			reverseOwnerIds,
			candidateOwnerIds,
			resolvedOwnerId,
			state,
		};
		operations.mapSet(labelOwnership, record.id, classification);
		if (
			resolvedOwnerId &&
			resolvedOwnerId !== record.id &&
			operations.mapHas(byId, resolvedOwnerId)
		) {
			operations.mapSet(confirmedLabels, record.id, resolvedOwnerId);
		}
	}
	return { labelOwnership, confirmedLabels };
}

function buildNodes(
	live: readonly DecodedRecord[],
	byId: ReadonlyMap<string, DecodedRecord>,
	confirmedLabels: ReadonlyMap<string, string>,
	budget: PreprocessingBudget,
): Pick<InspectionModel, "nodes" | "nodeOfElement" | "aggregateFailures"> {
	const operations = new PreprocessingOperations(budget, "node-hierarchy", "prepare-events");
	const grouped = operations.map<string, DecodedRecord[]>();
	const nodeOfElement = operations.map<string, string>();
	for (let recordIndex = 0; recordIndex < live.length; recordIndex += 1) {
		const record = operations.read(live, recordIndex)!;
		const node = nodeId(record);
		chargeIdentity(budget, "node-hierarchy", node);
		if (!node || !record.usableId || !record.id || !record.box) continue;
		const members = operations.mapGet(grouped, node) ?? operations.array<DecodedRecord>();
		operations.push(members, record);
		operations.mapSet(grouped, node, members);
		operations.mapSet(nodeOfElement, record.id, node);
	}
	operations.forEachMap(confirmedLabels, (containerId, labelId) => {
		const owner = operations.mapGet(nodeOfElement, containerId);
		const label = operations.mapGet(byId, labelId);
		if (!owner || !label || operations.mapHas(nodeOfElement, labelId) || !label.box) return;
		operations.push(operations.mapGet(grouped, owner)!, label);
		operations.mapSet(nodeOfElement, labelId, owner);
	});

	const nodes = operations.map<string, InspectionNode>();
	const aggregateFailures = operations.array<AggregateCoordinateFailure>();
	operations.forEachMap(grouped, (members, id) => {
		const labels = filteredValues(members, budget, "node-hierarchy", (record) =>
			operations.mapHas(confirmedLabels, record.id ?? ""),
		);
		const bodies = filteredValues(
			members,
			budget,
			"node-hierarchy",
			(record) => !operations.mapHas(confirmedLabels, record.id ?? ""),
		);
		const bodyMembers = bodies.length > 0 ? bodies : members;
		const bodyResult = aggregateBoxes(
			collected(bodyMembers, budget, "node-hierarchy", (record) => record.box!),
		);
		const aggregateResult = aggregateBoxes(
			collected(members, budget, "node-hierarchy", (record) => record.box!),
		);
		if (bodyResult.kind !== "representable") {
			operations.push(aggregateFailures, {
				scope: "semantic-node-body",
				subjectId: id,
				members: bodyMembers,
			});
			for (let memberIndex = 0; memberIndex < members.length; memberIndex += 1) {
				const member = operations.read(members, memberIndex)!;
				if (member.id) {
					operations.mapDelete(nodeOfElement, member.id);
				}
			}
			return;
		}
		const aggregate = aggregateResult.kind === "representable" ? aggregateResult.box : null;
		if (!aggregate)
			operations.push(aggregateFailures, {
				scope: "semantic-node-aggregate",
				subjectId: id,
				members,
			});
		const elementIds = orderedIdentities(
			collected(bodies, budget, "node-hierarchy", (record) => record.id!),
			budget,
			"node-hierarchy",
		);
		const labelElementIds = orderedIdentities(
			collected(labels, budget, "node-hierarchy", (record) => record.id!),
			budget,
			"node-hierarchy",
		);
		operations.mapSet(nodes, id, {
			id,
			members,
			bodies,
			labels,
			aggregate,
			body: bodyResult.box,
			boundaries: filteredValues(bodies, budget, "node-hierarchy", (record) =>
				validBoundary(record, operations),
			),
			parentId: null,
			children: [],
			ref: { id, elementIds, labelElementIds },
		});
	});
	return { nodes, nodeOfElement, aggregateFailures };
}

interface BinaryFactor {
	significand: bigint;
	exponent: number;
}

function binaryFactor(value: number): BinaryFactor {
	if (value === 0) return { significand: 0n, exponent: 0 };
	const view = new DataView(new ArrayBuffer(8));
	view.setFloat64(0, value, false);
	const bits = view.getBigUint64(0, false);
	const storedExponent = Number((bits >> 52n) & 0x7ffn);
	const fraction = bits & 0x000f_ffff_ffff_ffffn;
	return storedExponent === 0
		? { significand: fraction, exponent: -1074 }
		: {
				significand: (1n << 52n) | fraction,
				exponent: storedExponent - 1023 - 52,
			};
}

function areaFactor(box: ExactBox): BinaryFactor {
	const width = binaryFactor(box.width);
	const height = binaryFactor(box.height);
	return {
		significand: width.significand * height.significand,
		exponent: width.exponent + height.exponent,
	};
}

function bitLength(value: bigint): number {
	return value === 0n ? 0 : value.toString(2).length;
}

function compareAreaFactors(aa: BinaryFactor, bb: BinaryFactor): number {
	if (aa.significand === 0n || bb.significand === 0n)
		return aa.significand === bb.significand ? 0 : aa.significand === 0n ? -1 : 1;
	const aMagnitude = bitLength(aa.significand) + aa.exponent;
	const bMagnitude = bitLength(bb.significand) + bb.exponent;
	if (aMagnitude !== bMagnitude) return aMagnitude < bMagnitude ? -1 : 1;
	const commonExponent = Math.min(aa.exponent, bb.exponent);
	const alignedA = aa.significand << BigInt(aa.exponent - commonExponent);
	const alignedB = bb.significand << BigInt(bb.exponent - commonExponent);
	return alignedA === alignedB ? 0 : alignedA < alignedB ? -1 : 1;
}

function assignNodeHierarchy(
	nodes: Map<string, InspectionNode>,
	budget: PreprocessingBudget,
): SweepWork {
	const prepare = new PreprocessingOperations(budget, "node-hierarchy", "prepare-events");
	const hierarchy = new PreprocessingOperations(budget, "node-hierarchy", "hierarchy-query");
	const children = prepare.array<InspectionNode>();
	prepare.forEachMap(nodes, (node) => prepare.push(children, node));
	const boundaries = prepare.array<{ owner: InspectionNode; boundary: DecodedRecord }>();
	for (let ownerIndex = 0; ownerIndex < children.length; ownerIndex += 1) {
		const owner = prepare.read(children, ownerIndex)!;
		for (let boundaryIndex = 0; boundaryIndex < owner.boundaries.length; boundaryIndex += 1) {
			const boundary = prepare.read(owner.boundaries, boundaryIndex)!;
			prepare.push(boundaries, { owner, boundary });
		}
	}
	const childAreas = prepare.map<string, BinaryFactor>();
	for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
		const child = prepare.read(children, childIndex)!;
		prepare.mapSet(childAreas, child.id, areaFactor(child.body));
	}
	const boundaryAreas = prepare.map<DecodedRecord, BinaryFactor>();
	for (let boundaryIndex = 0; boundaryIndex < boundaries.length; boundaryIndex += 1) {
		const { boundary } = prepare.read(boundaries, boundaryIndex)!;
		prepare.mapSet(boundaryAreas, boundary, areaFactor(boundary.box!));
	}
	const selectedByChild = prepare.map<string, { owner: InspectionNode; boundary: DecodedRecord }>();
	const candidateOrder = (
		a: { owner: InspectionNode; boundary: DecodedRecord },
		b: { owner: InspectionNode; boundary: DecodedRecord },
	) =>
		compareAreaFactors(
			hierarchy.mapGet(boundaryAreas, a.boundary)!,
			hierarchy.mapGet(boundaryAreas, b.boundary)!,
		) ||
		comparePreprocessingIdentity(
			budget,
			"node-hierarchy",
			"hierarchy-query",
			a.boundary.id!,
			b.boundary.id!,
		) ||
		comparePreprocessingIdentity(
			budget,
			"node-hierarchy",
			"hierarchy-query",
			a.owner.id,
			b.owner.id,
		);
	const work = sweepIntervalPairs(
		collected(children, budget, "node-hierarchy", (child) => ({
			id: child.id,
			min: child.body.x,
			max: child.body.x + child.body.width,
			value: child,
			semantics: {
				partition: child.id,
				excludedPartitions: (() => {
					const excluded = prepare.set<string>();
					prepare.setAdd(excluded, child.id);
					return excluded;
				})(),
			},
		})),
		collected(boundaries, budget, "node-hierarchy", ({ owner, boundary }) => ({
			id: boundary.id!,
			min: boundary.box!.x,
			max: boundary.box!.x + boundary.box!.width,
			value: { owner, boundary },
			semantics: {
				partition: owner.id,
				excludedPartitions: (() => {
					const excluded = prepare.set<string>();
					prepare.setAdd(excluded, owner.id);
					return excluded;
				})(),
			},
		})),
		false,
		(childInterval, boundaryInterval) => {
			const child = childInterval.value;
			const { owner, boundary } = boundaryInterval.value;
			if (boundaryInterval.min > childInterval.min || boundaryInterval.max < childInterval.max)
				return;
			if (
				compareAreaFactors(
					hierarchy.mapGet(boundaryAreas, boundary)!,
					hierarchy.mapGet(childAreas, child.id)!,
				) <= 0 ||
				!contains(boundary.box!, child.body)
			)
				return;
			const candidate = { owner, boundary };
			const selected = hierarchy.mapGet(selectedByChild, child.id);
			if (!selected || candidateOrder(candidate, selected) < 0)
				hierarchy.mapSet(selectedByChild, child.id, candidate);
		},
		{ budget, pass: "node-hierarchy" },
	);
	for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
		const child = hierarchy.read(children, childIndex)!;
		const selected = hierarchy.mapGet(selectedByChild, child.id);
		if (selected) child.parentId = selected.owner.id;
	}
	work.peakRetainedSelections = selectedByChild.size;
	hierarchy.forEachMap(nodes, (node) => {
		if (node.parentId) {
			hierarchy.push(hierarchy.mapGet(nodes, node.parentId)!.children, node.id);
		}
	});
	hierarchy.forEachMap(nodes, (node) => {
		node.children = orderedIdentities(node.children, budget, "node-hierarchy");
	});
	return work;
}

function buildConnectorEndpoints(
	live: readonly DecodedRecord[],
	nodeOfElement: ReadonlyMap<string, string>,
	duplicateIds: ReadonlySet<string>,
	budget: PreprocessingBudget,
): Map<string, ConnectorEndpointClassification> {
	const operations = new PreprocessingOperations(budget, "node-hierarchy", "prepare-events");
	const connectorEndpoints = operations.map<string, ConnectorEndpointClassification>();
	for (let recordIndex = 0; recordIndex < live.length; recordIndex += 1) {
		const record = operations.read(live, recordIndex)!;
		if (!record.usableId || !record.id || (record.type !== "arrow" && record.type !== "line"))
			continue;
		const endpoint = (end: "start" | "end") => {
			budget.charge("node-hierarchy", "prepare-events");
			const value = record.raw?.[`${end}Binding`];
			if (value == null) return { blocked: false, node: undefined };
			const target = classifyBindingTarget(value);
			return {
				blocked:
					target.blockingIssue !== null ||
					(target.readableTargetId !== null &&
						operations.setHas(duplicateIds, target.readableTargetId)),
				node: target.readableTargetId
					? operations.mapGet(nodeOfElement, target.readableTargetId)
					: undefined,
			};
		};
		const start = endpoint("start");
		const end = endpoint("end");
		operations.mapSet(connectorEndpoints, record.id, {
			nodeAnalysisEligible: !start.blocked && !end.blocked,
			startNode: start.node,
			endNode: end.node,
		});
	}
	return connectorEndpoints;
}

function findContainerOnlyIds(
	live: readonly DecodedRecord[],
	nodes: ReadonlyMap<string, InspectionNode>,
	nodeOfElement: ReadonlyMap<string, string>,
	budget: PreprocessingBudget,
): { ids: Set<string>; work: SweepWork } {
	const operations = new PreprocessingOperations(budget, "container-boundary", "prepare-events");
	const containerOnlyIds = operations.set<string>();
	const boundaries = filteredValues(live, budget, "container-boundary", (record) => {
		return !operations.mapHas(nodeOfElement, record.id ?? "") && validBoundary(record, operations);
	});
	const nodeValues = operations.array<InspectionNode>();
	operations.forEachMap(nodes, (node) => operations.push(nodeValues, node));
	const work = sweepIntervalPairs(
		collected(boundaries, budget, "container-boundary", (record) => ({
			id: record.id!,
			min: record.box!.x,
			max: record.box!.x + record.box!.width,
			value: record,
			semantics: { partition: record.id!, excludedPartitions: operations.set<string>() },
		})),
		collected(nodeValues, budget, "container-boundary", (node) => ({
			id: node.id,
			min: node.body.x,
			max: node.body.x + node.body.width,
			value: node,
			semantics: { partition: node.id, excludedPartitions: operations.set<string>() },
		})),
		false,
		(boundary, node) => {
			if (contains(boundary.value.box!, node.value.body)) {
				new PreprocessingOperations(budget, "container-boundary", "hierarchy-query").setAdd(
					containerOnlyIds,
					boundary.value.id!,
				);
			}
		},
		{ budget, pass: "container-boundary" },
	);
	return { ids: containerOnlyIds, work };
}

function buildObstacles(
	live: readonly DecodedRecord[],
	nodeOfElement: ReadonlyMap<string, string>,
	confirmedLabels: ReadonlyMap<string, string>,
	containerOnlyIds: ReadonlySet<string>,
	budget: PreprocessingBudget,
): Pick<
	InspectionModel,
	"obstacles" | "qualifyingGroupedObstacleElementIds" | "aggregateFailures"
> {
	const operations = new PreprocessingOperations(budget, "container-boundary", "prepare-events");
	const hierarchyOperations = new PreprocessingOperations(
		budget,
		"container-boundary",
		"hierarchy-query",
	);
	const eligible = filteredValues(live, budget, "container-boundary", (record) => {
		const angle = record.raw?.angle;
		return (
			record.usableId &&
			!!record.id &&
			!!record.type &&
			!!record.box &&
			record.box.width > 0 &&
			record.box.height > 0 &&
			operations.setHas(OBSTACLE_BODY, record.type) &&
			(angle === undefined || angle === 0) &&
			!operations.mapHas(nodeOfElement, record.id) &&
			!operations.mapHas(confirmedLabels, record.id) &&
			!operations.setHas(containerOnlyIds, record.id)
		);
	});
	const parent = operations.map<string, string>();
	const groupsById = operations.map<string, string[]>();
	for (let recordIndex = 0; recordIndex < eligible.length; recordIndex += 1) {
		const record = operations.read(eligible, recordIndex)!;
		operations.mapSet(parent, record.id!, record.id!);
		const groups = budgetedGroupIds(record, budget, "container-boundary");
		for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1)
			chargeIdentity(budget, "container-boundary", operations.read(groups, groupIndex)!);
		operations.mapSet(groupsById, record.id!, groups);
	}
	const find = (id: string): string => {
		let current = id;
		while (true) {
			budget.charge("container-boundary", "hierarchy-query");
			const next = hierarchyOperations.mapGet(parent, current);
			if (next === current) break;
			current = next!;
		}
		let next = id;
		while (true) {
			budget.charge("container-boundary", "hierarchy-query");
			if (hierarchyOperations.mapGet(parent, next) === current) break;
			const previous = hierarchyOperations.mapGet(parent, next)!;
			hierarchyOperations.mapSet(parent, next, current);
			next = previous;
		}
		return current;
	};
	const join = (a: string, b: string) => {
		const aa = find(a),
			bb = find(b);
		if (aa === bb) return;
		const compared = comparePreprocessingIdentity(
			budget,
			"container-boundary",
			"hierarchy-query",
			aa,
			bb,
		);
		if (compared < 0) hierarchyOperations.mapSet(parent, bb, aa);
		else hierarchyOperations.mapSet(parent, aa, bb);
	};
	const firstByGroup = operations.map<string, string>();
	for (let recordIndex = 0; recordIndex < eligible.length; recordIndex += 1) {
		const record = operations.read(eligible, recordIndex)!;
		const groups = operations.mapGet(groupsById, record.id!) ?? [];
		for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
			const group = operations.read(groups, groupIndex)!;
			const first = operations.mapGet(firstByGroup, group);
			if (first) join(first, record.id!);
			else operations.mapSet(firstByGroup, group, record.id!);
		}
	}
	const components = operations.map<string, DecodedRecord[]>();
	for (let recordIndex = 0; recordIndex < eligible.length; recordIndex += 1) {
		const record = operations.read(eligible, recordIndex)!;
		const root = find(record.id!);
		const members = operations.mapGet(components, root) ?? operations.array<DecodedRecord>();
		operations.push(members, record);
		operations.mapSet(components, root, members);
	}
	const obstacles = operations.array<InspectionObstacle>();
	const qualifyingGroupedObstacleElementIds = operations.set<string>();
	const aggregateFailures = operations.array<AggregateCoordinateFailure>();
	operations.forEachMap(components, (members) => {
		const validLibrary = filteredValues(members, budget, "container-boundary", (record) =>
			Boolean(libraryAttribution(record)?.valid),
		);
		const sharedGroup = members.length >= 2;
		if (validLibrary.length === 0 && !sharedGroup) return;
		if (sharedGroup)
			for (let memberIndex = 0; memberIndex < members.length; memberIndex += 1) {
				const member = operations.read(members, memberIndex)!;
				operations.setAdd(qualifyingGroupedObstacleElementIds, member.id!);
			}
		const elementIds = orderedIdentities(
			collected(members, budget, "container-boundary", (record) => record.id!),
			budget,
			"container-boundary",
		);
		const uniqueGroups = operations.set<string>();
		for (let memberIndex = 0; memberIndex < members.length; memberIndex += 1) {
			const member = operations.read(members, memberIndex)!;
			const memberGroups = operations.mapGet(groupsById, member.id!) ?? [];
			for (let groupIndex = 0; groupIndex < memberGroups.length; groupIndex += 1)
				operations.setAdd(uniqueGroups, operations.read(memberGroups, groupIndex)!);
		}
		const groupInput = operations.array<string>();
		operations.forEachSet(uniqueGroups, (group) => operations.push(groupInput, group));
		const groups = orderedIdentities(groupInput, budget, "container-boundary");
		const library = stablePreprocessingSort(
			collected(validLibrary, budget, "container-boundary", (record) => {
				budget.charge("container-boundary", "prepare-events");
				const attr = libraryAttribution(record)!;
				return {
					elementId: record.id!,
					item: attr.item!,
					...(attr.source ? { source: attr.source } : {}),
				};
			}),
			budget,
			"container-boundary",
			"order-events",
			(a, b) =>
				comparePreprocessingIdentity(
					budget,
					"container-boundary",
					"order-events",
					a.elementId,
					b.elementId,
				),
		);
		const obstacleResult = aggregateBoxes(
			collected(members, budget, "container-boundary", (record) => record.box!),
		);
		const kind =
			validLibrary.length > 0 ? ("library-component" as const) : ("grouped-component" as const);
		const id = encodePreprocessingObstacleIdentity(elementIds, budget, "container-boundary");
		if (obstacleResult.kind !== "representable") {
			operations.push(aggregateFailures, { scope: "obstacle-component", subjectId: id, members });
			return;
		}
		operations.push(obstacles, {
			id,
			kind,
			members,
			box: obstacleResult.box,
			ref: { id, kind, elementIds, groupIds: groups, library },
		});
	});
	const ordered = stablePreprocessingSort(
		obstacles,
		budget,
		"container-boundary",
		"order-events",
		(a, b) =>
			comparePreprocessingIdentity(budget, "container-boundary", "order-events", a.id, b.id),
	);
	return { obstacles: ordered, qualifyingGroupedObstacleElementIds, aggregateFailures };
}

export function buildInspectionModel(
	records: readonly DecodedRecord[],
	budget: PreprocessingBudget,
): InspectionModel {
	const operations = new PreprocessingOperations(budget, "node-hierarchy", "prepare-events");
	const live = filteredValues(records, budget, "node-hierarchy", (record) =>
		Boolean(record.live && record.raw),
	);
	const byId = operations.map<string, DecodedRecord>();
	const duplicateIds = operations.set<string>();
	for (let recordIndex = 0; recordIndex < live.length; recordIndex += 1) {
		const record = operations.read(live, recordIndex)!;
		chargeIdentity(budget, "node-hierarchy", record.id);
		if (record.id && !record.usableId) {
			operations.setAdd(duplicateIds, record.id);
		}
	}
	for (let recordIndex = 0; recordIndex < live.length; recordIndex += 1) {
		const record = operations.read(live, recordIndex)!;
		if (record.usableId && record.id) {
			operations.mapSet(byId, record.id, record);
		}
	}
	const { labelOwnership, confirmedLabels } = buildLabelClassifications(
		live,
		byId,
		duplicateIds,
		budget,
	);
	const {
		nodes,
		nodeOfElement,
		aggregateFailures: nodeAggregateFailures,
	} = buildNodes(live, byId, confirmedLabels, budget);
	const hierarchyWork = assignNodeHierarchy(nodes, budget);
	const connectorEndpoints = buildConnectorEndpoints(live, nodeOfElement, duplicateIds, budget);
	const containerOnly = findContainerOnlyIds(live, nodes, nodeOfElement, budget);
	const containerOnlyIds = containerOnly.ids;
	const {
		obstacles,
		qualifyingGroupedObstacleElementIds,
		aggregateFailures: obstacleAggregateFailures,
	} = buildObstacles(live, nodeOfElement, confirmedLabels, containerOnlyIds, budget);
	const aggregateFailures = operations.array<AggregateCoordinateFailure>();
	for (let index = 0; index < nodeAggregateFailures.length; index += 1)
		operations.push(aggregateFailures, operations.read(nodeAggregateFailures, index)!);
	for (let index = 0; index < obstacleAggregateFailures.length; index += 1)
		operations.push(aggregateFailures, operations.read(obstacleAggregateFailures, index)!);
	return {
		byId,
		duplicateIds,
		nodes,
		nodeOfElement,
		confirmedLabels,
		labelOwnership,
		connectorEndpoints,
		containerOnlyIds,
		qualifyingGroupedObstacleElementIds,
		obstacles,
		aggregateFailures,
		hierarchyWork,
		containerBoundaryWork: containerOnly.work,
	};
}

export function semanticParents(
	model: InspectionModel,
	startingNodeId: string | undefined,
): Set<string> {
	const found = new Set<string>();
	let current = startingNodeId ? model.nodes.get(startingNodeId)?.parentId : null;
	while (current && !found.has(current)) {
		found.add(current);
		current = model.nodes.get(current)?.parentId ?? null;
	}
	return found;
}
