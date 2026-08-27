import type { NodeRef, ObstacleRef } from "../schemas.js";
import type { DecodedRecord } from "./decode.js";
import { aggregateBoxes, contains, type ExactBox } from "./geometry.js";
import { sweepIntervalPairs, type SweepWork } from "./interval-sweep.js";
import type {
	AnalysisWorkOwner,
	AnalysisWorkPhase,
	InspectionBudget,
} from "./inspection-budget.js";
import { compareIdentity, obstacleIdentity } from "./ordering.js";

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

function orderedIdentities(
	values: readonly string[],
	budget: InspectionBudget,
	pass: ModelPass,
): string[] {
	budget.claimSort(pass, "order-events", values.length);
	return [...values].toSorted(compareIdentity);
}

function collected<T, U>(
	values: readonly T[],
	budget: InspectionBudget,
	pass: ModelPass,
	mapValue: (value: T) => U,
): U[] {
	budget.claimWork(pass, "aggregate-model", values.length);
	return values.map(mapValue);
}

function filteredValues<T>(
	values: readonly T[],
	budget: InspectionBudget,
	pass: ModelPass,
	keep: (value: T) => boolean,
): T[] {
	budget.claimWork(pass, "aggregate-model", values.length);
	return values.filter(keep);
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

export function groupIds(
	record: DecodedRecord,
	budget?: InspectionBudget,
	owner: AnalysisWorkOwner = "record-analysis",
	phase: AnalysisWorkPhase = "classify-records",
): string[] {
	const raw = record.raw?.groupIds;
	if (!Array.isArray(raw)) return [];
	budget?.claimWork(owner, phase, raw.length);
	return raw.filter((value): value is string => typeof value === "string" && value.length > 0);
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

function validBoundary(record: DecodedRecord): boolean {
	const angle = record.raw?.angle;
	return (
		!!record.id &&
		!!record.box &&
		record.box.width > 0 &&
		record.box.height > 0 &&
		!!record.type &&
		CLOSED.has(record.type) &&
		(angle === undefined || angle === 0)
	);
}

function buildLabelClassifications(
	live: readonly DecodedRecord[],
	byId: ReadonlyMap<string, DecodedRecord>,
	duplicateIds: ReadonlySet<string>,
	budget: InspectionBudget,
): Pick<InspectionModel, "labelOwnership" | "confirmedLabels"> {
	budget.claimWork("node-hierarchy", "classify-records", live.length);
	const reverseLabelOwners = new Map<string, Set<string>>();
	const labelsWithBlockedReverseClassification = new Set<string>();
	for (let ownerIndex = 0; ownerIndex < live.length; ownerIndex += 1) {
		const owner = live[ownerIndex]!;
		if (!owner.id || owner.raw?.boundElements == null) continue;
		if (Array.isArray(owner.raw.boundElements))
			budget.claimWork("node-hierarchy", "classify-records", owner.raw.boundElements.length);
		const bounds = classifyBoundElements(owner.raw.boundElements);
		for (
			let referenceIndex = 0;
			referenceIndex < bounds.readableEntries.length;
			referenceIndex += 1
		) {
			const reference = bounds.readableEntries[referenceIndex]!;
			if (reference.type !== "text" || byId.get(reference.id)?.type !== "text") continue;
			if (!owner.usableId) {
				labelsWithBlockedReverseClassification.add(reference.id);
				continue;
			}
			const owners = reverseLabelOwners.get(reference.id) ?? new Set<string>();
			owners.add(owner.id);
			reverseLabelOwners.set(reference.id, owners);
			if (bounds.problems.length > 0) {
				labelsWithBlockedReverseClassification.add(reference.id);
			}
		}
	}
	const labelOwnership = new Map<string, LabelOwnershipClassification>();
	const confirmedLabels = new Map<string, string>();
	for (let recordIndex = 0; recordIndex < live.length; recordIndex += 1) {
		const record = live[recordIndex]!;
		if (record.type !== "text" || !record.usableId || !record.id) continue;
		const rawContainer = record.raw?.containerId;
		const blocked =
			(rawContainer !== undefined &&
				rawContainer !== null &&
				(typeof rawContainer !== "string" || rawContainer.length === 0)) ||
			labelsWithBlockedReverseClassification.has(record.id) ||
			(typeof rawContainer === "string" && duplicateIds.has(rawContainer));
		const forwardOwnerId =
			typeof rawContainer === "string" && rawContainer.length > 0 ? rawContainer : null;
		const reverseOwners = reverseLabelOwners.get(record.id);
		const reverseOwnerInput = reverseOwners ? [...reverseOwners] : [];
		const reverseOwnerIds = orderedIdentities(reverseOwnerInput, budget, "node-hierarchy");
		const candidateOwnerSet = new Set<string>();
		if (forwardOwnerId) candidateOwnerSet.add(forwardOwnerId);
		for (let index = 0; index < reverseOwnerIds.length; index += 1)
			candidateOwnerSet.add(reverseOwnerIds[index]!);
		const candidateOwnerInput = [...candidateOwnerSet];
		const candidateOwnerIds = orderedIdentities(candidateOwnerInput, budget, "node-hierarchy");
		let state: LabelOwnershipClassification["state"];
		let resolvedOwnerId: string | null = null;
		if (blocked) state = "blocked";
		else if (forwardOwnerId && reverseOwnerIds.length === 0) {
			state = "forward-only";
			resolvedOwnerId = forwardOwnerId;
		} else if (!forwardOwnerId && reverseOwnerIds.length === 1) {
			state = "reverse-only";
			resolvedOwnerId = reverseOwnerIds[0]!;
		} else if (
			forwardOwnerId &&
			reverseOwnerIds.length === 1 &&
			reverseOwnerIds[0] === forwardOwnerId
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
		labelOwnership.set(record.id, classification);
		if (resolvedOwnerId && resolvedOwnerId !== record.id && byId.has(resolvedOwnerId)) {
			confirmedLabels.set(record.id, resolvedOwnerId);
		}
	}
	return { labelOwnership, confirmedLabels };
}

function buildNodes(
	live: readonly DecodedRecord[],
	byId: ReadonlyMap<string, DecodedRecord>,
	confirmedLabels: ReadonlyMap<string, string>,
	budget: InspectionBudget,
): Pick<InspectionModel, "nodes" | "nodeOfElement" | "aggregateFailures"> {
	budget.claimWork("node-hierarchy", "classify-records", live.length);
	const grouped = new Map<string, DecodedRecord[]>();
	const nodeOfElement = new Map<string, string>();
	for (let recordIndex = 0; recordIndex < live.length; recordIndex += 1) {
		const record = live[recordIndex]!;
		const node = nodeId(record);
		if (!node || !record.usableId || !record.id || !record.box) continue;
		const members = grouped.get(node) ?? [];
		members.push(record);
		grouped.set(node, members);
		nodeOfElement.set(record.id, node);
	}
	budget.claimWork("node-hierarchy", "aggregate-model", confirmedLabels.size);
	for (const [labelId, containerId] of confirmedLabels) {
		const owner = nodeOfElement.get(containerId);
		const label = byId.get(labelId);
		if (!owner || !label || nodeOfElement.has(labelId) || !label.box) continue;
		grouped.get(owner)!.push(label);
		nodeOfElement.set(labelId, owner);
	}

	const nodes = new Map<string, InspectionNode>();
	const aggregateFailures: AggregateCoordinateFailure[] = [];
	budget.claimWork("node-hierarchy", "aggregate-model", grouped.size);
	for (const [id, members] of grouped) {
		const labels = filteredValues(members, budget, "node-hierarchy", (record) =>
			confirmedLabels.has(record.id ?? ""),
		);
		const bodies = filteredValues(
			members,
			budget,
			"node-hierarchy",
			(record) => !confirmedLabels.has(record.id ?? ""),
		);
		const bodyMembers = bodies.length > 0 ? bodies : members;
		const bodyResult = aggregateBoxes(
			collected(bodyMembers, budget, "node-hierarchy", (record) => record.box!),
		);
		const aggregateResult = aggregateBoxes(
			collected(members, budget, "node-hierarchy", (record) => record.box!),
		);
		if (bodyResult.kind !== "representable") {
			aggregateFailures.push({
				scope: "semantic-node-body",
				subjectId: id,
				members: bodyMembers,
			});
			for (let memberIndex = 0; memberIndex < members.length; memberIndex += 1) {
				const member = members[memberIndex]!;
				if (member.id) {
					nodeOfElement.delete(member.id);
				}
			}
			continue;
		}
		const aggregate = aggregateResult.kind === "representable" ? aggregateResult.box : null;
		if (!aggregate)
			aggregateFailures.push({
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
		nodes.set(id, {
			id,
			members,
			bodies,
			labels,
			aggregate,
			body: bodyResult.box,
			boundaries: filteredValues(bodies, budget, "node-hierarchy", validBoundary),
			parentId: null,
			children: [],
			ref: { id, elementIds, labelElementIds },
		});
	}
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
	budget: InspectionBudget,
): SweepWork {
	budget.claimWork("node-hierarchy", "prepare-events", nodes.size);
	const children = [...nodes.values()];
	const boundaries: Array<{ owner: InspectionNode; boundary: DecodedRecord }> = [];
	for (let ownerIndex = 0; ownerIndex < children.length; ownerIndex += 1) {
		const owner = children[ownerIndex]!;
		budget.claimWork("node-hierarchy", "prepare-events", owner.boundaries.length);
		for (let boundaryIndex = 0; boundaryIndex < owner.boundaries.length; boundaryIndex += 1) {
			boundaries.push({ owner, boundary: owner.boundaries[boundaryIndex]! });
		}
	}
	const childAreas = new Map<string, BinaryFactor>();
	for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
		const child = children[childIndex]!;
		childAreas.set(child.id, areaFactor(child.body));
	}
	const boundaryAreas = new Map<DecodedRecord, BinaryFactor>();
	for (let boundaryIndex = 0; boundaryIndex < boundaries.length; boundaryIndex += 1) {
		const { boundary } = boundaries[boundaryIndex]!;
		boundaryAreas.set(boundary, areaFactor(boundary.box!));
	}
	const selectedByChild = new Map<string, { owner: InspectionNode; boundary: DecodedRecord }>();
	const candidateOrder = (
		a: { owner: InspectionNode; boundary: DecodedRecord },
		b: { owner: InspectionNode; boundary: DecodedRecord },
	) =>
		compareAreaFactors(boundaryAreas.get(a.boundary)!, boundaryAreas.get(b.boundary)!) ||
		compareIdentity(a.boundary.id!, b.boundary.id!) ||
		compareIdentity(a.owner.id, b.owner.id);
	const work = sweepIntervalPairs(
		collected(children, budget, "node-hierarchy", (child) => ({
			id: child.id,
			min: child.body.x,
			max: child.body.x + child.body.width,
			value: child,
			semantics: {
				partition: child.id,
				excludedPartitions: new Set([child.id]),
			},
		})),
		collected(boundaries, budget, "node-hierarchy", ({ owner, boundary }) => ({
			id: boundary.id!,
			min: boundary.box!.x,
			max: boundary.box!.x + boundary.box!.width,
			value: { owner, boundary },
			semantics: {
				partition: owner.id,
				excludedPartitions: new Set([owner.id]),
			},
		})),
		false,
		(childInterval, boundaryInterval) => {
			const child = childInterval.value;
			const { owner, boundary } = boundaryInterval.value;
			if (boundaryInterval.min > childInterval.min || boundaryInterval.max < childInterval.max)
				return;
			if (
				compareAreaFactors(boundaryAreas.get(boundary)!, childAreas.get(child.id)!) <= 0 ||
				!contains(boundary.box!, child.body)
			)
				return;
			const candidate = { owner, boundary };
			const selected = selectedByChild.get(child.id);
			if (!selected || candidateOrder(candidate, selected) < 0)
				selectedByChild.set(child.id, candidate);
		},
		{ budget, pass: "node-hierarchy" },
	);
	for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
		const child = children[childIndex]!;
		const selected = selectedByChild.get(child.id);
		if (selected) child.parentId = selected.owner.id;
	}
	work.peakSelections = selectedByChild.size;
	for (const node of nodes.values()) {
		if (node.parentId) {
			nodes.get(node.parentId)!.children.push(node.id);
		}
	}
	for (const node of nodes.values()) {
		node.children = orderedIdentities(node.children, budget, "node-hierarchy");
	}
	return work;
}

function buildConnectorEndpoints(
	live: readonly DecodedRecord[],
	nodeOfElement: ReadonlyMap<string, string>,
	duplicateIds: ReadonlySet<string>,
	budget: InspectionBudget,
): Map<string, ConnectorEndpointClassification> {
	budget.claimWork("node-hierarchy", "classify-records", live.length);
	const connectorEndpoints = new Map<string, ConnectorEndpointClassification>();
	for (let recordIndex = 0; recordIndex < live.length; recordIndex += 1) {
		const record = live[recordIndex]!;
		if (!record.usableId || !record.id || (record.type !== "arrow" && record.type !== "line"))
			continue;
		const endpoint = (end: "start" | "end") => {
			budget.claimWork("node-hierarchy", "classify-records");
			const value = record.raw?.[`${end}Binding`];
			if (value == null) return { blocked: false, node: undefined };
			const target = classifyBindingTarget(value);
			return {
				blocked:
					target.blockingIssue !== null ||
					(target.readableTargetId !== null && duplicateIds.has(target.readableTargetId)),
				node: target.readableTargetId ? nodeOfElement.get(target.readableTargetId) : undefined,
			};
		};
		const start = endpoint("start");
		const end = endpoint("end");
		connectorEndpoints.set(record.id, {
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
	budget: InspectionBudget,
): { ids: Set<string>; work: SweepWork } {
	const containerOnlyIds = new Set<string>();
	const boundaries = filteredValues(live, budget, "container-boundary", (record) => {
		return !nodeOfElement.has(record.id ?? "") && validBoundary(record);
	});
	budget.claimWork("container-boundary", "aggregate-model", nodes.size);
	const nodeValues = [...nodes.values()];
	const work = sweepIntervalPairs(
		collected(boundaries, budget, "container-boundary", (record) => ({
			id: record.id!,
			min: record.box!.x,
			max: record.box!.x + record.box!.width,
			value: record,
			semantics: { partition: record.id!, excludedPartitions: new Set<string>() },
		})),
		collected(nodeValues, budget, "container-boundary", (node) => ({
			id: node.id,
			min: node.body.x,
			max: node.body.x + node.body.width,
			value: node,
			semantics: { partition: node.id, excludedPartitions: new Set<string>() },
		})),
		false,
		(boundary, node) => {
			if (contains(boundary.value.box!, node.value.body)) {
				budget.claimWork("container-boundary", "hierarchy-query");
				containerOnlyIds.add(boundary.value.id!);
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
	budget: InspectionBudget,
): Pick<
	InspectionModel,
	"obstacles" | "qualifyingGroupedObstacleElementIds" | "aggregateFailures"
> {
	const eligible = filteredValues(live, budget, "container-boundary", (record) => {
		const angle = record.raw?.angle;
		return (
			record.usableId &&
			!!record.id &&
			!!record.type &&
			!!record.box &&
			record.box.width > 0 &&
			record.box.height > 0 &&
			OBSTACLE_BODY.has(record.type) &&
			(angle === undefined || angle === 0) &&
			!nodeOfElement.has(record.id) &&
			!confirmedLabels.has(record.id) &&
			!containerOnlyIds.has(record.id)
		);
	});
	const parent = new Map<string, string>();
	const groupsById = new Map<string, string[]>();
	for (let recordIndex = 0; recordIndex < eligible.length; recordIndex += 1) {
		const record = eligible[recordIndex]!;
		parent.set(record.id!, record.id!);
		const groups = groupIds(record, budget, "container-boundary", "aggregate-model");
		groupsById.set(record.id!, groups);
	}
	const find = (id: string): string => {
		let current = id;
		while (true) {
			budget.claimWork("container-boundary", "hierarchy-query");
			const next = parent.get(current);
			if (next === current) break;
			current = next!;
		}
		let next = id;
		while (true) {
			budget.claimWork("container-boundary", "hierarchy-query");
			if (parent.get(next) === current) break;
			const previous = parent.get(next)!;
			parent.set(next, current);
			next = previous;
		}
		return current;
	};
	const join = (a: string, b: string) => {
		const aa = find(a),
			bb = find(b);
		if (aa === bb) return;
		if (compareIdentity(aa, bb) < 0) parent.set(bb, aa);
		else parent.set(aa, bb);
	};
	const firstByGroup = new Map<string, string>();
	for (let recordIndex = 0; recordIndex < eligible.length; recordIndex += 1) {
		const record = eligible[recordIndex]!;
		const groups = groupsById.get(record.id!) ?? [];
		for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
			budget.claimWork("container-boundary", "aggregate-model");
			const group = groups[groupIndex]!;
			const first = firstByGroup.get(group);
			if (first) join(first, record.id!);
			else firstByGroup.set(group, record.id!);
		}
	}
	const components = new Map<string, DecodedRecord[]>();
	for (let recordIndex = 0; recordIndex < eligible.length; recordIndex += 1) {
		const record = eligible[recordIndex]!;
		const root = find(record.id!);
		const members = components.get(root) ?? [];
		members.push(record);
		components.set(root, members);
	}
	const obstacles: InspectionObstacle[] = [];
	const qualifyingGroupedObstacleElementIds = new Set<string>();
	const aggregateFailures: AggregateCoordinateFailure[] = [];
	budget.claimWork("container-boundary", "aggregate-model", components.size);
	for (const members of components.values()) {
		const validLibrary = filteredValues(members, budget, "container-boundary", (record) =>
			Boolean(libraryAttribution(record)?.valid),
		);
		const sharedGroup = members.length >= 2;
		if (validLibrary.length === 0 && !sharedGroup) continue;
		if (sharedGroup)
			for (let memberIndex = 0; memberIndex < members.length; memberIndex += 1) {
				const member = members[memberIndex]!;
				qualifyingGroupedObstacleElementIds.add(member.id!);
			}
		const elementIds = orderedIdentities(
			collected(members, budget, "container-boundary", (record) => record.id!),
			budget,
			"container-boundary",
		);
		const uniqueGroups = new Set<string>();
		for (let memberIndex = 0; memberIndex < members.length; memberIndex += 1) {
			const member = members[memberIndex]!;
			const memberGroups = groupsById.get(member.id!) ?? [];
			for (let groupIndex = 0; groupIndex < memberGroups.length; groupIndex += 1)
				uniqueGroups.add(memberGroups[groupIndex]!);
		}
		const groups = orderedIdentities([...uniqueGroups], budget, "container-boundary");
		const library = collected(validLibrary, budget, "container-boundary", (record) => {
			const attr = libraryAttribution(record)!;
			return {
				elementId: record.id!,
				item: attr.item!,
				...(attr.source ? { source: attr.source } : {}),
			};
		});
		budget.claimSort("container-boundary", "order-events", library.length);
		const orderedLibrary = library.toSorted((a, b) => compareIdentity(a.elementId, b.elementId));
		const obstacleResult = aggregateBoxes(
			collected(members, budget, "container-boundary", (record) => record.box!),
		);
		const kind =
			validLibrary.length > 0 ? ("library-component" as const) : ("grouped-component" as const);
		const id = obstacleIdentity(elementIds);
		if (obstacleResult.kind !== "representable") {
			aggregateFailures.push({ scope: "obstacle-component", subjectId: id, members });
			continue;
		}
		obstacles.push({
			id,
			kind,
			members,
			box: obstacleResult.box,
			ref: { id, kind, elementIds, groupIds: groups, library: orderedLibrary },
		});
	}
	budget.claimSort("container-boundary", "order-events", obstacles.length);
	return {
		obstacles: obstacles.toSorted((a, b) => compareIdentity(a.id, b.id)),
		qualifyingGroupedObstacleElementIds,
		aggregateFailures,
	};
}

export function buildInspectionModel(
	records: readonly DecodedRecord[],
	budget: InspectionBudget,
): InspectionModel {
	budget.claimWork("record-analysis", "classify-records", records.length);
	const live = records.filter((record) => Boolean(record.live && record.raw));
	budget.completeRecordAnalysis(records.length);
	const byId = new Map<string, DecodedRecord>();
	const duplicateIds = new Set<string>();
	budget.claimWork("record-analysis", "classify-records", live.length);
	for (let recordIndex = 0; recordIndex < live.length; recordIndex += 1) {
		const record = live[recordIndex]!;
		if (record.id && !record.usableId) {
			duplicateIds.add(record.id);
		}
	}
	budget.claimWork("record-analysis", "classify-records", live.length);
	for (let recordIndex = 0; recordIndex < live.length; recordIndex += 1) {
		const record = live[recordIndex]!;
		if (record.usableId && record.id) {
			byId.set(record.id, record);
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
	budget.claimWork(
		"record-analysis",
		"aggregate-model",
		nodeAggregateFailures.length + obstacleAggregateFailures.length,
	);
	const aggregateFailures = [...nodeAggregateFailures, ...obstacleAggregateFailures];
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
