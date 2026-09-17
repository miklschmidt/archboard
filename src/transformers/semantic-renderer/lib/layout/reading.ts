// Which way a page reads, and what that means for the faces a route uses.
//
// Every board is solved in one frame, the page reading down it: a forward
// step leaves the bottom of its source and enters the top of its target, a
// return travels the right flank, a bracket the left, a frame's title band is
// at its top. A board that reads left to right is the same problem turned on
// its side: its measured sizes are transposed, solved in the one frame, and
// the drawing transposed back, so a face, a lane or a title band means one
// thing everywhere and the reading direction is a mapping in this file and
// nowhere else (ADR 0028). The engine does the same when told to lay out
// downward, so the transposed solve is the layout it would have drawn told to
// lay out rightward.

import type {
	ArchitectureDrawing,
	DrawingEdge,
	DrawingNode,
	MeasuredArchitecture,
	ReadingDirection,
} from "@/transformers/semantic-renderer/lib/drawing";
import type { Box, Point } from "@/transformers/semantic-renderer/lib/geometry";
import {
	pathOf,
	type Curve,
	type Segment,
} from "@/transformers/semantic-renderer/lib/layout/curves";

/** A face of a card or frame, in whichever frame is being spoken of. */
type Face = "NORTH" | "SOUTH" | "WEST" | "EAST";

/** A flank of the solving frame: a side a lane runs beside. */
type Flank = Extract<Face, "WEST" | "EAST">;

/** The faces of a card, ordered so a tie between two falls to the first. */
const FACES: readonly Face[] = ["WEST", "EAST", "NORTH", "SOUTH"];

/**
 * The reading conventions, as faces of the solving frame. These are the only
 * compass words the layout needs: everything else says which of these it
 * means.
 */
const SOLVING = {
	/** The face a forward step leaves its source by: ahead of it. */
	forwardOut: "SOUTH",
	/** The face a forward step enters its target by: from behind. */
	forwardIn: "NORTH",
	/** The flank a return travels, and the face it leaves and enters by. */
	returnFlank: "EAST",
	/** The flank a bracket beside a chain travels. */
	besideFlank: "WEST",
} as const satisfies Record<string, Face>;

/**
 * Where a frame's title band sits in the solving frame. A title is always at
 * the top of the page, so a page read down has it on the frame's top face and
 * a page read left to right, solved transposed, has it on the frame's left.
 */
type HeaderSide = "NORTH" | "WEST";

/**
 * The side a frame's title band takes in the solving frame.
 * @param direction The way the page reads.
 * @returns The header's face in the solving frame.
 */
function headerSideOf(direction: ReadingDirection): HeaderSide {
	return direction === "down" ? "NORTH" : "WEST";
}

/** The axis a frame's title band runs along in the solving frame, and the axis across it. */
const HEADER_AXES: Record<HeaderSide, { readonly along: "x" | "y"; readonly across: "x" | "y" }> = {
	NORTH: { along: "x", across: "y" },
	WEST: { along: "y", across: "x" },
};

/**
 * The axis across a frame's title band: the one a route leaving the band
 * travels along first.
 * @param header Where the title band sits.
 * @returns The axis.
 */
function headerAxis(header: HeaderSide): "x" | "y" {
	return HEADER_AXES[header].across;
}

/**
 * A frame's insets on its top and left: the title band on the header side,
 * room for a route on the other.
 * @param header Where the title band sits.
 * @param band The title band and its air.
 * @param inset Room for a route.
 * @returns The top and left insets.
 */
function headerInsets(
	header: HeaderSide,
	band: number,
	inset: number,
): { readonly top: number; readonly left: number } {
	return header === "NORTH" ? { top: band, left: inset } : { top: inset, left: band };
}

/** The page face each solving-frame face is drawn on, per direction. */
const PAGE_FACE: Record<ReadingDirection, Record<Face, Face>> = {
	down: { NORTH: "NORTH", SOUTH: "SOUTH", WEST: "WEST", EAST: "EAST" },
	right: { NORTH: "WEST", SOUTH: "EAST", WEST: "NORTH", EAST: "SOUTH" },
};

