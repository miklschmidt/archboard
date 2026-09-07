import type { AgentElementInput } from "@/runtime/engine/apply-element-input";
import { readElementMetadata } from "@/runtime/engine/metadata";
import type { ServerElement } from "@/runtime/engine/types";
import { decodeRecords, type DecodedRecord } from "@/runtime/board-inspection/lib/decode";
import {
	decodePath,
	persistedConnectorPointChainEligibility,
} from "@/runtime/board-inspection/lib/connector-path";
import {
	intersectSegments,
	point,
	type ExactPoint,
	type Segment,
} from "@/runtime/board-inspection/lib/geometry";
import {
	INSPECTION_FIELDS,
	type SnapshotField,
} from "@/runtime/board-inspection/lib/input-snapshot";
import {
	BridgeMetadataSchema,
	type BridgeMetadata,
	type StrokeStyle,
} from "@/runtime/board-inspection/lib/bridge-contract";

/**
 * These are written by the server or converter rather than bridgeLine. They do not change the
 * generated decoration's semantic projection.
 */
const BRIDGE_VOLATILE_FIELDS = new Set<SnapshotField>(["index", "createdAt", "source"]);

/** One proper crossing of an over-segment and an under-segment. */
interface CrossingCandidate {
	over: Segment;
	under: Segment;
	point: ExactPoint;
}

/**
 * Whether an object carries a key itself rather than through its prototype.
 * @param value the object
 * @param key the key
 * @returns true when the key is an own property
 */
const own = (value: object, key: PropertyKey): boolean =>
	Object.prototype.hasOwnProperty.call(value, key);

/**
 * Read one field of a value that may not be a plain object at all.
 * @param value the value
 * @param field the field name
 * @returns the field's value, or undefined
 */
function plainField(value: unknown, field: string): unknown {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return undefined;
	}
	return own(value, field) ? Reflect.get(value, field) : undefined;
}

/**
 * Whether a value is a plain object, which every metadata block must be.
 * @param value the value
 * @returns true for a non-null, non-array object
 */
function plainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * The bridge block an element carries, if it carries one at all. A present but unreadable
 * block is still present: that is what makes it an invalid decoration rather than no
 * decoration.
 * @param element the element
 * @returns whether a block is present, and its raw value
 */
function bridgeCandidate(element: ServerElement): { present: boolean; value?: unknown } {
	const archboard = plainField(element.customData, "archboard");
	if (!plainObject(archboard)) {
		return { present: false };
	}
	return own(archboard, "bridge")
		? { present: true, value: archboard["bridge"] }
		: { present: false };
}

/**
 * Whether an element claims to be part of a bridge.
 * @param element the element
 * @returns true when a bridge block is present
 */
function hasBridgeMarker(element: ServerElement): boolean {
	return bridgeCandidate(element).present;
}

/**
 * The bridge metadata an element carries, when it reads cleanly.
 * @param element the element
 * @returns the metadata, or null
 */
function bridgeMetadataOf(element: ServerElement): BridgeMetadata | null {
	const candidate = bridgeCandidate(element);
	if (!candidate.present) {
		return null;
	}
	const parsed = BridgeMetadataSchema.safeParse(candidate.value);
	return parsed.success ? parsed.data : null;
}

/**
 * Whether an element's rotation is one a bridge can be drawn against.
 * @param value the element's angle
 * @returns true for an absent or zero angle
 */
const supportedAngle = (value: unknown): boolean => value === undefined || value === 0;

/**
 * Whether an element is a connector shape a bridge may cross: a live arrow or line at zero
 * rotation with no explicit curve, whose geometry is therefore straight segments.
 * @param element the element
 * @returns true when the shape is supported
 */
function supportedShape(element: ServerElement): boolean {
	if (element.type !== "arrow" && element.type !== "line") {
		return false;
	}
	if (element.isDeleted || !supportedAngle(element.angle)) {
		return false;
	}
	return (
		plainField(element, "curve") === undefined && plainField(element, "curveKind") === undefined
	);
}

/**
 * The scene segments of a connector a bridge can be drawn against, or null when the element
 * is not such a connector.
 * @param element the candidate connector
 * @param sourceIndex the element's position in the scene
 * @returns the decoded record and its segments, or null
 */
function supportedConnector(
	element: ServerElement,
	sourceIndex: number,
): { record: DecodedRecord; segments: Segment[] } | null {
	if (!supportedShape(element)) {
		return null;
	}
	const [record] = decodeRecords([element]);
	if (!record?.live || !record.usableId) {
		return null;
	}
	const scenePoints = analysableScenePoints(record);
	if (scenePoints === null) {
		return null;
	}
	return { record, segments: sceneSegments(element.id, sourceIndex, scenePoints) };
}

