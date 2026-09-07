import type { ServerElement } from "@/runtime/engine/types";
import { intersectSegments, type Segment } from "@/runtime/board-inspection/lib/geometry";
import { compareIdentity } from "@/runtime/board-inspection/lib/ordering";
import type { BridgeIncompleteIssue, BridgeStaleIssue } from "@/runtime/board-inspection/schemas";
import {
	BridgeMetadataSchema,
	strokeStyleOf,
	type BridgeMetadata,
	type BridgePart,
	type InvalidBridgeDecoration,
	type ValidBridgeDecoration,
} from "@/runtime/board-inspection/lib/bridge-contract";
import {
	bridgeCandidate,
	lineMatches,
	sameFacts,
	samePoint,
	supportedConnector,
} from "@/runtime/board-inspection/lib/bridge-parts";

/** What one bridge's two sources resolve to on the board as it is now. */
interface ResolvedSources {
	readonly overElement: ServerElement;
	readonly underElement: ServerElement;
	readonly overSegments: readonly Segment[];
	readonly underSegments: readonly Segment[];
}

/** Where each element of a bridge sits in the board's live paint order. */
interface PaintOrder {
	readonly maskPosition: number;
	readonly redrawPosition: number;
	readonly overPosition: number;
	readonly underPosition: number;
	readonly duplicatePartIndex: boolean;
}

/**
 * The bridge id a malformed block still names, when it names one at all.
 * @param value the raw block
 * @returns the id, or null
 */
function partialBridgeId(value: unknown): string | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}
	const id: unknown = Reflect.get(value, "bridgeId");
	return typeof id === "string" && id.length > 0 ? id : null;
}

/**
 * Group every element that claims to be part of a bridge by the bridge it names, reporting
 * the ones whose block does not read at all.
 * @param elements the board's elements
 * @param invalid the accumulating invalid decorations, updated in place
 * @returns the parts of each named bridge
 */
function groupBridgeParts(
	elements: readonly ServerElement[],
	invalid: InvalidBridgeDecoration[],
): Map<string, BridgePart[]> {
	const grouped = new Map<string, BridgePart[]>();
	for (const element of elements) {
		const marker = bridgeCandidate(element);
		if (!marker.present) {
			continue;
		}
		const parsed = BridgeMetadataSchema.safeParse(marker.value);
		if (!parsed.success) {
			invalid.push({
				bridgeId: partialBridgeId(marker.value),
				reason: "incomplete-decoration",
				issue: "malformed-metadata",
				elements: [element],
			});
			continue;
		}
		const group = grouped.get(parsed.data.bridgeId) ?? [];
		group.push({ element, metadata: parsed.data });
		grouped.set(parsed.data.bridgeId, group);
	}
	return grouped;
}

/**
 * Whether every part of a bridge is a live line with an identity, which is the least a
 * decoration must be before its two halves can be compared.
 * @param parts the bridge's parts
 * @returns the issue, or null
 */
function partShapeIssue(parts: readonly BridgePart[]): BridgeIncompleteIssue | null {
	if (parts.some((part) => part.element.type !== "line")) {
		return "non-line-part";
	}
	if (parts.some((part) => !isLivingIdentifiedPart(part))) {
		return "malformed-metadata";
	}
	return null;
}

/**
 * Whether one part is live and carries an identity.
 * @param part the bridge part
 * @returns true when the part is usable
 */
function isLivingIdentifiedPart(part: BridgePart): boolean {
	return (
		!part.element.isDeleted && typeof part.element.id === "string" && part.element.id.length > 0
	);
}

/**
 * Whether a bridge has exactly one mask and one redraw.
 * @param masks the parts claiming the mask role
 * @param redraws the parts claiming the redraw role
 * @returns the issue, or null
 */
function partCountIssue(
	masks: readonly BridgePart[],
	redraws: readonly BridgePart[],
): BridgeIncompleteIssue | null {
	if (masks.length === 0) {
		return "missing-mask";
	}
	if (redraws.length === 0) {
		return "missing-redraw";
	}
	if (masks.length > 1) {
		return "duplicate-mask";
	}
	return redraws.length > 1 ? "duplicate-redraw" : null;
}

/**
 * Whether a bridge's two halves agree: the mask is the element the bridge is named after, the
 * two are different elements, and both state the same crossing.
 * @param bridgeId the bridge's id
 * @param mask the mask part
 * @param redraw the redraw part
 * @returns the issue, or null
 */