/**
 * The face on the page a solving-frame face lands on.
 * @param face The face in the solving frame.
 * @param direction The way the page reads.
 * @returns The face a reader sees.
 */
function pageFace(face: Face, direction: ReadingDirection): Face {
	return PAGE_FACE[direction][face];
}

/** The face opposite each face. */
const OPPOSITE: Record<Face, Face> = {
	NORTH: "SOUTH",
	SOUTH: "NORTH",
	WEST: "EAST",
	EAST: "WEST",
};

/**
 * The face across from one.
 * @param face A face.
 * @returns Its opposite.
 */
function opposite(face: Face): Face {
	return OPPOSITE[face];
}

/**
 * Whether a face is a flank of the solving frame: a side a lane runs beside.
 * @param face A face.
 * @returns True for the two flanks.
 */
function isFlank(face: string | undefined): face is Flank {
	return face === "WEST" || face === "EAST";
}

/**
 * Whether a face is the flank at the lower coordinate across the reading:
 * the left one when the page reads down. Where a lane beside it runs, and
 * which way the engine walks its ports, follow from that alone, whichever
 * flank rule put a route there.
 * @param face A face.
 * @returns True for the near flank.
 */
function isNearFlank(face: string | undefined): boolean {
	return isFlank(face) && !FACE_GEOMETRY[face].far;
}

/**
 * Whether the engine walks a face against the axis along it. It orders a
 * card's ports clockwise from the corner the page starts at, so an index
 * counts up along the face a step arrives by and the far flank, and back down
 * the face a step leaves by and the near one. Two ports on faces that are
 * walked in opposite senses are in the same order to the engine and the
 * reverse order to a reader, which is why a relationship's two ends are
 * seated mirrored (`flank-rules.ts`).
 * @param face A face.
 * @returns True when a higher index sits earlier along the face.
 */
function walksBackward(face: string | undefined): boolean {
	return face === SOLVING.forwardOut || isNearFlank(face);
}

/**
 * The flank two attachments share, when both lie on the same one.
 * @param side The source's face.
 * @param targetSide The target's face.
 * @returns The shared flank, or nothing.
 */
function sharedFlank(side: string | undefined, targetSide: string | undefined): Flank | undefined {
	return isFlank(side) && side === targetSide ? side : undefined;
}

/**
 * A face read back from the engine's port option, which is a string.
 * @param value The option's value.
 * @returns The face.
 * @throws {Error} When the value names no face.
 */
function asFace(value: string | undefined): Face {
	const face = FACES.find((candidate) => candidate === value);
	if (face === undefined) throw new Error(`Layout gave a port no face: ${String(value)}`);
	return face;
}

/**
 * The flank a crossing bundles down when it cannot take the face it travels:
 * the one the title band is not on, which is the beside flank with the title
 * on top and the frame's foot on the page with the title on the left. A
 * crossing never runs across a title.
 */
const CLEAR_OF_BAND: Record<HeaderSide, Flank> = { NORTH: "WEST", WEST: "EAST" };

/**
 * The flank at the higher coordinate across the reading: the one the engine
 * walks along that coordinate rather than back down it. Read from the one
 * record of how a face lies on a box rather than written down twice.
 * @returns The far flank.
 */
function farFlank(): Flank {
	return isNearFlank("WEST") ? "EAST" : "WEST";
}

