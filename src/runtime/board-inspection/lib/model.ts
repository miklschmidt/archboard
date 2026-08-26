import type { NodeRef, ObstacleRef } from "../schemas.js";
import type { DecodedRecord } from "./decode.js";
import { contains, unionBoxes, type ExactBox } from "./geometry.js";

export interface InspectionNode {
	id: string;
	members: DecodedRecord[];
	bodies: DecodedRecord[];
	labels: DecodedRecord[];
	aggregate: ExactBox;
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

export interface InspectionModel {
	byId: Map<string, DecodedRecord>;
	nodes: Map<string, InspectionNode>;
	nodeOfElement: Map<string, string>;
	confirmedLabels: Map<string, string>;
	containerOnlyIds: Set<string>;
	obstacles: InspectionObstacle[];
}

const CLOSED = new Set(["rectangle", "ellipse", "diamond", "frame"]);
const OBSTACLE_BODY = new Set(["rectangle", "ellipse", "diamond"]);

function object(value: unknown): Readonly<Record<string, unknown>> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? value as Readonly<Record<string, unknown>> : null;
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
		? record.raw.groupIds.filter((value): value is string => typeof value === "string" && value.length > 0)
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
	const item = typeof library.itemId === "string" && library.itemId.length > 0
		? library.itemId
		: typeof library.item === "string" && library.item.length > 0 ? library.item : undefined;
	const issues: string[] = [];
	if (!item) issues.push("itemId or item must be a nonempty string");
	if (library.source !== undefined && typeof library.source !== "string") issues.push("source must be a string");
	return {
		valid: issues.length === 0,
		...(item ? { item } : {}),
		...(typeof library.source === "string" ? { source: library.source } : {}),
		issues,
	};
}

function validBoundary(record: DecodedRecord): boolean {
	const angle = record.raw?.angle;
	return !!record.id && !!record.box && record.box.width > 0 && record.box.height > 0 &&
		!!record.type && CLOSED.has(record.type) && (angle === undefined || angle === 0);
}

