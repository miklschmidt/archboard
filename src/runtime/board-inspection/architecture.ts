import type { ServerElement } from "@/runtime/engine/types";
import { boundingBoxOf, boxOf, type Box } from "@/runtime/engine/layout";
import { labelOf } from "@/runtime/engine/promote";
import {
	type ArchboardBlock,
	nodeIdOf,
	readElementMetadata,
	semanticElementProjection,
} from "@/runtime/engine/metadata";
import { withoutValidBridgeDecorations } from "@/runtime/board-inspection/bridge";

interface ArchitectureNode {
	readonly node: string;
	readonly elements: readonly ServerElement[];
	readonly bodyElements: readonly ServerElement[];
	readonly labelElements: readonly ServerElement[];
	readonly primary: ServerElement;
	readonly aggregateNodeFootprint: Box;
	readonly nodeBodyFootprint: Box;
	readonly metadata: ArchboardBlock;
}

interface ArchitectureConnector {
	readonly element: ServerElement;
	readonly ownerNodeId?: string;
	readonly startTargetId?: string;
	readonly endTargetId?: string;
	readonly startNodeId?: string;
	readonly endNodeId?: string;
}

interface ArchitectureFacts {
	readonly elements: readonly ServerElement[];
	readonly byId: ReadonlyMap<string, ServerElement>;
	readonly confirmedBoundLabelIds: ReadonlySet<string>;
	readonly nodeOfElement: ReadonlyMap<string, string>;
	readonly nodes: ReadonlyMap<string, ArchitectureNode>;
	readonly connectors: readonly ArchitectureConnector[];
}

const CONNECTOR_TYPES = new Set(["arrow", "line"]);

/**
 * Whether an element type is one architecture reads as a connector.
 * @param type the element type
 * @returns true for arrows and lines
 */
const isArchitectureConnectorType = (type: string): boolean => CONNECTOR_TYPES.has(type);

/**
 * The element one end of a connector is bound to, when it names one.
 * @param element the connector element
 * @param end which end to read
 * @returns the bound element id, or undefined
 */
function architectureBindingTarget(element: unknown, end: "start" | "end"): string | undefined {
	const binding = readField(element, end === "start" ? "startBinding" : "endBinding");
	const id = readField(binding, "elementId");
	return typeof id === "string" ? id : undefined;
}

/**
 * Read one field of a value that may not be an object at all.
 * @param value the value to read from
 * @param field the field name
 * @returns the field's value, or undefined when there is nothing to read
 */
function readField(value: unknown, field: string): unknown {
	if (value === null || typeof value !== "object") {
		return undefined;
	}
	return Object.hasOwn(value, field) ? Reflect.get(value, field) : undefined;
}

/**
 * The box that covers every element, which is what a node's footprint is.
 * @param elements the elements to cover
 * @returns the covering box, empty when there is nothing to cover
 */
function unionBox(elements: readonly ServerElement[]): Box {
	const frame = boundingBoxOf(elements.map((element) => boxOf(element)));
	if (!frame) {
		return { x: 0, y: 0, w: 0, h: 0 };
	}
	return {
		x: frame.minX,
		y: frame.minY,
		w: frame.maxX - frame.minX,
		h: frame.maxY - frame.minY,
	};
}

/**
 * The element a node is named by: the largest of its bodies, or of everything when a node is
 * nothing but labels.
 * @param elements the node's members
 * @param confirmedBoundLabelIds the confirmed label ids
 * @returns the primary element
 */
function primaryOf(
	elements: readonly ServerElement[],
	confirmedBoundLabelIds: ReadonlySet<string>,
): ServerElement {
	const bodies = elements.filter((element) => !confirmedBoundLabelIds.has(element.id));
	return [...(bodies.length > 0 ? bodies : elements)].toSorted(
		(a, b) => boxOf(b).w * boxOf(b).h - boxOf(a).w * boxOf(a).h,
	)[0]!;
}