/**
 * The face a route crosses a frame boundary by, given the face it would
 * otherwise take.
 *
 * A crossing normally takes a flank, so routes through a frame bundle down one
 * edge of it rather than cutting across its middle, and a route already
 * travelling a flank keeps the one it is on.
 *
 * A route that must not be reordered against a sister crosses straight on by
 * the face it travels instead. The engine will not be told where a crossing
 * sits: it ignores the index a boundary port carries and seats the crossings
 * of a face itself, in the order it walks the source's face — which is the
 * reverse of the order a reader follows them in when they bundle down the
 * flank `CLEAR_OF_BAND` names, so two relationships sharing both endpoints
 * meet twice there and not at all going straight through (TASK-258).
 *
 * The title band is the frame's own and never a corridor, so a route whose
 * face is the band bundles even when it must not be reordered — and then down
 * the far flank, where the engine's seating agrees with the order a reader
 * follows. That case is a route into a frame with its title on top; with the
 * title on the left the two flanks are the same one and the choice does not
 * arise.
 * @param face The face the route leaves or arrives by.
 * @param header Where the frame's title band sits.
 * @param straight Whether the route carries on by the face it travels rather than bundling down a flank.
 * @returns The face of the frame the crossing takes.
 */
function crossingFace(face: Face, header: HeaderSide, straight: boolean): Face {
	if (face !== header && (straight || isFlank(face))) return face;
	return straight ? farFlank() : CLEAR_OF_BAND[header];
}

/** How each face lies on a box: the axis along it, the one across it, and whether it is the far side. */
const FACE_GEOMETRY: Record<
	Face,
	{ readonly along: "x" | "y"; readonly across: "x" | "y"; readonly far: boolean }
> = {
	NORTH: { along: "x", across: "y", far: false },
	SOUTH: { along: "x", across: "y", far: true },
	WEST: { along: "y", across: "x", far: false },
	EAST: { along: "y", across: "x", far: true },
};

/**
 * How a face lies on a box.
 * @param face The face.
 * @returns The axis along it, the axis across it, and whether it is the far side.
 */
function faceGeometry(face: Face): (typeof FACE_GEOMETRY)[Face] {
	return FACE_GEOMETRY[face];
}

/**
 * The coordinate across a face: where the face lies on its box.
 * @param face The face.
 * @param box The box.
 * @returns The x of a flank, the y of a top or bottom.
 */
function faceLine(face: Face, box: Box): number {
	const { across, far } = FACE_GEOMETRY[face];
	return box[across] + (far ? box[across === "x" ? "width" : "height"] : 0);
}

/**
 * A point on a face, some way along it.
 * @param face The face.
 * @param box The box.
 * @param fraction How far along the face, from 0 to 1.
 * @returns The point.
 */
function pointOnFace(face: Face, box: Box, fraction: number): Point {
	const { along } = FACE_GEOMETRY[face];
	const alongStart = box[along] + box[along === "x" ? "width" : "height"] * fraction;
	return along === "x"
		? { x: alongStart, y: faceLine(face, box) }
		: { x: faceLine(face, box), y: alongStart };
}

/**
 * How far a point lies from a face's line.
 * @param face The face.
 * @param point The point.
 * @param box The box.
 * @returns The distance across the face.
 */
function faceDistance(face: Face, point: Point, box: Box): number {
	return Math.abs(point[FACE_GEOMETRY[face].across] - faceLine(face, box));
}

/**
 * The face of a box a point lies nearest. A port lies on a face, never a
 * corner, so two faces tie only when a route ended off its box; the fixed
 * order of the faces decides then.
 * @param point The point.
 * @param box The box.
 * @returns The nearest face.
 */
function nearestFace(point: Point, box: Box): Face {
	return FACES.map((face) => [face, faceDistance(face, point, box)] as const).toSorted(
		(one, other) => one[1] - other[1],
	)[0]![0];
}

/**
 * A point with its axes swapped.
 * @param point The point.
 * @returns The same point in the other frame.
 */
function transposePoint(point: Point): Point {
	return { x: point.y, y: point.x };
}

/**
 * A box with its axes swapped.
 * @param box The box.
 * @returns The same box in the other frame.
 */
function transposeBox(box: Box): Box {
	return { x: box.y, y: box.x, width: box.height, height: box.width };
}

/**
 * A segment with its axes swapped.
 * @param segment The segment.
 * @returns The same segment in the other frame.
 */
