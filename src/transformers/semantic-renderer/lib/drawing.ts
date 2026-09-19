// Measurement and placement meet here; painters consume these values unchanged.
import type { SemanticEdge, SemanticNode } from "@/shared/semantic-board/index";
import type { DiagramFont } from "@/transformers/semantic-renderer/lib/fonts";
import type { Box } from "@/transformers/semantic-renderer/lib/geometry";
import type { Curve } from "@/transformers/semantic-renderer/lib/layout/curves";

/** One measured line, positioned relative to its card or label box. */
interface TextRun {
	readonly text: string;
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly font: DiagramFont;
	readonly fontSize: number;
	readonly role: "title" | "note" | "label";
}

/** Text and minimum dimensions supplied to the compound layout owner. */
interface MeasuredNode {
	readonly node: SemanticNode;
	readonly width: number;
	readonly height: number;
	/** Zero for a card; the reserved title area for a containing node. */
	readonly headerHeight: number;
	readonly runs: readonly TextRun[];
}

/** A relationship label whose words and box are settled before routing. */
interface MeasuredLabel {
	readonly width: number;
	readonly height: number;
	readonly runs: readonly TextRun[];
}

/** All measured subjects, keyed by their existing architectural identities. */
interface MeasuredArchitecture {
	readonly nodes: ReadonlyMap<string, MeasuredNode>;
	readonly labels: ReadonlyMap<string, MeasuredLabel>;
}

/** One card or containing frame, in the final drawing coordinate space. */
interface DrawingNode {
	readonly measured: MeasuredNode;
	readonly box: Box;
	readonly depth: number;
}

/** A final route and its optional measured label in the same coordinates. */
interface DrawingEdge {
	readonly edge: SemanticEdge;
	readonly curve: Curve;
	readonly path: string;
	readonly label?: { readonly box: Box; readonly measured: MeasuredLabel };
}

/** The way a page reads: down it, or left to right across it (ADR 0028). */
type ReadingDirection = "down" | "right";

/**
 * Which flank a return travels and how a forward skip attaches
 * (docs/design/layout-rules.md section 21): returns on the right with a
 * bracket on the left and every other skip the engine's; returns on the right
 * with every skip on the left; the mirror of that; or returns on the left
 * with every skip the engine's.
 */
type FlankRuleName = "bracketed" | "flanked" | "mirrored" | "returns-left";

/** The single geometry result consumed by both SVG painting and the atlas. */
interface ArchitectureDrawing {
	/** Which way this content reads on the page. */
	readonly direction: ReadingDirection;
	/** Whether its layers fold toward the pane's shape, chosen and kept like the direction. */
	readonly wrapped: boolean;
	/** Its flank rule, chosen for this content. */
	readonly flanks: FlankRuleName;
	readonly width: number;
	readonly height: number;
	readonly cards: readonly DrawingNode[];
	readonly containers: readonly DrawingNode[];
	readonly edges: readonly DrawingEdge[];
}

/** A raised arc where one route crosses others, on the route that carries it. */
interface DrawingBridge {
	readonly edgeId: string;
	readonly under: readonly string[];
	readonly curve: Curve;
}

/**
 * The drawing as the painter draws it: the routes with their bridges spliced
 * in, beside the un-bridged routes that identify their corridors. The layout
 * owner returns both, so painter, atlas and interaction share one geometry.
 */
interface PaintedDrawing extends ArchitectureDrawing {
	readonly bridged: {
		readonly edges: readonly DrawingEdge[];
		readonly bridges: readonly DrawingBridge[];
	};
}

export type {
	FlankRuleName,
	ReadingDirection,
	TextRun,
	MeasuredNode,
	MeasuredLabel,
	MeasuredArchitecture,
	DrawingNode,
	DrawingEdge,
	ArchitectureDrawing,
	DrawingBridge,
	PaintedDrawing,
};
