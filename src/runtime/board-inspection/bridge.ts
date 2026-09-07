import type { AgentElementInput } from "@/runtime/engine/apply-element-input";
import type { ServerElement } from "@/runtime/engine/types";
import { point, type ExactPoint } from "@/runtime/board-inspection/lib/geometry";
import {
	BridgeMetadataSchema,
	BridgeRefusal,
	normalizeBackground,
	strokeStyleOf,
	type BridgeMetadata,
	type PlanBridgeCreateInput,
	type StrokeStyle,
} from "@/runtime/board-inspection/lib/bridge-contract";
import {
	bridgeLine,
	crossingCandidates,
	supportedConnector,
	type CrossingCandidate,
} from "@/runtime/board-inspection/lib/bridge-parts";
import { staleIssue, structuralPairs } from "@/runtime/board-inspection/lib/bridge-staleness";
import type {
	InvalidBridgeDecoration,
	ValidBridgeDecoration,
} from "@/runtime/board-inspection/lib/bridge-contract";

export {
	BridgeIncompleteIssueSchema,
	BridgeStaleIssueSchema,
} from "@/runtime/board-inspection/schemas";

export {
	BridgeMetadataSchema,
	BridgeRefusal,
	BridgeRoleSchema,
	type BridgeMetadata,
	type BridgePart,
	type InvalidBridgeDecoration,
	type PlanBridgeCreateInput,
	type ValidBridgeDecoration,
} from "@/runtime/board-inspection/lib/bridge-contract";

export { bridgeMetadataOf, hasBridgeMarker } from "@/runtime/board-inspection/lib/bridge-parts";

/** The smallest over-segment a bridge can be drawn on without touching its ends. */
const MINIMUM_SEGMENT_LENGTH = 16;
/** The smallest half-span a bridge spans, before the stroke width widens it. */
const MINIMUM_HALF_SPAN = 6;
/** How near an --at point must be to a crossing to select it. */
const AT_TOLERANCE = 0.5;

export interface BridgeCreatePlan {
	readonly bridgeId: string;
	readonly overConnectorId: string;
	readonly underConnectorId: string;
	readonly overSegmentIndex: number;
	readonly underSegmentIndex: number;
	readonly crossing: ExactPoint;
	readonly inputs: readonly [AgentElementInput, AgentElementInput];
}

/**
 * Resolve the two connectors a bridge is asked for, refusing anything a bridge cannot be
 * drawn against.
 * @param input the caller's request
 * @returns the two elements with their segments and the over-connector's stroke
 */
function planSources(input: PlanBridgeCreateInput): {
	over: NonNullable<ReturnType<typeof supportedConnector>>;
	under: NonNullable<ReturnType<typeof supportedConnector>>;
	style: StrokeStyle;
} {
	const byId = new Map(input.elements.map((element) => [element.id, element]));
	const overElement = byId.get(input.overConnectorId);
	const underElement = byId.get(input.underConnectorId);
	if (!overElement) {
		throw new BridgeRefusal(`Over-connector ${input.overConnectorId} was not found.`);
	}
	if (!underElement) {
		throw new BridgeRefusal(`Under-connector ${input.underConnectorId} was not found.`);
	}
	const over = supportedConnector(overElement, input.elements.indexOf(overElement));
	const under = supportedConnector(underElement, input.elements.indexOf(underElement));
	if (!over || !under) {
		throw new BridgeRefusal(
			"Both sources must be live arrow/line connectors at zero rotation, without explicit curve fields, with finite non-zero point-chain segments; elbow coordinates must stay within ±1,000,000.",
		);
	}
	const style = strokeStyleOf(overElement);
	if (!style) {
		throw new BridgeRefusal("The over-connector has an unusable stroke style.");
	}
	return { over, under, style };
}

/**
 * Choose the one crossing a bridge is drawn at, refusing an ambiguous board rather than
 * guessing which crossing the caller meant.
 * @param candidates every proper crossing of the two connectors
 * @param at the point the caller named, when they named one
 * @returns the selected crossing
 */
function selectCrossing(
	candidates: readonly CrossingCandidate[],
	at: ExactPoint | undefined,
): CrossingCandidate {
	if (candidates.length === 0) {
		throw new BridgeRefusal("The named connectors have no proper interior intersection.");
	}
	const matches =
		at === undefined
			? candidates
			: candidates.filter(
					(candidate) =>
						Math.hypot(candidate.point.x - at.x, candidate.point.y - at.y) <= AT_TOLERANCE,
				);
	if (matches.length !== 1) {
		throw new BridgeRefusal(
			at
				? "--at must identify exactly one proper intersection within 0.5 px."
				: "The connectors cross more than once; provide --at x,y to select one.",
		);
	}
	return matches[0]!;
}

/**
 * The two ends of the span a bridge covers: half a span either side of the crossing, along
 * the over-segment, with enough segment left on both sides for the bridge to sit inside it.
 * @param selected the selected crossing
 * @param style the over-connector's stroke
 * @returns the two ends of the span
 */
function bridgeSpan(
	selected: CrossingCandidate,
	style: StrokeStyle,
): { a: ExactPoint; b: ExactPoint } {
	const dx = selected.over.b.x - selected.over.a.x;
	const dy = selected.over.b.y - selected.over.a.y;
	const length = Math.hypot(dx, dy);
	if (!Number.isFinite(length) || length < MINIMUM_SEGMENT_LENGTH) {
		throw new BridgeRefusal("The selected over-segment is too short for a bridge.");
	}
	const ux = dx / length;
	const uy = dy / length;
	const along =
		(selected.point.x - selected.over.a.x) * ux + (selected.point.y - selected.over.a.y) * uy;
	const halfSpan = Math.max(MINIMUM_HALF_SPAN, style.strokeWidth * 2 + 2);
	if (along < halfSpan || length - along < halfSpan) {
		throw new BridgeRefusal("The selected crossing lacks enough over-segment span for a bridge.");
	}
	return {
		a: { x: selected.point.x - ux * halfSpan, y: selected.point.y - uy * halfSpan },
		b: { x: selected.point.x + ux * halfSpan, y: selected.point.y + uy * halfSpan },
	};
}

