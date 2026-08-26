import type { NodeRef, ObstacleRef } from "../schemas.js";
import type { DecodedRecord } from "./decode.js";
import { aggregateBoxes, contains, type ExactBox } from "./geometry.js";

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
}

const CLOSED = new Set(["rectangle", "ellipse", "diamond", "frame"]);
const OBSTACLE_BODY = new Set(["rectangle", "ellipse", "diamond"]);

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
	if (library.source !== undefined && typeof library.source !== "string")
		issues.push("source must be a string");
	return {
		valid: issues.length === 0,
		...(item ? { item } : {}),
		...(typeof library.source === "string" ? { source: library.source } : {}),
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
): Pick<InspectionModel, "labelOwnership" | "confirmedLabels"> {
	const reverseLabelOwners = new Map<string, Set<string>>();
	const labelsWithBlockedReverseClassification = new Set<string>();
	for (const owner of live) {
		if (!owner.id || owner.raw?.boundElements == null) continue;
		const bounds = classifyBoundElements(owner.raw.boundElements);
		for (const reference of bounds.readableEntries) {
			if (reference.type !== "text" || byId.get(reference.id)?.type !== "text") continue;
			if (!owner.usableId) {
				labelsWithBlockedReverseClassification.add(reference.id);
				continue;
			}
			const owners = reverseLabelOwners.get(reference.id) ?? new Set<string>();
			owners.add(owner.id);
			reverseLabelOwners.set(reference.id, owners);
			if (bounds.problems.length > 0) labelsWithBlockedReverseClassification.add(reference.id);
		}
	}
	const labelOwnership = new Map<string, LabelOwnershipClassification>();
	const confirmedLabels = new Map<string, string>();
	for (const record of live) {
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
		const reverseOwnerIds = [...(reverseLabelOwners.get(record.id) ?? [])].toSorted();
		const candidateOwnerIds = [
			...new Set([...(forwardOwnerId ? [forwardOwnerId] : []), ...reverseOwnerIds]),
		].toSorted();
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
		if (resolvedOwnerId && resolvedOwnerId !== record.id && byId.has(resolvedOwnerId))
			confirmedLabels.set(record.id, resolvedOwnerId);
	}
	return { labelOwnership, confirmedLabels };
}