/**
 * Merge the Archboard metadata of a node's members, with the primary element's block read
 * first so it wins where two members disagree.
 * @param primary the node's primary element
 * @param elements the node's members
 * @returns the merged metadata block
 */
function mergedMetadata(
	primary: ServerElement,
	elements: readonly ServerElement[],
): ArchboardBlock {
	const metadata: ArchboardBlock = {};
	for (const element of [primary, ...elements]) {
		const block = readElementMetadata(element).archboard;
		if (!block) {
			continue;
		}
		for (const [key, value] of Object.entries(block)) {
			if (metadata[key] === undefined && value !== undefined) {
				metadata[key] = value;
			}
		}
	}
	return metadata;
}

/**
 * The labels that are bound to another element of the same scene, which is what makes a text
 * element part of its container's node rather than a node of its own.
 * @param all the projected elements
 * @param byId the elements by id
 * @returns the confirmed label ids
 */
function confirmedLabelIds(
	all: readonly ServerElement[],
	byId: ReadonlyMap<string, ServerElement>,
): Set<string> {
	const confirmed = new Set<string>();
	for (const element of all) {
		if (isBoundLabel(element, byId)) {
			confirmed.add(element.id);
		}
	}
	return confirmed;
}

/**
 * Whether an element is a text label bound to a different element the scene contains.
 * @param element the element
 * @param byId the elements by id
 * @returns true for a confirmed bound label
 */
function isBoundLabel(element: ServerElement, byId: ReadonlyMap<string, ServerElement>): boolean {
	if (element.type !== "text") {
		return false;
	}
	const container = element.containerId;
	return Boolean(container) && container !== element.id && byId.has(container!);
}

/**
 * Group elements by the node they declare, then attach each confirmed label to the node of
 * its container so a label is analysed as part of the thing it names.
 * @param all the projected elements
 * @param confirmedBoundLabelIds the confirmed label ids
 * @returns members per node and the node of each member element
 */
function groupNodeMembers(
	all: readonly ServerElement[],
	confirmedBoundLabelIds: ReadonlySet<string>,
): { grouped: Map<string, ServerElement[]>; nodeOfElement: Map<string, string> } {
	const grouped = new Map<string, ServerElement[]>();
	const nodeOfElement = new Map<string, string>();
	for (const element of all) {
		const node = nodeIdOf(element);
		if (!node) {
			continue;
		}
		const members = grouped.get(node) ?? [];
		members.push(element);
		grouped.set(node, members);
		nodeOfElement.set(element.id, node);
	}
	for (const element of all) {
		attachLabelToContainer(element, confirmedBoundLabelIds, grouped, nodeOfElement);
	}
	return { grouped, nodeOfElement };
}

/**
 * Attach one confirmed label to its container's node, unless it already belongs to one.
 * @param element the element
 * @param confirmedBoundLabelIds the confirmed label ids
 * @param grouped members per node, updated in place
 * @param nodeOfElement the node of each member element, updated in place
 */
function attachLabelToContainer(
	element: ServerElement,
	confirmedBoundLabelIds: ReadonlySet<string>,
	grouped: Map<string, ServerElement[]>,
	nodeOfElement: Map<string, string>,
): void {
	if (!confirmedBoundLabelIds.has(element.id) || nodeOfElement.has(element.id)) {
		return;
	}
	const container = element.type === "text" ? element.containerId : null;
	const node = container ? nodeOfElement.get(container) : undefined;
	if (node === undefined) {
		return;
	}
	grouped.get(node)!.push(element);
	nodeOfElement.set(element.id, node);
}

/**
 * Build one architecture node from its members.
 * @param node the node id
 * @param members the node's member elements, labels included
 * @param confirmedBoundLabelIds the confirmed label ids
 * @returns the node
 */