/**
 * Plan the two lines that draw one bridge: a mask that hides the crossing and a redraw that
 * puts the over-connector back on top of it.
 * @param input the connectors to bridge, the background to mask with, and any chosen crossing
 * @returns the plan, naming what it bridges and the two inputs to create
 */
export function planBridgeCreate(input: PlanBridgeCreateInput): BridgeCreatePlan {
	if (!input.bridgeId) {
		throw new BridgeRefusal("A bridge ID is required.");
	}
	if (input.overConnectorId === input.underConnectorId) {
		throw new BridgeRefusal("--over and --under must name distinct connectors.");
	}
	const { over, under, style } = planSources(input);
	const selected = selectCrossing(crossingCandidates(over.segments, under.segments), input.at);
	const { a, b } = bridgeSpan(selected, style);
	const shared = {
		bridgeId: input.bridgeId,
		overConnectorId: input.overConnectorId,
		underConnectorId: input.underConnectorId,
		overSegmentIndex: selected.over.index,
		underSegmentIndex: selected.under.index,
		crossing: point(selected.point),
		background: normalizeBackground(input.background),
	};
	const mask = BridgeMetadataSchema.parse({ ...shared, role: "mask" });
	const redraw = BridgeMetadataSchema.parse({ ...shared, role: "redraw" });
	return {
		bridgeId: input.bridgeId,
		overConnectorId: input.overConnectorId,
		underConnectorId: input.underConnectorId,
		overSegmentIndex: selected.over.index,
		underSegmentIndex: selected.under.index,
		crossing: point(selected.point),
		inputs: [bridgeLine(mask, a, b, style, true), bridgeLine(redraw, a, b, style, false)],
	};
}

/**
 * Re-plan a decoration from the facts it records, so a stale check can compare the board with
 * what a bridge for those facts would look like now.
 * @param facts the decoration's metadata
 * @param elements the board's elements
 * @returns the plan, or null when those facts no longer plan a bridge at all
 */
function replanFrom(
	facts: BridgeMetadata,
	elements: readonly ServerElement[],
): { readonly inputs: readonly [AgentElementInput, AgentElementInput] } | null {
	try {
		return planBridgeCreate({
			elements,
			bridgeId: facts.bridgeId,
			overConnectorId: facts.overConnectorId,
			underConnectorId: facts.underConnectorId,
			background: facts.background,
			at: facts.crossing,
		});
	} catch {
		return null;
	}
}

/**
 * Validate every bridge decoration on a board: which ones are complete and still describe the
 * board, and which ones are incomplete or stale.
 * @param elements the board's elements
 * @returns the valid decorations and the invalid ones with their reasons
 */
export function validateBridgeDecorations(elements: readonly ServerElement[]): {
	readonly valid: readonly ValidBridgeDecoration[];
	readonly invalid: readonly InvalidBridgeDecoration[];
} {
	const structural = structuralPairs(elements);
	const valid: ValidBridgeDecoration[] = [];
	const invalid = [...structural.invalid];
	for (const pair of structural.valid) {
		if (invalid.some((candidate) => candidate.bridgeId === pair.bridgeId)) {
			continue;
		}
		const issue = staleIssue(pair, elements, replanFrom);
		if (issue === null) {
			valid.push(pair);
			continue;
		}
		invalid.push({
			bridgeId: pair.bridgeId,
			reason: "stale-decoration",
			issue,
			elements: [pair.mask.element, pair.redraw.element],
		});
	}
	return { valid, invalid };
}

/**
 * Whether an element is half of a bridge decoration that is currently valid, which is what
 * keeps it out of the semantic projection.
 * @param element the element
 * @param elements the board's elements
 * @returns true when the element is part of a valid decoration
 */
export function isBridgeDecoration(
	element: ServerElement,
	elements: readonly ServerElement[],
): boolean {
	return validateBridgeDecorations(elements).valid.some(
		(pair) => pair.mask.element.id === element.id || pair.redraw.element.id === element.id,
	);
}

/**
 * The board without the elements that are valid bridge decorations, which is the board the
 * semantic layers read.
 * @param elements the board's elements
 * @returns the remaining elements, in board order
 */
export function withoutValidBridgeDecorations(elements: readonly ServerElement[]): ServerElement[] {
	const ids = new Set(
		validateBridgeDecorations(elements).valid.flatMap((pair) => [
			pair.mask.element.id,
			pair.redraw.element.id,
		]),
	);
	return elements.filter((element) => !ids.has(element.id));
}

/**
 * The two elements that removing one bridge deletes, refusing a bridge whose decoration is
 * not exactly one complete pair.
 * @param elements the board's elements
 * @param bridgeId the bridge to remove
 * @returns the mask and redraw element ids
 */
export function planBridgeRemoval(
	elements: readonly ServerElement[],
	bridgeId: string,
): readonly [string, string] {
	const structural = structuralPairs(elements);
	const pair = structural.valid.find((candidate) => candidate.bridgeId === bridgeId);
	const conflicting = structural.invalid.find((candidate) => candidate.bridgeId === bridgeId);
	if (!pair || conflicting) {
		throw new BridgeRefusal(
			`Bridge ${bridgeId} does not have exactly one complete mask/redraw provenance pair.`,
		);
	}
	return [pair.mask.element.id, pair.redraw.element.id];
}
