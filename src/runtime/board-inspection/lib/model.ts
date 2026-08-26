import type { NodeRef, ObstacleRef } from "../schemas.js";
import type { DecodedRecord } from "./decode.js";
import { aggregateBoxes, contains, type ExactBox } from "./geometry.js";
import { sweepIntervalPairs, type SweepWork } from "./interval-sweep.js";
import {
	comparePreprocessingIdentity,
	encodePreprocessingObstacleIdentity,
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
	budget.charge(pass, "prepare-events");
	const output: U[] = [];
	for (const value of values) {
		budget.charge(pass, "prepare-events", 2);
		output.push(mapValue(value));
	}
	return output;
}

function filteredValues<T>(
	values: readonly T[],
	budget: PreprocessingBudget,
	pass: ModelPass,
	keep: (value: T) => boolean,
): T[] {
	budget.charge(pass, "prepare-events");
	const output: T[] = [];
	for (const value of values) {
		budget.charge(pass, "prepare-events");
		if (!keep(value)) continue;
		budget.charge(pass, "prepare-events");
		output.push(value);
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
	budget: PreprocessingBudget,
): Pick<InspectionModel, "labelOwnership" | "confirmedLabels"> {
	const reverseLabelOwners = new Map<string, Set<string>>();
	const labelsWithBlockedReverseClassification = new Set<string>();
	for (const owner of live) {
		budget.charge("node-hierarchy", "prepare-events");
		chargeIdentity(budget, "node-hierarchy", owner.id);
		if (!owner.id || owner.raw?.boundElements == null) continue;
		if (Array.isArray(owner.raw.boundElements))
			for (const entry of owner.raw.boundElements) {
				budget.charge("node-hierarchy", "prepare-events");
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
		for (const reference of bounds.readableEntries) {
			budget.charge("node-hierarchy", "prepare-events", 2);
			if (reference.type !== "text" || byId.get(reference.id)?.type !== "text") continue;
			if (!owner.usableId) {
				budget.charge("node-hierarchy", "prepare-events");
				labelsWithBlockedReverseClassification.add(reference.id);
				continue;
			}
			budget.charge("node-hierarchy", "prepare-events");
			const owners = reverseLabelOwners.get(reference.id) ?? new Set<string>();
			budget.charge("node-hierarchy", "prepare-events");
			owners.add(owner.id);
			budget.charge("node-hierarchy", "prepare-events");
			reverseLabelOwners.set(reference.id, owners);
			if (bounds.problems.length > 0) {
				budget.charge("node-hierarchy", "prepare-events");
				labelsWithBlockedReverseClassification.add(reference.id);
			}
		}
	}
	const labelOwnership = new Map<string, LabelOwnershipClassification>();
	const confirmedLabels = new Map<string, string>();
	for (const record of live) {
		budget.charge("node-hierarchy", "prepare-events");
		chargeIdentity(budget, "node-hierarchy", record.id);
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
		budget.charge("node-hierarchy", "prepare-events", 3);
		const reverseOwnerIds = orderedIdentities(
			[...(reverseLabelOwners.get(record.id) ?? [])],
			budget,
			"node-hierarchy",
		);
		const candidateOwnerIds = orderedIdentities(
			[...new Set([...(forwardOwnerId ? [forwardOwnerId] : []), ...reverseOwnerIds])],
			budget,
			"node-hierarchy",
		);
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
		budget.charge("node-hierarchy", "prepare-events");
		labelOwnership.set(record.id, classification);
		budget.charge("node-hierarchy", "prepare-events");
		if (resolvedOwnerId && resolvedOwnerId !== record.id && byId.has(resolvedOwnerId)) {
			budget.charge("node-hierarchy", "prepare-events");
			confirmedLabels.set(record.id, resolvedOwnerId);
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
	const grouped = new Map<string, DecodedRecord[]>();
	const nodeOfElement = new Map<string, string>();
	for (const record of live) {
		budget.charge("node-hierarchy", "prepare-events");
		const node = nodeId(record);
		chargeIdentity(budget, "node-hierarchy", node);
		if (!node || !record.usableId || !record.id || !record.box) continue;
		budget.charge("node-hierarchy", "prepare-events");
		const members = grouped.get(node) ?? [];
		members.push(record);
		budget.charge("node-hierarchy", "prepare-events", 2);
		grouped.set(node, members);
		nodeOfElement.set(record.id, node);
	}
	for (const [labelId, containerId] of confirmedLabels) {
		budget.charge("node-hierarchy", "prepare-events", 3);
		const owner = nodeOfElement.get(containerId);
		const label = byId.get(labelId);
		if (!owner || !label || nodeOfElement.has(labelId) || !label.box) continue;
		budget.charge("node-hierarchy", "prepare-events", 2);
		grouped.get(owner)!.push(label);
		nodeOfElement.set(labelId, owner);
	}

	const nodes = new Map<string, InspectionNode>();
	const aggregateFailures: AggregateCoordinateFailure[] = [];
	for (const [id, members] of grouped) {
		budget.charge("node-hierarchy", "prepare-events", members.length * 3 + 1);
		const labels = members.filter((record) => confirmedLabels.has(record.id ?? ""));
		const bodies = members.filter((record) => !confirmedLabels.has(record.id ?? ""));
		const bodyMembers = bodies.length > 0 ? bodies : members;
		const bodyResult = aggregateBoxes(
			collected(bodyMembers, budget, "node-hierarchy", (record) => record.box!),
		);
		const aggregateResult = aggregateBoxes(
			collected(members, budget, "node-hierarchy", (record) => record.box!),
		);
		if (bodyResult.kind !== "representable") {
			aggregateFailures.push({ scope: "semantic-node-body", subjectId: id, members: bodyMembers });
			for (const member of members)
				if (member.id) {
					budget.charge("node-hierarchy", "prepare-events");
					nodeOfElement.delete(member.id);
				}
			continue;
		}
		const aggregate = aggregateResult.kind === "representable" ? aggregateResult.box : null;
		if (!aggregate)
			aggregateFailures.push({ scope: "semantic-node-aggregate", subjectId: id, members });
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
		budget.charge("node-hierarchy", "prepare-events");
		nodes.set(id, {
			id,
			members,
			bodies,
			labels,
			aggregate,
			body: bodyResult.box,
			boundaries: bodies.filter(validBoundary),
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
	budget: PreprocessingBudget,
): SweepWork {
	budget.charge("node-hierarchy", "prepare-events");
	const children: InspectionNode[] = [];
	for (const node of nodes.values()) {
		budget.charge("node-hierarchy", "prepare-events", 2);
		children.push(node);
	}
	budget.charge("node-hierarchy", "prepare-events");
	const boundaries: Array<{ owner: InspectionNode; boundary: DecodedRecord }> = [];
	for (const owner of children)
		for (const boundary of owner.boundaries) {
			budget.charge("node-hierarchy", "prepare-events", 2);
			boundaries.push({ owner, boundary });
		}
	budget.charge("node-hierarchy", "prepare-events", 2);
	const childAreas = new Map<string, BinaryFactor>();
	for (const child of children) {
		budget.charge("node-hierarchy", "prepare-events", 2);
		childAreas.set(child.id, areaFactor(child.body));
	}
	const boundaryAreas = new Map<DecodedRecord, BinaryFactor>();
	for (const { boundary } of boundaries) {
		budget.charge("node-hierarchy", "prepare-events", 2);
		boundaryAreas.set(boundary, areaFactor(boundary.box!));
	}
	const selectedByChild = new Map<string, { owner: InspectionNode; boundary: DecodedRecord }>();
	const candidateOrder = (
		a: { owner: InspectionNode; boundary: DecodedRecord },
		b: { owner: InspectionNode; boundary: DecodedRecord },
	) =>
		compareAreaFactors(boundaryAreas.get(a.boundary)!, boundaryAreas.get(b.boundary)!) ||
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
			semantics: { partition: child.id, excludedPartitions: new Set([child.id]) },
		})),
		collected(boundaries, budget, "node-hierarchy", ({ owner, boundary }) => ({
			id: boundary.id!,
			min: boundary.box!.x,
			max: boundary.box!.x + boundary.box!.width,
			value: { owner, boundary },
			semantics: { partition: owner.id, excludedPartitions: new Set([owner.id]) },
		})),
		false,
		(childInterval, boundaryInterval) => {
			budget.charge("node-hierarchy", "hierarchy-query", 4);
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
	for (const child of children) {
		budget.charge("node-hierarchy", "hierarchy-query");
		const selected = selectedByChild.get(child.id);
		if (selected) child.parentId = selected.owner.id;
	}
	work.peakRetainedSelections = selectedByChild.size;
	for (const node of nodes.values())
		if (node.parentId) {
			budget.charge("node-hierarchy", "hierarchy-query");
			nodes.get(node.parentId)?.children.push(node.id);
		}
	for (const node of nodes.values())
		node.children = orderedIdentities(node.children, budget, "node-hierarchy");
	return work;
}

function buildConnectorEndpoints(
	live: readonly DecodedRecord[],
	nodeOfElement: ReadonlyMap<string, string>,
	duplicateIds: ReadonlySet<string>,
	budget: PreprocessingBudget,
): Map<string, ConnectorEndpointClassification> {
	const connectorEndpoints = new Map<string, ConnectorEndpointClassification>();
	for (const record of live) {
		budget.charge("node-hierarchy", "prepare-events");
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
					(target.readableTargetId !== null && duplicateIds.has(target.readableTargetId)),
				node: target.readableTargetId ? nodeOfElement.get(target.readableTargetId) : undefined,
			};
		};
		const start = endpoint("start");
		const end = endpoint("end");
		budget.charge("node-hierarchy", "prepare-events");
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
	budget: PreprocessingBudget,
): { ids: Set<string>; work: SweepWork } {
	const containerOnlyIds = new Set<string>();
	const boundaries = filteredValues(live, budget, "container-boundary", (record) => {
		return !nodeOfElement.has(record.id ?? "") && validBoundary(record);
	});
	const work = sweepIntervalPairs(
		collected(boundaries, budget, "container-boundary", (record) => ({
			id: record.id!,
			min: record.box!.x,
			max: record.box!.x + record.box!.width,
			value: record,
			semantics: { partition: record.id!, excludedPartitions: new Set<string>() },
		})),
		collected([...nodes.values()], budget, "container-boundary", (node) => ({
			id: node.id,
			min: node.body.x,
			max: node.body.x + node.body.width,
			value: node,
			semantics: { partition: node.id, excludedPartitions: new Set<string>() },
		})),
		false,
		(boundary, node) => {
			budget.charge("container-boundary", "hierarchy-query");
			if (contains(boundary.value.box!, node.value.body)) {
				budget.charge("container-boundary", "hierarchy-query");
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
	budget: PreprocessingBudget,
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
	const parent = new Map(
		collected(eligible, budget, "container-boundary", (record) => {
			budget.charge("container-boundary", "prepare-events");
			return [record.id!, record.id!];
		}),
	);
	const groupsById = new Map(
		collected(eligible, budget, "container-boundary", (record) => {
			budget.charge("container-boundary", "prepare-events");
			const groups = groupIds(record);
			for (const group of groups) chargeIdentity(budget, "container-boundary", group);
			return [record.id!, groups];
		}),
	);
	const find = (id: string): string => {
		let current = id;
		while (true) {
			budget.charge("container-boundary", "hierarchy-query");
			const next = parent.get(current);
			if (next === current) break;
			current = next!;
		}
		let next = id;
		while (true) {
			budget.charge("container-boundary", "hierarchy-query");
			if (parent.get(next) === current) break;
			budget.charge("container-boundary", "hierarchy-query");
			const previous = parent.get(next)!;
			budget.charge("container-boundary", "hierarchy-query");
			parent.set(next, current);
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
		budget.charge("container-boundary", "hierarchy-query");
		if (compared < 0) parent.set(bb, aa);
		else parent.set(aa, bb);
	};
	const firstByGroup = new Map<string, string>();
	for (const record of eligible)
		for (const group of groupsById.get(record.id!) ?? []) {
			budget.charge("container-boundary", "prepare-events");
			const first = firstByGroup.get(group);
			if (first) join(first, record.id!);
			else {
				budget.charge("container-boundary", "prepare-events");
				firstByGroup.set(group, record.id!);
			}
		}
	const components = new Map<string, DecodedRecord[]>();
	for (const record of eligible) {
		budget.charge("container-boundary", "prepare-events", 2);
		const root = find(record.id!);
		const members = components.get(root) ?? [];
		members.push(record);
		budget.charge("container-boundary", "prepare-events");
		components.set(root, members);
	}
	const obstacles: InspectionObstacle[] = [];
	const qualifyingGroupedObstacleElementIds = new Set<string>();
	const aggregateFailures: AggregateCoordinateFailure[] = [];
	for (const members of components.values()) {
		const validLibrary = members.filter((record) => {
			budget.charge("container-boundary", "prepare-events");
			return libraryAttribution(record)?.valid;
		});
		const sharedGroup = members.length >= 2;
		if (validLibrary.length === 0 && !sharedGroup) continue;
		if (sharedGroup)
			for (const member of members) {
				budget.charge("container-boundary", "prepare-events");
				qualifyingGroupedObstacleElementIds.add(member.id!);
			}
		const elementIds = orderedIdentities(
			collected(members, budget, "container-boundary", (record) => record.id!),
			budget,
			"container-boundary",
		);
		const groups = orderedIdentities(
			[
				...new Set(
					members.flatMap((record) => {
						budget.charge("container-boundary", "prepare-events");
						return groupsById.get(record.id!) ?? [];
					}),
				),
			],
			budget,
			"container-boundary",
		);
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
			aggregateFailures.push({ scope: "obstacle-component", subjectId: id, members });
			continue;
		}
		obstacles.push({
			id,
			kind,
			members,
			box: obstacleResult.box,
			ref: { id, kind, elementIds, groupIds: groups, library },
		});
	}
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
	const live = records.filter((record) => {
		budget.charge("node-hierarchy", "prepare-events");
		return record.live && record.raw;
	});
	const byId = new Map<string, DecodedRecord>();
	const duplicateIds = new Set<string>();
	for (const record of live) {
		budget.charge("node-hierarchy", "prepare-events");
		chargeIdentity(budget, "node-hierarchy", record.id);
		if (record.id && !record.usableId) {
			budget.charge("node-hierarchy", "prepare-events");
			duplicateIds.add(record.id);
		}
	}
	for (const record of live) {
		budget.charge("node-hierarchy", "prepare-events");
		if (record.usableId && record.id) {
			budget.charge("node-hierarchy", "prepare-events");
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
		aggregateFailures: [...nodeAggregateFailures, ...obstacleAggregateFailures],
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