function buildNodes(
	live: readonly DecodedRecord[],
	byId: ReadonlyMap<string, DecodedRecord>,
	confirmedLabels: ReadonlyMap<string, string>,
): Pick<InspectionModel, "nodes" | "nodeOfElement" | "aggregateFailures"> {
	const grouped = new Map<string, DecodedRecord[]>();
	const nodeOfElement = new Map<string, string>();
	for (const record of live) {
		const node = nodeId(record);
		if (!node || !record.usableId || !record.id || !record.box) continue;
		const members = grouped.get(node) ?? [];
		members.push(record);
		grouped.set(node, members);
		nodeOfElement.set(record.id, node);
	}
	for (const [labelId, containerId] of confirmedLabels) {
		const owner = nodeOfElement.get(containerId);
		const label = byId.get(labelId);
		if (!owner || !label || nodeOfElement.has(labelId) || !label.box) continue;
		grouped.get(owner)!.push(label);
		nodeOfElement.set(labelId, owner);
	}

	const nodes = new Map<string, InspectionNode>();
	const aggregateFailures: AggregateCoordinateFailure[] = [];
	for (const [id, members] of grouped) {
		const labels = members.filter((record) => confirmedLabels.has(record.id ?? ""));
		const bodies = members.filter((record) => !confirmedLabels.has(record.id ?? ""));
		const bodyMembers = bodies.length > 0 ? bodies : members;
		const bodyResult = aggregateBoxes(bodyMembers.map((record) => record.box!));
		const aggregateResult = aggregateBoxes(members.map((record) => record.box!));
		if (bodyResult.kind !== "representable") {
			aggregateFailures.push({ scope: "semantic-node-body", subjectId: id, members: bodyMembers });
			for (const member of members) if (member.id) nodeOfElement.delete(member.id);
			continue;
		}
		const aggregate = aggregateResult.kind === "representable" ? aggregateResult.box : null;
		if (!aggregate)
			aggregateFailures.push({ scope: "semantic-node-aggregate", subjectId: id, members });
		const elementIds = bodies.map((record) => record.id!).toSorted();
		const labelElementIds = labels.map((record) => record.id!).toSorted();
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

function compareArea(a: ExactBox, b: ExactBox): number {
	const aa = areaFactor(a);
	const bb = areaFactor(b);
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

function assignNodeHierarchy(nodes: Map<string, InspectionNode>): void {
	for (const child of nodes.values()) {
		const candidates: Array<{ owner: InspectionNode; boundary: DecodedRecord }> = [];
		for (const owner of nodes.values()) {
			if (owner.id === child.id) continue;
			for (const boundary of owner.boundaries) {
				if (compareArea(boundary.box!, child.body) > 0 && contains(boundary.box!, child.body)) {
					candidates.push({ owner, boundary });
				}
			}
		}
		const selected = candidates.toSorted(
			(a, b) =>
				compareArea(a.boundary.box!, b.boundary.box!) ||
				a.boundary.id!.localeCompare(b.boundary.id!) ||
				a.owner.id.localeCompare(b.owner.id),
		)[0];
		if (selected) child.parentId = selected.owner.id;
	}
	for (const node of nodes.values())
		if (node.parentId) nodes.get(node.parentId)?.children.push(node.id);
	for (const node of nodes.values()) node.children.sort();
}

function buildConnectorEndpoints(
	live: readonly DecodedRecord[],
	nodeOfElement: ReadonlyMap<string, string>,
	duplicateIds: ReadonlySet<string>,
): Map<string, ConnectorEndpointClassification> {
	const connectorEndpoints = new Map<string, ConnectorEndpointClassification>();
	for (const record of live) {
		if (!record.usableId || !record.id || (record.type !== "arrow" && record.type !== "line"))
			continue;
		const endpoint = (end: "start" | "end") => {
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
): Set<string> {
	const containerOnlyIds = new Set<string>();
	for (const record of live) {
		if (nodeOfElement.has(record.id ?? "") || !validBoundary(record)) continue;
		if ([...nodes.values()].some((node) => contains(record.box!, node.body)))
			containerOnlyIds.add(record.id!);
	}
	return containerOnlyIds;
}

function buildObstacles(
	live: readonly DecodedRecord[],
	nodeOfElement: ReadonlyMap<string, string>,
	confirmedLabels: ReadonlyMap<string, string>,
	containerOnlyIds: ReadonlySet<string>,
): Pick<
	InspectionModel,
	"obstacles" | "qualifyingGroupedObstacleElementIds" | "aggregateFailures"
> {
	const eligible = live.filter((record) => {
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
	const parent = new Map(eligible.map((record) => [record.id!, record.id!]));
	const groupsById = new Map(eligible.map((record) => [record.id!, groupIds(record)]));
	const find = (id: string): string => {
		let current = id;
		while (parent.get(current) !== current) current = parent.get(current)!;
		let next = id;
		while (parent.get(next) !== current) {
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
		if (aa < bb) parent.set(bb, aa);
		else parent.set(aa, bb);
	};
	const firstByGroup = new Map<string, string>();
	for (const record of eligible)
		for (const group of groupsById.get(record.id!) ?? []) {
			const first = firstByGroup.get(group);
			if (first) join(first, record.id!);
			else firstByGroup.set(group, record.id!);
		}
	const components = new Map<string, DecodedRecord[]>();
	for (const record of eligible) {
		const root = find(record.id!);
		const members = components.get(root) ?? [];
		members.push(record);
		components.set(root, members);
	}
	const obstacles: InspectionObstacle[] = [];
	const qualifyingGroupedObstacleElementIds = new Set<string>();
	const aggregateFailures: AggregateCoordinateFailure[] = [];
	for (const members of components.values()) {
		const validLibrary = members.filter((record) => libraryAttribution(record)?.valid);
		const sharedGroup = members.length >= 2;
		if (validLibrary.length === 0 && !sharedGroup) continue;
		if (sharedGroup)
			for (const member of members) qualifyingGroupedObstacleElementIds.add(member.id!);
		const elementIds = members.map((record) => record.id!).toSorted();
		const groups = [
			...new Set(members.flatMap((record) => groupsById.get(record.id!) ?? [])),
		].toSorted();
		const library = validLibrary
			.map((record) => {
				const attr = libraryAttribution(record)!;
				return {
					elementId: record.id!,
					item: attr.item!,
					...(attr.source ? { source: attr.source } : {}),
				};
			})
			.toSorted((a, b) => a.elementId.localeCompare(b.elementId));
		const obstacleResult = aggregateBoxes(members.map((record) => record.box!));
		const kind =
			validLibrary.length > 0 ? ("library-component" as const) : ("grouped-component" as const);
		const id = `obstacle:${elementIds.join(",")}`;
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
	obstacles.sort((a, b) => a.id.localeCompare(b.id));
	return { obstacles, qualifyingGroupedObstacleElementIds, aggregateFailures };
}

export function buildInspectionModel(records: readonly DecodedRecord[]): InspectionModel {
	const live = records.filter((record) => record.live && record.raw);
	const byId = new Map<string, DecodedRecord>();
	const duplicateIds = new Set<string>();
	for (const record of live) if (record.id && !record.usableId) duplicateIds.add(record.id);
	for (const record of live) if (record.usableId && record.id) byId.set(record.id, record);
	const { labelOwnership, confirmedLabels } = buildLabelClassifications(live, byId, duplicateIds);
	const {
		nodes,
		nodeOfElement,
		aggregateFailures: nodeAggregateFailures,
	} = buildNodes(live, byId, confirmedLabels);
	assignNodeHierarchy(nodes);
	const connectorEndpoints = buildConnectorEndpoints(live, nodeOfElement, duplicateIds);
	const containerOnlyIds = findContainerOnlyIds(live, nodes, nodeOfElement);
	const {
		obstacles,
		qualifyingGroupedObstacleElementIds,
		aggregateFailures: obstacleAggregateFailures,
	} = buildObstacles(live, nodeOfElement, confirmedLabels, containerOnlyIds);
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