function partAgreementIssue(
	bridgeId: string,
	mask: BridgePart,
	redraw: BridgePart,
): BridgeIncompleteIssue | null {
	if (mask.element.id !== bridgeId) {
		return "mask-id-mismatch";
	}
	if (mask.element.id === redraw.element.id) {
		return "conflicting-facts";
	}
	return sameFacts(mask.metadata, redraw.metadata) ? null : "conflicting-facts";
}

/**
 * Why a named bridge's parts do not form one complete decoration, if they do not.
 * @param bridgeId the bridge's id
 * @param parts the bridge's parts
 * @returns the issue, or null when the parts are complete
 */
function incompleteIssue(
	bridgeId: string,
	parts: readonly BridgePart[],
): BridgeIncompleteIssue | null {
	const shape = partShapeIssue(parts);
	if (shape !== null) {
		return shape;
	}
	const masks = parts.filter((part) => part.metadata.role === "mask");
	const redraws = parts.filter((part) => part.metadata.role === "redraw");
	const counts = partCountIssue(masks, redraws);
	if (counts !== null) {
		return counts;
	}
	return partAgreementIssue(bridgeId, masks[0]!, redraws[0]!);
}

/**
 * Pair the board's bridge parts into complete decorations, reporting the rest as incomplete.
 * @param elements the board's elements
 * @returns the complete pairs in identity order, and the incomplete decorations
 */
function structuralPairs(elements: readonly ServerElement[]): {
	valid: ValidBridgeDecoration[];
	invalid: InvalidBridgeDecoration[];
} {
	const invalid: InvalidBridgeDecoration[] = [];
	const grouped = groupBridgeParts(elements, invalid);
	const valid: ValidBridgeDecoration[] = [];
	for (const [bridgeId, parts] of grouped) {
		const issue = incompleteIssue(bridgeId, parts);
		if (issue !== null) {
			invalid.push({
				bridgeId,
				reason: "incomplete-decoration",
				issue,
				elements: parts.map((part) => part.element),
			});
			continue;
		}
		valid.push({
			bridgeId,
			mask: parts.find((part) => part.metadata.role === "mask")!,
			redraw: parts.find((part) => part.metadata.role === "redraw")!,
		});
	}
	return { valid: valid.toSorted((a, b) => compareIdentity(a.bridgeId, b.bridgeId)), invalid };
}

/**
 * Whether a bridge part has been drawn into something else since it was made: grouped with
 * other elements, or bound to one.
 * @param part the bridge part's element
 * @returns true when the part is entangled
 */
function isEntangled(part: ServerElement): boolean {
	return part.groupIds.length !== 0 || isBound(part);
}

/**
 * Whether a connector-shaped part has been bound to another element.
 * @param part the bridge part's element
 * @returns true when either end is bound
 */
function isBound(part: ServerElement): boolean {
	if (part.type !== "arrow" && part.type !== "line") {
		return false;
	}
	return part.startBinding != null || part.endBinding != null;
}

/**
 * How many times each named element appears on the board, kept apart so a missing source can
 * be told from a duplicated one.
 * @param elements the board's elements
 * @param ids the two source ids followed by the two part ids
 * @returns the source counts and every count
 */
function occurrenceCounts(
	elements: readonly ServerElement[],
	ids: readonly [string, string, string, string],
): { sources: readonly number[]; all: readonly number[] } {
	const all = ids.map((id) => elements.filter((element) => element.id === id).length);
	return { sources: all.slice(0, 2), all };
}

/**
 * Whether both sources and both parts appear exactly once on the board, which is what makes
 * the decoration's references resolvable at all.
 * @param pair the decoration
 * @param elements the board's elements
 * @returns the issue, or null
 */
function occurrenceIssue(
	pair: ValidBridgeDecoration,
	elements: readonly ServerElement[],
): BridgeStaleIssue | null {
	const facts = pair.mask.metadata;
	const counts = occurrenceCounts(elements, [
		facts.overConnectorId,
		facts.underConnectorId,
		pair.mask.element.id,
		pair.redraw.element.id,
	]);
	if (counts.sources.includes(0)) {
		return "missing-source";
	}
	return counts.all.every((count) => count === 1) ? null : "unsupported-source";
}

/**
 * Resolve a decoration's two sources to the connectors they name, when both are still
 * connectors a bridge could be drawn against.
 * @param facts the decoration's metadata
 * @param elements the board's elements
 * @returns the sources, or the issue that stops them resolving
 */
function resolveSources(
	facts: BridgeMetadata,
	elements: readonly ServerElement[],
): ResolvedSources | BridgeStaleIssue {
	const byId = new Map(elements.map((element) => [element.id, element]));
	const overElement = byId.get(facts.overConnectorId);
	const underElement = byId.get(facts.underConnectorId);
	if (!overElement || !underElement) {
		return "missing-source";
	}
	const over = supportedConnector(overElement, elements.indexOf(overElement));
	const under = supportedConnector(underElement, elements.indexOf(underElement));
	if (!over || !under) {
		return "unsupported-source";
	}
	return {
		overElement,
		underElement,
		overSegments: over.segments,
		underSegments: under.segments,
	};
}

