import { z } from "zod";

import type { ServerElement } from "../engine/types.js";
import { decodePath, decodeRecords, type DecodedRecord } from "./lib/decode.js";
import { intersectSegments, point, type ExactPoint, type Segment } from "./lib/geometry.js";
import {
	INSPECTION_FIELDS,
	type SnapshotField,
	type SnapshotRecord,
} from "./lib/input-snapshot.js";
import { compareIdentity } from "./lib/ordering.js";
import { type BridgeIncompleteIssue, type BridgeStaleIssue } from "./schemas.js";

export { BridgeIncompleteIssueSchema, BridgeStaleIssueSchema } from "./schemas.js";

const finite = z.number().finite();
const hexColour = z
	.string()
	.regex(/^#[0-9a-f]{6}$/, "Bridge background must be an opaque #RRGGBB colour.");

export const BridgeRoleSchema = z.enum(["mask", "redraw"]);
export const BridgeMetadataSchema = z.strictObject({
	bridgeId: z.string().min(1),
	role: BridgeRoleSchema,
	overConnectorId: z.string().min(1),
	underConnectorId: z.string().min(1),
	overSegmentIndex: z.number().int().nonnegative(),
	underSegmentIndex: z.number().int().nonnegative(),
	crossing: z.strictObject({ x: finite, y: finite }),
	background: hexColour,
});
export type BridgeMetadata = z.infer<typeof BridgeMetadataSchema>;

export interface BridgePart {
	readonly element: ServerElement;
	readonly metadata: BridgeMetadata;
}

export interface ValidBridgeDecoration {
	readonly bridgeId: string;
	readonly mask: BridgePart;
	readonly redraw: BridgePart;
}

export type InvalidBridgeDecoration =
	| {
			readonly bridgeId: string | null;
			readonly reason: "incomplete-decoration";
			readonly issue: BridgeIncompleteIssue;
			readonly elements: readonly ServerElement[];
	  }
	| {
			readonly bridgeId: string;
			readonly reason: "stale-decoration";
			readonly issue: BridgeStaleIssue;
			readonly elements: readonly ServerElement[];
	  };

export class BridgeRefusal extends Error {
	readonly code = "BRIDGE_REFUSED";

	constructor(message: string) {
		super(message);
		this.name = "BridgeRefusal";
	}
}

const own = (value: object, key: PropertyKey): boolean =>
	Object.prototype.hasOwnProperty.call(value, key);

function bridgeCandidate(element: ServerElement): { present: boolean; value?: unknown } {
	const custom = element.customData;
	if (!custom || typeof custom !== "object" || Array.isArray(custom)) return { present: false };
	const archboard = custom.archboard;
	if (!archboard || typeof archboard !== "object" || Array.isArray(archboard))
		return { present: false };
	return own(archboard, "bridge")
		? { present: true, value: (archboard as Record<string, unknown>).bridge }
		: { present: false };
}

export function hasBridgeMarker(element: ServerElement): boolean {
	return bridgeCandidate(element).present;
}

export function bridgeMetadataOf(element: ServerElement): BridgeMetadata | null {
	const candidate = bridgeCandidate(element);
	if (!candidate.present) return null;
	const parsed = BridgeMetadataSchema.safeParse(candidate.value);
	return parsed.success ? parsed.data : null;
}

const supportedAngle = (value: unknown): boolean => value === undefined || value === 0;
const absentOrFalse = (value: unknown): boolean => value === undefined || value === false;

function supportedConnector(
	element: ServerElement,
	sourceIndex: number,
): {
	record: DecodedRecord;
	segments: Segment[];
} | null {
	const dynamic = element as unknown as Record<string, unknown>;
	if (
		(element.type !== "arrow" && element.type !== "line") ||
		element.isDeleted ||
		!supportedAngle(element.angle) ||
		element.roundness != null ||
		!absentOrFalse(dynamic.elbowed) ||
		!absentOrFalse(dynamic.fixedSegments) ||
		dynamic.curve !== undefined ||
		dynamic.curveKind !== undefined
	)
		return null;
	const [record] = decodeRecords([element as unknown as SnapshotRecord]);
	if (!record?.live || !record.usableId) return null;
	const decoded = decodePath(record);
	if (!decoded.ok || !decoded.scenePoints || decoded.zeroSegments.length > 0) return null;
	const segments = decoded.scenePoints.slice(0, -1).map((a, index) => ({
		connectorId: element.id,
		sourceIndex,
		index,
		a,
		b: decoded.scenePoints![index + 1]!,
	}));
	return { record, segments };
}

const StrokeStyleSchema = z.strictObject({
	strokeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
	strokeWidth: finite.positive(),
	strokeStyle: z.enum(["solid", "dashed", "dotted"]),
	roughness: finite.min(0).max(2),
	opacity: finite.positive().max(100),
});
type StrokeStyle = z.infer<typeof StrokeStyleSchema>;

function strokeStyleOf(element: ServerElement): StrokeStyle | null {
	const parsed = StrokeStyleSchema.safeParse({
		strokeColor: element.strokeColor ?? "#1e1e1e",
		strokeWidth: element.strokeWidth ?? 2,
		strokeStyle: element.strokeStyle ?? "solid",
		roughness: element.roughness ?? 1,
		opacity: element.opacity ?? 100,
	});
	return parsed.success ? parsed.data : null;
}

function normalizeBackground(value: string): string {
	const normalized = value.toLowerCase();
	if (!/^#[0-9a-f]{6}$/.test(normalized))
		throw new BridgeRefusal("--background must be an opaque six-digit #RRGGBB colour.");
	return normalized;
}

const samePoint = (a: ExactPoint, b: ExactPoint): boolean =>
	point(a).x === b.x && point(a).y === b.y;

const sameFacts = (a: BridgeMetadata, b: BridgeMetadata): boolean =>
	a.bridgeId === b.bridgeId &&
	a.overConnectorId === b.overConnectorId &&
	a.underConnectorId === b.underConnectorId &&
	a.overSegmentIndex === b.overSegmentIndex &&
	a.underSegmentIndex === b.underSegmentIndex &&
	a.crossing.x === b.crossing.x &&
	a.crossing.y === b.crossing.y &&
	a.background === b.background;

function canonicalBridgeLine(
	partId: string,
	expectedInput: Record<string, unknown>,
): Record<string, unknown> {
	const points = expectedInput.points as [[number, number], [number, number]];
	return {
		...expectedInput,
		id: partId,
		width: Math.abs(points[1][0] - points[0][0]),
		height: Math.abs(points[1][1] - points[0][1]),
	};
}

// These are written by the server or converter rather than bridgeLine. They do
// not change the generated decoration's semantic projection.
const BRIDGE_VOLATILE_FIELDS = new Set<SnapshotField>(["index", "createdAt", "source"]);

function lineMatches(part: ServerElement, expectedInput: Record<string, unknown>): boolean {
	const actual = part as unknown as Record<string, unknown>;
	const expected = canonicalBridgeLine(part.id, expectedInput);
	for (const [key, value] of Object.entries(expected)) {
		if (key === "customData") {
			const actualCustomData = actual.customData;
			const expectedCustomData = value as { archboard: { bridge: BridgeMetadata } };
			if (
				!actualCustomData ||
				typeof actualCustomData !== "object" ||
				Array.isArray(actualCustomData)
			)
				return false;
			const actualArchboard = (actualCustomData as Record<string, unknown>).archboard;
			if (
				!actualArchboard ||
				typeof actualArchboard !== "object" ||
				Array.isArray(actualArchboard) ||
				Object.keys(actualArchboard).length !== 1 ||
				!own(actualArchboard, "bridge")
			)
				return false;
			const actualBridge = BridgeMetadataSchema.safeParse(
				(actualArchboard as Record<string, unknown>).bridge,
			);
			if (
				!actualBridge.success ||
				JSON.stringify(actualBridge.data) !== JSON.stringify(expectedCustomData.archboard.bridge)
			)
				return false;
			continue;
		}
		if (JSON.stringify(actual[key]) !== JSON.stringify(value)) return false;
	}
	for (const field of INSPECTION_FIELDS)
		if (!own(expected, field) && !BRIDGE_VOLATILE_FIELDS.has(field) && actual[field] !== undefined)
			return false;
	return true;
}

const bridgeBlock = (metadata: BridgeMetadata) => ({ archboard: { bridge: metadata } });

function bridgeLine(
	metadata: BridgeMetadata,
	a: ExactPoint,
	b: ExactPoint,
	style: StrokeStyle,
	mask: boolean,
): Record<string, unknown> {
	return {
		...(mask ? { id: metadata.bridgeId } : {}),
		type: "line",
		x: a.x,
		y: a.y,
		points: [
			[0, 0],
			[b.x - a.x, b.y - a.y],
		],
		angle: 0,
		strokeColor: mask ? metadata.background : style.strokeColor,
		backgroundColor: "transparent",
		fillStyle: "solid",
		strokeWidth: mask ? style.strokeWidth + 4 : style.strokeWidth,
		strokeStyle: mask ? "solid" : style.strokeStyle,
		roughness: mask ? 0 : style.roughness,
		opacity: mask ? 100 : style.opacity,
		groupIds: [],
		frameId: null,
		roundness: null,
		isDeleted: false,
		boundElements: null,
		link: null,
		locked: false,
		lastCommittedPoint: null,
		startBinding: null,
		endBinding: null,
		startArrowhead: null,
		endArrowhead: null,
		customData: bridgeBlock(metadata),
	};
}

interface CrossingCandidate {
	over: Segment;
	under: Segment;
	point: ExactPoint;
}

function crossingCandidates(
	over: readonly Segment[],
	under: readonly Segment[],
): CrossingCandidate[] {
	const candidates: CrossingCandidate[] = [];
	for (const overSegment of over)
		for (const underSegment of under) {
			const hit = intersectSegments(
				overSegment.a,
				overSegment.b,
				underSegment.a,
				underSegment.b,
				0.5,
			);
			if (hit.kind === "proper")
				candidates.push({ over: overSegment, under: underSegment, point: hit.point });
		}
	return candidates.toSorted(
		(a, b) =>
			a.over.index - b.over.index ||
			a.under.index - b.under.index ||
			point(a.point).x - point(b.point).x ||
			point(a.point).y - point(b.point).y,
	);
}

export interface PlanBridgeCreateInput {
	readonly elements: readonly ServerElement[];
	readonly bridgeId: string;
	readonly overConnectorId: string;
	readonly underConnectorId: string;
	readonly background: string;
	readonly at?: ExactPoint;
}

export interface BridgeCreatePlan {
	readonly bridgeId: string;
	readonly overConnectorId: string;
	readonly underConnectorId: string;
	readonly overSegmentIndex: number;
	readonly underSegmentIndex: number;
	readonly crossing: ExactPoint;
	readonly inputs: readonly [Record<string, unknown>, Record<string, unknown>];
}

export function planBridgeCreate(input: PlanBridgeCreateInput): BridgeCreatePlan {
	if (!input.bridgeId) throw new BridgeRefusal("A bridge ID is required.");
	if (input.overConnectorId === input.underConnectorId)
		throw new BridgeRefusal("--over and --under must name distinct connectors.");
	const byId = new Map(input.elements.map((element) => [element.id, element]));
	const overElement = byId.get(input.overConnectorId);
	const underElement = byId.get(input.underConnectorId);
	if (!overElement)
		throw new BridgeRefusal(`Over-connector ${input.overConnectorId} was not found.`);
	if (!underElement)
		throw new BridgeRefusal(`Under-connector ${input.underConnectorId} was not found.`);
	const over = supportedConnector(overElement, input.elements.indexOf(overElement));
	const under = supportedConnector(underElement, input.elements.indexOf(underElement));
	if (!over || !under)
		throw new BridgeRefusal("Both sources must be supported straight arrow/line connectors.");
	const style = strokeStyleOf(overElement);
	if (!style) throw new BridgeRefusal("The over-connector has an unusable stroke style.");
	const candidates = crossingCandidates(over.segments, under.segments);
	if (candidates.length === 0)
		throw new BridgeRefusal("The named connectors have no proper interior intersection.");
	const matches = input.at
		? candidates.filter(
				(candidate) =>
					Math.hypot(candidate.point.x - input.at!.x, candidate.point.y - input.at!.y) <= 0.5,
			)
		: candidates;
	if (matches.length !== 1)
		throw new BridgeRefusal(
			input.at
				? "--at must identify exactly one proper intersection within 0.5 px."
				: "The connectors cross more than once; provide --at x,y to select one.",
		);
	const selected = matches[0]!;
	const dx = selected.over.b.x - selected.over.a.x;
	const dy = selected.over.b.y - selected.over.a.y;
	const length = Math.hypot(dx, dy);
	if (!Number.isFinite(length) || length < 16)
		throw new BridgeRefusal("The selected over-segment is too short for a bridge.");
	const ux = dx / length;
	const uy = dy / length;
	const along =
		(selected.point.x - selected.over.a.x) * ux + (selected.point.y - selected.over.a.y) * uy;
	const halfSpan = Math.max(6, style.strokeWidth * 2 + 2);
	if (along < halfSpan || length - along < halfSpan)
		throw new BridgeRefusal("The selected crossing lacks enough over-segment span for a bridge.");
	const a = { x: selected.point.x - ux * halfSpan, y: selected.point.y - uy * halfSpan };
	const b = { x: selected.point.x + ux * halfSpan, y: selected.point.y + uy * halfSpan };
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

function structuralPairs(elements: readonly ServerElement[]): {
	valid: ValidBridgeDecoration[];
	invalid: InvalidBridgeDecoration[];
} {
	const invalid: InvalidBridgeDecoration[] = [];
	const grouped = new Map<string, BridgePart[]>();
	for (const element of elements) {
		const marker = bridgeCandidate(element);
		if (!marker.present) continue;
		const parsed = BridgeMetadataSchema.safeParse(marker.value);
		if (!parsed.success) {
			const partial =
				marker.value && typeof marker.value === "object" && !Array.isArray(marker.value)
					? (marker.value as Record<string, unknown>)
					: null;
			invalid.push({
				bridgeId:
					typeof partial?.bridgeId === "string" && partial.bridgeId.length > 0
						? partial.bridgeId
						: null,
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
	const valid: ValidBridgeDecoration[] = [];
	for (const [bridgeId, parts] of grouped) {
		const masks = parts.filter((part) => part.metadata.role === "mask");
		const redraws = parts.filter((part) => part.metadata.role === "redraw");
		let issue: BridgeIncompleteIssue | null = null;
		if (parts.some((part) => part.element.type !== "line")) issue = "non-line-part";
		else if (
			parts.some(
				(part) =>
					part.element.isDeleted ||
					typeof part.element.id !== "string" ||
					part.element.id.length === 0,
			)
		)
			issue = "malformed-metadata";
		else if (masks.length === 0) issue = "missing-mask";
		else if (redraws.length === 0) issue = "missing-redraw";
		else if (masks.length > 1) issue = "duplicate-mask";
		else if (redraws.length > 1) issue = "duplicate-redraw";
		else if (masks[0]!.element.id !== bridgeId) issue = "mask-id-mismatch";
		else if (masks[0]!.element.id === redraws[0]!.element.id) issue = "conflicting-facts";
		else if (!sameFacts(masks[0]!.metadata, redraws[0]!.metadata)) issue = "conflicting-facts";
		if (issue)
			invalid.push({
				bridgeId,
				reason: "incomplete-decoration",
				issue,
				elements: parts.map((part) => part.element),
			});
		else valid.push({ bridgeId, mask: masks[0]!, redraw: redraws[0]! });
	}
	return { valid: valid.toSorted((a, b) => compareIdentity(a.bridgeId, b.bridgeId)), invalid };
}

function staleIssue(
	pair: ValidBridgeDecoration,
	elements: readonly ServerElement[],
): BridgeStaleIssue | null {
	for (const part of [pair.mask.element, pair.redraw.element]) {
		if (
			(part.groupIds?.length ?? 0) !== 0 ||
			((part.type === "arrow" || part.type === "line") &&
				(part.startBinding != null || part.endBinding != null))
		)
			return "geometry-mismatch";
	}
	const byId = new Map(elements.map((element) => [element.id, element]));
	const facts = pair.mask.metadata;
	const occurrences = (id: string) => elements.filter((element) => element.id === id);
	const overMatches = occurrences(facts.overConnectorId);
	const underMatches = occurrences(facts.underConnectorId);
	if (overMatches.length === 0 || underMatches.length === 0) return "missing-source";
	if (
		overMatches.length !== 1 ||
		underMatches.length !== 1 ||
		occurrences(pair.mask.element.id).length !== 1 ||
		occurrences(pair.redraw.element.id).length !== 1
	)
		return "unsupported-source";
	const overElement = byId.get(facts.overConnectorId);
	const underElement = byId.get(facts.underConnectorId);
	if (!overElement || !underElement) return "missing-source";
	const over = supportedConnector(overElement, elements.indexOf(overElement));
	const under = supportedConnector(underElement, elements.indexOf(underElement));
	if (!over || !under) return "unsupported-source";
	const overSegment = over.segments[facts.overSegmentIndex];
	const underSegment = under.segments[facts.underSegmentIndex];
	if (!overSegment || !underSegment) return "crossing-moved";
	const hit = intersectSegments(overSegment.a, overSegment.b, underSegment.a, underSegment.b, 0.5);
	if (hit.kind !== "proper" || !samePoint(hit.point, facts.crossing)) return "crossing-moved";
	const style = strokeStyleOf(overElement);
	if (!style) return "unsupported-source";
	let expected: BridgeCreatePlan;
	try {
		expected = planBridgeCreate({
			elements,
			bridgeId: facts.bridgeId,
			overConnectorId: facts.overConnectorId,
			underConnectorId: facts.underConnectorId,
			background: facts.background,
			at: facts.crossing,
		});
	} catch {
		return "crossing-moved";
	}
	if (!lineMatches(pair.redraw.element, expected.inputs[1])) return "style-mismatch";
	if (!lineMatches(pair.mask.element, expected.inputs[0])) return "geometry-mismatch";
	const liveOrder = elements
		.map((element, position) => ({ element, position }))
		.filter(({ element }) => !element.isDeleted)
		.toSorted(
			(a, b) =>
				(typeof a.element.index === "string" && typeof b.element.index === "string"
					? compareIdentity(a.element.index, b.element.index)
					: 0) || a.position - b.position,
		);
	const maskPosition = liveOrder.findIndex(({ element }) => element === pair.mask.element);
	const redrawPosition = liveOrder.findIndex(({ element }) => element === pair.redraw.element);
	const overPosition = liveOrder.findIndex(({ element }) => element === overElement);
	const underPosition = liveOrder.findIndex(({ element }) => element === underElement);
	const duplicatePartIndex = liveOrder.some(
		({ element }) =>
			element !== pair.mask.element &&
			element !== pair.redraw.element &&
			(element.index === pair.mask.element.index || element.index === pair.redraw.element.index),
	);
	if (
		typeof pair.mask.element.index !== "string" ||
		typeof pair.redraw.element.index !== "string" ||
		typeof overElement.index !== "string" ||
		typeof underElement.index !== "string" ||
		overPosition < 0 ||
		underPosition < 0 ||
		duplicatePartIndex ||
		compareIdentity(pair.mask.element.index, pair.redraw.element.index) >= 0 ||
		maskPosition <= overPosition ||
		maskPosition <= underPosition ||
		redrawPosition !== maskPosition + 1
	)
		return "z-order-invalid";
	return null;
}

export function validateBridgeDecorations(elements: readonly ServerElement[]): {
	readonly valid: readonly ValidBridgeDecoration[];
	readonly invalid: readonly InvalidBridgeDecoration[];
} {
	const structural = structuralPairs(elements);
	const valid: ValidBridgeDecoration[] = [];
	const invalid = [...structural.invalid];
	for (const pair of structural.valid) {
		if (invalid.some((candidate) => candidate.bridgeId === pair.bridgeId)) continue;
		const issue = staleIssue(pair, elements);
		if (issue)
			invalid.push({
				bridgeId: pair.bridgeId,
				reason: "stale-decoration",
				issue,
				elements: [pair.mask.element, pair.redraw.element],
			});
		else valid.push(pair);
	}
	return { valid, invalid };
}

export function isBridgeDecoration(
	element: ServerElement,
	elements: readonly ServerElement[],
): boolean {
	return validateBridgeDecorations(elements).valid.some(
		(pair) => pair.mask.element.id === element.id || pair.redraw.element.id === element.id,
	);
}

export function withoutValidBridgeDecorations(elements: readonly ServerElement[]): ServerElement[] {
	const ids = new Set(
		validateBridgeDecorations(elements).valid.flatMap((pair) => [
			pair.mask.element.id,
			pair.redraw.element.id,
		]),
	);
	return elements.filter((element) => !ids.has(element.id));
}

export function planBridgeRemoval(
	elements: readonly ServerElement[],
	bridgeId: string,
): readonly [string, string] {
	const structural = structuralPairs(elements);
	const pair = structural.valid.find((candidate) => candidate.bridgeId === bridgeId);
	const conflicting = structural.invalid.find((candidate) => candidate.bridgeId === bridgeId);
	if (!pair || conflicting)
		throw new BridgeRefusal(
			`Bridge ${bridgeId} does not have exactly one complete mask/redraw provenance pair.`,
		);
	return [pair.mask.element.id, pair.redraw.element.id];
}