function transposeSegment(segment: Segment): Segment {
	return segment.kind === "line"
		? { kind: "line", to: transposePoint(segment.to) }
		: {
				kind: "cubic",
				first: transposePoint(segment.first),
				second: transposePoint(segment.second),
				to: transposePoint(segment.to),
			};
}

/**
 * A route with its axes swapped.
 * @param curve The route.
 * @returns The same route in the other frame.
 */
function transposeCurve(curve: Curve): Curve {
	return { from: transposePoint(curve.from), segments: curve.segments.map(transposeSegment) };
}

/**
 * Measured sizes with their axes swapped: what the engine is given when the
 * page reads left to right. Text runs stay as they are, being relative to
 * the card they sit in, and a frame's header stays its header.
 * @param measured The measured sizes.
 * @returns The same sizes in the other frame.
 */
function transposeMeasured(measured: MeasuredArchitecture): MeasuredArchitecture {
	return {
		nodes: new Map(
			[...measured.nodes].map(([id, node]) => [
				id,
				{ ...node, width: node.height, height: node.width },
			]),
		),
		labels: new Map(
			[...measured.labels].map(([id, label]) => [
				id,
				{ ...label, width: label.height, height: label.width },
			]),
		),
	};
}

/**
 * A placed node with its axes swapped.
 * @param node The node.
 * @returns The same node in the other frame.
 */
function transposeNode(node: DrawingNode): DrawingNode {
	return {
		...node,
		measured: { ...node.measured, width: node.measured.height, height: node.measured.width },
		box: transposeBox(node.box),
	};
}

/**
 * A routed relationship with its axes swapped.
 * @param edge The relationship.
 * @returns The same relationship in the other frame.
 */
function transposeEdge(edge: DrawingEdge): DrawingEdge {
	const curve = transposeCurve(edge.curve);
	return {
		...edge,
		curve,
		path: pathOf(curve),
		...(edge.label === undefined
			? {}
			: {
					label: {
						box: transposeBox(edge.label.box),
						measured: {
							...edge.label.measured,
							width: edge.label.measured.height,
							height: edge.label.measured.width,
						},
					},
				}),
	};
}

/**
 * A drawing with its axes swapped: the solved transposed problem turned back
 * onto the page, or a page drawing turned into the solving frame to seed a
 * successor. Its direction is what it was.
 * @param drawing The drawing.
 * @returns The same drawing in the other frame.
 */
function transposeDrawing(drawing: ArchitectureDrawing): ArchitectureDrawing {
	return {
		...drawing,
		width: drawing.height,
		height: drawing.width,
		cards: drawing.cards.map(transposeNode),
		containers: drawing.containers.map(transposeNode),
		edges: drawing.edges.map(transposeEdge),
	};
}

/**
 * Measured sizes in the solving frame for a direction.
 * @param direction The way the page reads.
 * @param measured The sizes on the page.
 * @returns The sizes the engine solves with.
 */
function measuredInFrame(
	direction: ReadingDirection,
	measured: MeasuredArchitecture,
): MeasuredArchitecture {
	return direction === "down" ? measured : transposeMeasured(measured);
}

/**
 * A drawing turned between the page and the solving frame for a direction:
 * the same operation both ways, since transposing twice is the identity.
 * @param direction The way the page reads.
 * @param drawing The drawing in one frame.
 * @returns The drawing in the other.
 */
function drawingAcross(
	direction: ReadingDirection,
	drawing: ArchitectureDrawing,
): ArchitectureDrawing {
	return direction === "down" ? drawing : transposeDrawing(drawing);
}

export {
	FACES,
	type Face,
	type Flank,
	type HeaderSide,
	type ReadingDirection,
	SOLVING,
	asFace,
	crossingFace,
	drawingAcross,
	faceDistance,
	faceGeometry,
	headerAxis,
	headerInsets,
	headerSideOf,
	isFlank,
	isNearFlank,
	measuredInFrame,
	nearestFace,
	opposite,
	pageFace,
	pointOnFace,
	sharedFlank,
	transposeBox,
	transposePoint,
	walksBackward,
};