/**
 * Whether the crossing the decoration records is still where the two segments meet.
 * @param facts the decoration's metadata
 * @param sources the resolved sources
 * @returns the issue, or null
 */
function crossingIssue(facts: BridgeMetadata, sources: ResolvedSources): BridgeStaleIssue | null {
	const overSegment = sources.overSegments[facts.overSegmentIndex];
	const underSegment = sources.underSegments[facts.underSegmentIndex];
	if (!overSegment || !underSegment) {
		return "crossing-moved";
	}
	const hit = intersectSegments(overSegment.a, overSegment.b, underSegment.a, underSegment.b, 0.5);
	if (hit.kind !== "proper" || !samePoint(hit.point, facts.crossing)) {
		return "crossing-moved";
	}
	return null;
}

/** One live element with the position it was found at. */
interface PaintedElement {
	element: ServerElement;
	position: number;
}

/**
 * The board's live elements in paint order, which is what decides whether a mask still hides
 * the crossing it was drawn for.
 * @param elements the board's elements
 * @returns the live elements with their positions, in paint order
 */
function livePaintOrder(elements: readonly ServerElement[]): PaintedElement[] {
	return elements
		.map((element, position) => ({ element, position }))
		.filter(({ element }) => !element.isDeleted)
		.toSorted((a, b) => comparePaintOrder(a, b));
}

/**
 * Order two live elements the way the board paints them: by index where both carry one, and
 * otherwise by the order they appear in.
 * @param a one element with its position
 * @param b the other
 * @returns -1, 0 or 1
 */
function comparePaintOrder(a: PaintedElement, b: PaintedElement): number {
	const byIndex =
		typeof a.element.index === "string" && typeof b.element.index === "string"
			? compareIdentity(a.element.index, b.element.index)
			: 0;
	return byIndex || a.position - b.position;
}

/**
 * Where each of a decoration's four elements sits in paint order, and whether any other live
 * element shares a part's index.
 * @param pair the decoration
 * @param sources the resolved sources
 * @param elements the board's elements
 * @returns the paint order facts
 */
function paintOrderOf(
	pair: ValidBridgeDecoration,
	sources: ResolvedSources,
	elements: readonly ServerElement[],
): PaintOrder {
	const liveOrder = livePaintOrder(elements);
	/**
	 * Where one element sits in the live paint order.
	 * @param target the element to find
	 * @returns its position, or -1 when it is not painted
	 */
	const positionOf = (target: ServerElement): number =>
		liveOrder.findIndex(({ element }) => element === target);
	return {
		maskPosition: positionOf(pair.mask.element),
		redrawPosition: positionOf(pair.redraw.element),
		overPosition: positionOf(sources.overElement),
		underPosition: positionOf(sources.underElement),
		duplicatePartIndex: liveOrder.some(({ element }) => sharesPartIndex(element, pair)),
	};
}

/**
 * Whether an element that is not part of the bridge carries the same index as one of its
 * parts, which would make paint order ambiguous.
 * @param element the live element
 * @param pair the decoration
 * @returns true when the index collides
 */
function sharesPartIndex(element: ServerElement, pair: ValidBridgeDecoration): boolean {
	if (element === pair.mask.element || element === pair.redraw.element) {
		return false;
	}
	return element.index === pair.mask.element.index || element.index === pair.redraw.element.index;
}

/**
 * Whether both parts and both sources still carry the string indexes paint order is read from.
 * @param pair the decoration
 * @param sources the resolved sources
 * @returns true when every index is present
 */
function hasPaintIndexes(pair: ValidBridgeDecoration, sources: ResolvedSources): boolean {
	return [
		pair.mask.element.index,
		pair.redraw.element.index,
		sources.overElement.index,
		sources.underElement.index,
	].every((index) => typeof index === "string");
}

/**
 * Whether a decoration's four elements are painted the way a bridge must be: both parts above
 * both sources, the redraw immediately above the mask, and no ambiguity about their order.
 * @param order where each element sits
 * @param pair the decoration
 * @returns true when the paint order is a bridge's
 */
function isBridgePaintOrder(order: PaintOrder, pair: ValidBridgeDecoration): boolean {
	if (!isUnambiguousOrder(order)) {
		return false;
	}
	if (compareIdentity(pair.mask.element.index!, pair.redraw.element.index!) >= 0) {
		return false;
	}
	return isAboveSources(order) && order.redrawPosition === order.maskPosition + 1;
}

