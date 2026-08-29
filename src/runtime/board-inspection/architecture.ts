import type { ServerElement } from "../engine/types.js";
import { boundingBoxOf, boxOf, type Box } from "../engine/layout.js";
import { labelOf } from "../engine/promote.js";
import {
	type ArchboardBlock,
	nodeIdOf,
	readElementMetadata,
	semanticElementProjection,
} from "../engine/metadata.js";
import { withoutValidBridgeDecorations } from "./bridge.js";

export interface ArchitectureNode {
	readonly node: string;
	readonly elements: readonly ServerElement[];
	readonly bodyElements: readonly ServerElement[];
	readonly labelElements: readonly ServerElement[];
	readonly primary: ServerElement;
	readonly aggregateNodeFootprint: Box;
	readonly nodeBodyFootprint: Box;
	readonly metadata: ArchboardBlock;
}

export interface ArchitectureConnector {
	readonly element: ServerElement;
	readonly ownerNodeId?: string;
	readonly startTargetId?: string;
	readonly endTargetId?: string;
	readonly startNodeId?: string;
	readonly endNodeId?: string;
}

export interface ArchitectureFacts {
	readonly elements: readonly ServerElement[];
	readonly byId: ReadonlyMap<string, ServerElement>;
	readonly confirmedBoundLabelIds: ReadonlySet<string>;
	readonly nodeOfElement: ReadonlyMap<string, string>;
	readonly nodes: ReadonlyMap<string, ArchitectureNode>;
	readonly connectors: readonly ArchitectureConnector[];
}

const CONNECTOR_TYPES = new Set(["arrow", "line"]);

export const isArchitectureConnectorType = (type: string): boolean => CONNECTOR_TYPES.has(type);

export function architectureBindingTarget(
	element: unknown,
	end: "start" | "end",
): string | undefined {
	const record = element && typeof element === "object" ? (element as Record<string, unknown>) : {};
	const binding = end === "start" ? record.startBinding : record.endBinding;
	const bindingRecord =
		binding && typeof binding === "object" ? (binding as Record<string, unknown>) : {};
	const id = bindingRecord.elementId;
	return typeof id === "string" ? id : undefined;
}

function unionBox(elements: readonly ServerElement[]): Box {
	const frame = boundingBoxOf(elements.map((element) => boxOf(element)));
	if (!frame) return { x: 0, y: 0, w: 0, h: 0 };
	return {
		x: frame.minX,
		y: frame.minY,
		w: frame.maxX - frame.minX,
		h: frame.maxY - frame.minY,
	};
}

function primaryOf(
	elements: readonly ServerElement[],
	confirmedBoundLabelIds: ReadonlySet<string>,
): ServerElement {
	const bodies = elements.filter((element) => !confirmedBoundLabelIds.has(element.id));
	return [...(bodies.length > 0 ? bodies : elements)].toSorted(
		(a, b) => boxOf(b).w * boxOf(b).h - boxOf(a).w * boxOf(a).h,
	)[0]!;
}

function mergedMetadata(
	primary: ServerElement,
	elements: readonly ServerElement[],
): ArchboardBlock {
	const metadata: ArchboardBlock = {};
	for (const element of [primary, ...elements]) {
		const block = readElementMetadata(element).archboard;
		if (!block) continue;
		for (const [key, value] of Object.entries(block)) {
			if (metadata[key] === undefined && value !== undefined) metadata[key] = value;
		}
	}
	return metadata;
}

/**
 * Read architecture identity and ownership from an already-ingested scene.
 *
 * This entrypoint is deliberately smaller than inspection. Compare supplies
 * strict ServerElements and gets only the shared facts that define nodes,
 * labels, connectors, footprints, and endpoint resolution.
 */
export function architectureFacts(elements: readonly ServerElement[]): ArchitectureFacts {
	const all = withoutValidBridgeDecorations(elements.map(semanticElementProjection));
	const byId = new Map(all.map((element) => [element.id, element]));
	const confirmedBoundLabelIds = new Set<string>();
	for (const element of all) {
		if (
			element.type === "text" &&
			element.containerId &&
			element.containerId !== element.id &&
			byId.has(element.containerId)
		) {
			confirmedBoundLabelIds.add(element.id);
		}
	}

	const grouped = new Map<string, ServerElement[]>();
	const nodeOfElement = new Map<string, string>();
	for (const element of all) {
		const node = nodeIdOf(element);
		if (!node) continue;
		const members = grouped.get(node) ?? [];
		members.push(element);
		grouped.set(node, members);
		nodeOfElement.set(element.id, node);
	}
	for (const element of all) {
		const container = element.type === "text" ? element.containerId : null;
		if (!confirmedBoundLabelIds.has(element.id) || !container) continue;
		const node = nodeOfElement.get(container);
		if (!node || nodeOfElement.has(element.id)) continue;
		grouped.get(node)!.push(element);
		nodeOfElement.set(element.id, node);
	}

	const nodes = new Map<string, ArchitectureNode>();
	for (const [node, members] of grouped) {
		const bodyElements = members.filter((element) => !confirmedBoundLabelIds.has(element.id));
		const labelElements = members.filter((element) => confirmedBoundLabelIds.has(element.id));
		const primary = primaryOf(members, confirmedBoundLabelIds);
		nodes.set(node, {
			node,
			elements: members,
			bodyElements,
			labelElements,
			primary,
			aggregateNodeFootprint: unionBox(members),
			nodeBodyFootprint: unionBox(bodyElements.length > 0 ? bodyElements : members),
			metadata: mergedMetadata(primary, members),
		});
	}

	const connectors: ArchitectureConnector[] = [];
	for (const element of all) {
		if (!isArchitectureConnectorType(element.type)) continue;
		const startTargetId = architectureBindingTarget(element, "start");
		const endTargetId = architectureBindingTarget(element, "end");
		connectors.push({
			element,
			...(nodeOfElement.get(element.id) ? { ownerNodeId: nodeOfElement.get(element.id)! } : {}),
			...(startTargetId ? { startTargetId } : {}),
			...(endTargetId ? { endTargetId } : {}),
			...(startTargetId && nodeOfElement.get(startTargetId)
				? { startNodeId: nodeOfElement.get(startTargetId)! }
				: {}),
			...(endTargetId && nodeOfElement.get(endTargetId)
				? { endNodeId: nodeOfElement.get(endTargetId)! }
				: {}),
		});
	}

	return {
		elements: all,
		byId,
		confirmedBoundLabelIds,
		nodeOfElement,
		nodes,
		connectors,
	};
}

export function architectureLabel(
	element: ServerElement,
	elements: readonly ServerElement[],
): string | undefined {
	const text = labelOf(element, elements as ServerElement[]);
	return text ? String(text).replace(/\s+/g, " ").trim() || undefined : undefined;
}