/**
 * The scene points of a connector whose chain can be analysed at all: it decodes, it has
 * absolute points, none of its segments is zero-length, and its persisted chain is eligible.
 * @param record the decoded connector record
 * @returns the scene points, or null
 */
function analysableScenePoints(record: DecodedRecord): readonly ExactPoint[] | null {
	const decoded = decodePath(record);
	if (!decoded.ok || !decoded.scenePoints || decoded.zeroSegments.length > 0) {
		return null;
	}
	return persistedConnectorPointChainEligibility(record, decoded).eligible
		? decoded.scenePoints
		: null;
}

/**
 * The segments a connector's scene points describe.
 * @param connectorId the connector's identity
 * @param sourceIndex the connector's position in the scene
 * @param scenePoints its scene points
 * @returns one segment per consecutive pair
 */
function sceneSegments(
	connectorId: string,
	sourceIndex: number,
	scenePoints: readonly ExactPoint[],
): Segment[] {
	return scenePoints.slice(0, -1).map((a, index) => ({
		connectorId,
		sourceIndex,
		index,
		a,
		b: scenePoints[index + 1]!,
	}));
}

/**
 * Whether two points are the same once rounded the way the board stores them.
 * @param a one point
 * @param b the other
 * @returns true when they coincide
 */
const samePoint = (a: ExactPoint, b: ExactPoint): boolean =>
	point(a).x === b.x && point(a).y === b.y;

/** Every fact both halves of one bridge state, apart from the crossing and the role. */
const SHARED_BRIDGE_FACTS = [
	"bridgeId",
	"overConnectorId",
	"underConnectorId",
	"overSegmentIndex",
	"underSegmentIndex",
	"background",
] as const satisfies readonly (keyof BridgeMetadata)[];

/**
 * Whether two bridge blocks state the same facts, which the mask and redraw of one bridge
 * must: they describe one crossing.
 * @param a one block
 * @param b the other
 * @returns true when every fact but the role matches
 */
const sameFacts = (a: BridgeMetadata, b: BridgeMetadata): boolean =>
	SHARED_BRIDGE_FACTS.every((fact) => a[fact] === b[fact]) &&
	a.crossing.x === b.crossing.x &&
	a.crossing.y === b.crossing.y;

/**
 * The canonical form of a generated bridge line: the input it was created from, with the id
 * it was given and the extent its points imply.
 * @param partId the element id
 * @param expectedInput the input the plan generated
 * @returns the canonical element fields
 */
function canonicalBridgeLine(
	partId: string,
	expectedInput: Record<string, unknown>,
): Record<string, unknown> {
	const points = bridgePoints(expectedInput["points"]);
	return {
		...expectedInput,
		id: partId,
		width: Math.abs(points[1][0] - points[0][0]),
		height: Math.abs(points[1][1] - points[0][1]),
	};
}

/**
 * The two points of a generated bridge line.
 * @param value the generated points field
 * @returns the two points
 */
function bridgePoints(
	value: unknown,
): readonly [readonly [number, number], readonly [number, number]] {
	const points = Array.isArray(value) ? value : [];
	return [bridgePoint(points[0]), bridgePoint(points[1])];
}

/**
 * One point of a generated bridge line.
 * @param value the generated point
 * @returns its two coordinates
 */
function bridgePoint(value: unknown): readonly [number, number] {
	if (!Array.isArray(value)) {
		throw new TypeError("A generated bridge line always has two points.");
	}
	return [Number(value[0]), Number(value[1])];
}

/**
 * Whether an element's bridge block is exactly the one the plan generated.
 * @param part the element on the board
 * @param expected the metadata the plan generated
 * @returns true when the block matches and carries nothing else
 */
function bridgeBlockMatches(part: ServerElement, expected: BridgeMetadata): boolean {
	const actualArchboard = readElementMetadata(part).archboard;
	if (
		!actualArchboard ||
		Object.keys(actualArchboard).length !== 1 ||
		!own(actualArchboard, "bridge")
	) {
		return false;
	}
	const actualBridge = BridgeMetadataSchema.safeParse(plainField(actualArchboard, "bridge"));
	return actualBridge.success && JSON.stringify(actualBridge.data) === JSON.stringify(expected);
}

/**
 * Whether an element carries no inspection field the plan did not generate, ignoring the
 * fields the server writes for itself.
 * @param actual the element's fields
 * @param expected the generated fields
 * @returns true when nothing extra is present
 */