/**
 * Whether both sources are painted and no other element shares a part's index, which is what
 * makes the order readable at all.
 * @param order where each element sits
 * @returns true when the order is unambiguous
 */
function isUnambiguousOrder(order: PaintOrder): boolean {
	if (order.duplicatePartIndex) {
		return false;
	}
	return order.overPosition >= 0 && order.underPosition >= 0;
}

/**
 * Whether the mask is painted above both of the connectors it bridges.
 * @param order where each element sits
 * @returns true when the mask is above both sources
 */
function isAboveSources(order: PaintOrder): boolean {
	return order.maskPosition > order.overPosition && order.maskPosition > order.underPosition;
}

/**
 * Whether the decoration is still painted where it must be: both parts above both sources,
 * the redraw immediately above the mask, and no other element sharing their indexes.
 * @param pair the decoration
 * @param sources the resolved sources
 * @param elements the board's elements
 * @returns the issue, or null
 */
function zOrderIssue(
	pair: ValidBridgeDecoration,
	sources: ResolvedSources,
	elements: readonly ServerElement[],
): BridgeStaleIssue | null {
	if (!hasPaintIndexes(pair, sources)) {
		return "z-order-invalid";
	}
	const order = paintOrderOf(pair, sources, elements);
	return isBridgePaintOrder(order, pair) ? null : "z-order-invalid";
}

/** The two lines a bridge is drawn as, as the plan generates them. */
interface BridgeDrawing {
	readonly inputs: readonly [Record<string, unknown>, Record<string, unknown>];
}

/**
 * Whether the two lines on the board are still the ones the plan would generate now.
 * @param pair the decoration
 * @param plan the plan generated from the decoration's own facts
 * @returns the issue, or null
 */
function drawingIssue(pair: ValidBridgeDecoration, plan: BridgeDrawing): BridgeStaleIssue | null {
	if (!lineMatches(pair.redraw.element, plan.inputs[1])) {
		return "style-mismatch";
	}
	return lineMatches(pair.mask.element, plan.inputs[0]) ? null : "geometry-mismatch";
}

/**
 * Why a decoration's own two parts can no longer be read, if they cannot: they have been
 * drawn into something else, or the elements they refer to are missing or duplicated.
 * @param pair the decoration
 * @param elements the board's elements
 * @returns the issue, or null
 */
function partIssue(
	pair: ValidBridgeDecoration,
	elements: readonly ServerElement[],
): BridgeStaleIssue | null {
	if ([pair.mask.element, pair.redraw.element].some(isEntangled)) {
		return "geometry-mismatch";
	}
	return occurrenceIssue(pair, elements);
}

/**
 * Why the sources no longer support the decoration's geometry, if they no longer do: the
 * crossing has moved, or the over-connector's stroke can no longer be reproduced.
 * @param facts the decoration's metadata
 * @param sources the resolved sources
 * @returns the issue, or null
 */
function geometryIssue(facts: BridgeMetadata, sources: ResolvedSources): BridgeStaleIssue | null {
	const crossing = crossingIssue(facts, sources);
	if (crossing !== null) {
		return crossing;
	}
	return strokeStyleOf(sources.overElement) ? null : "unsupported-source";
}

/**
 * Why a complete decoration no longer describes the board, if it no longer does. The checks
 * run in the order a reader would: what the parts have become, whether their sources are
 * still there, whether the crossing moved, whether the lines still match, and finally whether
 * they are still painted where a bridge must be.
 * @param pair the decoration
 * @param elements the board's elements
 * @param planFor generates the plan the decoration's own facts imply
 * @returns the issue, or null when the decoration is current
 */
function staleIssue(
	pair: ValidBridgeDecoration,
	elements: readonly ServerElement[],
	planFor: (facts: BridgeMetadata, elements: readonly ServerElement[]) => BridgeDrawing | null,
): BridgeStaleIssue | null {
	const partsAndSources = partIssue(pair, elements);
	if (partsAndSources !== null) {
		return partsAndSources;
	}
	const facts = pair.mask.metadata;
	const sources = resolveSources(facts, elements);
	if (typeof sources === "string") {
		return sources;
	}
	const geometry = geometryIssue(facts, sources);
	if (geometry !== null) {
		return geometry;
	}
	const plan = planFor(facts, elements);
	if (plan === null) {
		return "crossing-moved";
	}
	return drawingIssue(pair, plan) ?? zOrderIssue(pair, sources, elements);
}

export { staleIssue, structuralPairs };