function architectureNode(
	node: string,
	members: readonly ServerElement[],
	confirmedBoundLabelIds: ReadonlySet<string>,
): ArchitectureNode {
	const bodyElements = members.filter((element) => !confirmedBoundLabelIds.has(element.id));
	const labelElements = members.filter((element) => confirmedBoundLabelIds.has(element.id));
	const primary = primaryOf(members, confirmedBoundLabelIds);
	return {
		node,
		elements: [...members],
		bodyElements,
		labelElements,
		primary,
		aggregateNodeFootprint: unionBox(members),
		nodeBodyFootprint: unionBox(bodyElements.length > 0 ? bodyElements : members),
		metadata: mergedMetadata(primary, members),
	};
}

/**
 * Resolve every connector's endpoints to the elements and nodes they name.
 * @param all the projected elements
 * @param nodeOfElement the node of each member element
 * @returns the connectors with whatever endpoints resolved
 */
function architectureConnectors(
	all: readonly ServerElement[],
	nodeOfElement: ReadonlyMap<string, string>,
): ArchitectureConnector[] {
	const connectors: ArchitectureConnector[] = [];
	for (const element of all) {
		if (isArchitectureConnectorType(element.type)) {
			connectors.push(architectureConnector(element, nodeOfElement));
		}
	}
	return connectors;
}

/**
 * Resolve one connector's owner node and its two endpoints.
 * @param element the connector element
 * @param nodeOfElement the node of each member element
 * @returns the connector, carrying only the endpoints that resolved
 */
function architectureConnector(
	element: ServerElement,
	nodeOfElement: ReadonlyMap<string, string>,
): ArchitectureConnector {
	const startTargetId = architectureBindingTarget(element, "start");
	const endTargetId = architectureBindingTarget(element, "end");
	return {
		element,
		...optionalId("ownerNodeId", nodeOfElement.get(element.id)),
		...optionalId("startTargetId", startTargetId),
		...optionalId("endTargetId", endTargetId),
		...optionalId("startNodeId", startTargetId && nodeOfElement.get(startTargetId)),
		...optionalId("endNodeId", endTargetId && nodeOfElement.get(endTargetId)),
	};
}

/**
 * One optional identity field, present only when it resolved.
 * @param field the field name
 * @param value the resolved identity, when there is one
 * @returns the single-field object to spread, or an empty one
 */
function optionalId(field: string, value: string | undefined | false): Record<string, string> {
	return value ? { [field]: value } : {};
}

/**
 * Read architecture identity and ownership from an already-ingested scene.
 *
 * This entrypoint is deliberately smaller than inspection. Compare supplies
 * strict ServerElements and gets only the shared facts that define nodes,
 * labels, connectors, footprints, and endpoint resolution.
 * @param elements the ingested scene
 * @returns the architecture facts
 */
function architectureFacts(elements: readonly ServerElement[]): ArchitectureFacts {
	const all = withoutValidBridgeDecorations(elements.map(semanticElementProjection));
	const byId = new Map(all.map((element) => [element.id, element]));
	const confirmedBoundLabelIds = confirmedLabelIds(all, byId);
	const { grouped, nodeOfElement } = groupNodeMembers(all, confirmedBoundLabelIds);
	const nodes = new Map<string, ArchitectureNode>();
	for (const [node, members] of grouped) {
		nodes.set(node, architectureNode(node, members, confirmedBoundLabelIds));
	}
	return {
		elements: all,
		byId,
		confirmedBoundLabelIds,
		nodeOfElement,
		nodes,
		connectors: architectureConnectors(all, nodeOfElement),
	};
}

/**
 * The single-line text of an element's label, as architecture compares it.
 * @param element the element
 * @param elements the scene the label may live in
 * @returns the collapsed label text, or undefined when there is none
 */
function architectureLabel(
	element: ServerElement,
	elements: readonly ServerElement[],
): string | undefined {
	const text = labelOf(element, [...elements]);
	if (text === undefined) {
		return undefined;
	}
	return text.replaceAll(/\s+/gu, " ").trim() || undefined;
}

export {
	type ArchitectureNode,
	type ArchitectureConnector,
	type ArchitectureFacts,
	isArchitectureConnectorType,
	architectureBindingTarget,
	architectureFacts,
	architectureLabel,
};