function hasNoExtraFields(
	actual: Record<string, unknown>,
	expected: Record<string, unknown>,
): boolean {
	for (const field of INSPECTION_FIELDS) {
		if (
			!own(expected, field) &&
			!BRIDGE_VOLATILE_FIELDS.has(field) &&
			actual[field] !== undefined
		) {
			return false;
		}
	}
	return true;
}

/**
 * Whether an element on the board is byte-for-byte the line the plan would generate, which is
 * what makes a decoration still current rather than stale.
 * @param part the element on the board
 * @param expectedInput the input the plan generated
 * @returns true when the element matches
 */
function lineMatches(part: ServerElement, expectedInput: Record<string, unknown>): boolean {
	// The element is a board element; only the generated fields are compared, by value.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a board element read field by field
	const actual = part as unknown as Record<string, unknown>;
	const expected = canonicalBridgeLine(part.id, expectedInput);
	for (const [key, value] of Object.entries(expected)) {
		if (!fieldMatches(part, actual, key, value)) {
			return false;
		}
	}
	return hasNoExtraFields(actual, expected);
}

/**
 * Whether one generated field matches what the element carries. The bridge block is compared
 * through its schema; everything else by its JSON value.
 * @param part the element on the board
 * @param actual the element's fields
 * @param key the field name
 * @param value the generated value
 * @returns true when the field matches
 */
function fieldMatches(
	part: ServerElement,
	actual: Record<string, unknown>,
	key: string,
	value: unknown,
): boolean {
	if (key !== "customData") {
		return JSON.stringify(actual[key]) === JSON.stringify(value);
	}
	const expectedBridge = plainField(plainField(value, "archboard"), "bridge");
	const parsed = BridgeMetadataSchema.safeParse(expectedBridge);
	return parsed.success && bridgeBlockMatches(part, parsed.data);
}

/**
 * The customData block a bridge part carries.
 * @param metadata the bridge metadata
 * @returns the block
 */
const bridgeBlock = (metadata: BridgeMetadata) => ({ archboard: { bridge: metadata } });

/**
 * The line one half of a bridge is drawn as: the mask that hides the crossing, or the redraw
 * that puts the over-connector back on top of it.
 * @param metadata the bridge metadata the line carries
 * @param a one end of the span
 * @param b the other end
 * @param style the over-connector's stroke
 * @param mask whether this is the mask half
 * @returns the element input
 */
function bridgeLine(
	metadata: BridgeMetadata,
	a: ExactPoint,
	b: ExactPoint,
	style: StrokeStyle,
	mask: boolean,
): AgentElementInput {
	const stroke = mask ? maskStroke(metadata, style) : style;
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
		strokeColor: stroke.strokeColor,
		strokeWidth: stroke.strokeWidth,
		strokeStyle: stroke.strokeStyle,
		roughness: stroke.roughness,
		opacity: stroke.opacity,
		backgroundColor: "transparent",
		fillStyle: "solid",
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
	} satisfies AgentElementInput;
}

/**
 * The stroke a mask is drawn with: the background, painted wider and flatter than the
 * connector so it hides the crossing rather than merely covering the line.
 * @param metadata the bridge metadata
 * @param style the over-connector's stroke
 * @returns the mask's stroke
 */
function maskStroke(metadata: BridgeMetadata, style: StrokeStyle): StrokeStyle {
	return {
		strokeColor: metadata.background,
		strokeWidth: style.strokeWidth + 4,
		strokeStyle: "solid",
		roughness: 0,
		opacity: 100,
	};
}

/**
 * Every proper crossing of two connectors' segments, in a stable order so one board always
 * yields the same candidate first.
 * @param over the over-connector's segments
 * @param under the under-connector's segments
 * @returns the crossings
 */
function crossingCandidates(
	over: readonly Segment[],
	under: readonly Segment[],
): CrossingCandidate[] {
	const candidates: CrossingCandidate[] = [];
	for (const overSegment of over) {
		for (const underSegment of under) {
			const hit = intersectSegments(
				overSegment.a,
				overSegment.b,
				underSegment.a,
				underSegment.b,
				0.5,
			);
			if (hit.kind === "proper") {
				candidates.push({ over: overSegment, under: underSegment, point: hit.point });
			}
		}
	}
	return candidates.toSorted(
		(a, b) =>
			a.over.index - b.over.index ||
			a.under.index - b.under.index ||
			point(a.point).x - point(b.point).x ||
			point(a.point).y - point(b.point).y,
	);
}

export {
	bridgeCandidate,
	bridgeLine,
	bridgeMetadataOf,
	crossingCandidates,
	hasBridgeMarker,
	lineMatches,
	sameFacts,
	samePoint,
	supportedConnector,
	type CrossingCandidate,
};