export function buildInspectionModel(records: readonly DecodedRecord[]): InspectionModel {
	const live = records.filter((record) => record.live && record.raw);
	const byId = new Map<string, DecodedRecord>();
	for (const record of live) if (record.id && !byId.has(record.id)) byId.set(record.id, record);

	const confirmedLabels = new Map<string, string>();
	for (const record of live) {
		if (record.type !== "text" || !record.id) continue;
		const container = record.raw?.containerId;
		if (typeof container === "string" && container.length > 0 && container !== record.id && byId.has(container)) {
			confirmedLabels.set(record.id, container);
		}
	}

	const grouped = new Map<string, DecodedRecord[]>();
	const nodeOfElement = new Map<string, string>();
	for (const record of live) {
		const node = nodeId(record);
		if (!node || !record.id || !record.box) continue;
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
	for (const [id, members] of grouped) {
		const labels = members.filter((record) => confirmedLabels.has(record.id ?? ""));
		const bodies = members.filter((record) => !confirmedLabels.has(record.id ?? ""));
		const bodyBox = unionBoxes((bodies.length > 0 ? bodies : members).map((record) => record.box!));
		const aggregate = unionBoxes(members.map((record) => record.box!));
		if (!bodyBox || !aggregate) continue;
		const elementIds = bodies.map((record) => record.id!).toSorted();
		const labelElementIds = labels.map((record) => record.id!).toSorted();
		nodes.set(id, {
			id, members, bodies, labels, aggregate, body: bodyBox,
			boundaries: bodies.filter(validBoundary), parentId: null, children: [],
			ref: { id, elementIds, labelElementIds },
		});
	}

	for (const child of nodes.values()) {
		const candidates: Array<{ owner: InspectionNode; boundary: DecodedRecord; area: number }> = [];
		for (const owner of nodes.values()) {
			if (owner.id === child.id) continue;
			for (const boundary of owner.boundaries) {
				const area = boundary.box!.width * boundary.box!.height;
				if (area > child.body.width * child.body.height && contains(boundary.box!, child.body)) {
					candidates.push({ owner, boundary, area });
				}
			}
		}
		const selected = candidates.toSorted((a, b) =>
			a.area - b.area || a.boundary.id!.localeCompare(b.boundary.id!) || a.owner.id.localeCompare(b.owner.id)
		)[0];
		if (selected) child.parentId = selected.owner.id;
	}
	for (const node of nodes.values()) if (node.parentId) nodes.get(node.parentId)?.children.push(node.id);
	for (const node of nodes.values()) node.children.sort();

	const containerOnlyIds = new Set<string>();
	for (const record of live) {
		if (nodeOfElement.has(record.id ?? "") || !validBoundary(record)) continue;
		if ([...nodes.values()].some((node) => contains(record.box!, node.body))) containerOnlyIds.add(record.id!);
	}

	const eligible = live.filter((record) => {
		const angle = record.raw?.angle;
		return !!record.id && !!record.type && !!record.box && record.box.width > 0 && record.box.height > 0 &&
			OBSTACLE_BODY.has(record.type) && (angle === undefined || angle === 0) &&
			!nodeOfElement.has(record.id) && !confirmedLabels.has(record.id) && !containerOnlyIds.has(record.id);
	});
	const parent = new Map(eligible.map((record) => [record.id!, record.id!]));
	const find = (id: string): string => {
		let current = id;
		while (parent.get(current) !== current) current = parent.get(current)!;
		return current;
	};
	const join = (a: string, b: string) => {
		const aa = find(a), bb = find(b);
		if (aa !== bb) parent.set(bb, aa < bb ? aa : bb);
	};
	for (let i = 0; i < eligible.length; i += 1) for (let j = i + 1; j < eligible.length; j += 1) {
		const a = eligible[i]!, b = eligible[j]!;
		if (groupIds(a).some((group) => groupIds(b).includes(group))) join(a.id!, b.id!);
	}
	const components = new Map<string, DecodedRecord[]>();
	for (const record of eligible) {
		const root = find(record.id!);
		const members = components.get(root) ?? [];
		members.push(record);
		components.set(root, members);
	}
	const obstacles: InspectionObstacle[] = [];
	for (const members of components.values()) {
		const validLibrary = members.filter((record) => libraryAttribution(record)?.valid);
		const sharedGroup = members.length >= 2;
		if (validLibrary.length === 0 && !sharedGroup) continue;
		const elementIds = members.map((record) => record.id!).toSorted();
		const groups = [...new Set(members.flatMap(groupIds))].toSorted();
		const library = validLibrary.map((record) => {
			const attr = libraryAttribution(record)!;
			return { elementId: record.id!, item: attr.item!, ...(attr.source ? { source: attr.source } : {}) };
		}).toSorted((a, b) => a.elementId.localeCompare(b.elementId));
		const obstacleBox = unionBoxes(members.map((record) => record.box!))!;
		const kind = validLibrary.length > 0 ? "library-component" as const : "grouped-component" as const;
		const id = `obstacle:${elementIds.join(",")}`;
		obstacles.push({ id, kind, members, box: obstacleBox, ref: { id, kind, elementIds, groupIds: groups, library } });
	}
	obstacles.sort((a, b) => a.id.localeCompare(b.id));
	return { byId, nodes, nodeOfElement, confirmedLabels, containerOnlyIds, obstacles };
}

export function semanticParents(model: InspectionModel, startingNodeId: string | undefined): Set<string> {
	const found = new Set<string>();
	let current = startingNodeId ? model.nodes.get(startingNodeId)?.parentId : null;
	while (current && !found.has(current)) {
		found.add(current);
		current = model.nodes.get(current)?.parentId ?? null;
	}
	return found;
}
