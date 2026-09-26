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
	/** The group each node is placed with, and each placing group's measured caption (TASK-347). */
	readonly groups?: MeasuredGroups | undefined;
}

/** Which group places each node, and the caption each placing group is drawn with. */
interface MeasuredGroups {
	/** A node's placing group, by node id; a node with none is absent. */
	readonly placing: ReadonlyMap<string, string>;
	/** Each placing group's name, measured as its region caption. */
	readonly captions: ReadonlyMap<string, MeasuredLabel>;
}

/** One card or containing frame, in the final drawing coordinate space. */
interface DrawingNode {
	readonly measured: MeasuredNode;
	readonly box: Box;
	readonly depth: number;
}

/** A group's region: the cards one group places inside one container, gathered and captioned. */
interface DrawingRegion {
	readonly group: string;
	/** The container the region sits in; absent on the board itself. */
	readonly parent?: string | undefined;
	readonly box: Box;
	/** Where its caption sits, and its words. */
	readonly caption: { readonly box: Box; readonly measured: MeasuredLabel };
	readonly depth: number;
}

/** A final route and its optional measured label in the same coordinates. */
interface DrawingEdge {
	readonly edge: SemanticEdge;
	readonly curve: Curve;
	readonly path: string;
	readonly label?: { readonly box: Box; readonly measured: MeasuredLabel };
}

/** Architecture diagrams read top to bottom. */
type ReadingDirection = "down";

/** The single geometry result consumed by both SVG painting and the atlas. */
interface ArchitectureDrawing {
	/** Which way this content reads on the page. */
	readonly direction: ReadingDirection;
	readonly width: number;
	readonly height: number;
	readonly cards: readonly DrawingNode[];
	readonly containers: readonly DrawingNode[];
	readonly edges: readonly DrawingEdge[];
	/** Group regions, when the engine gathers groups (TASK-347). */
	readonly regions?: readonly DrawingRegion[] | undefined;
}

/** A raised arc where one route crosses others, on the route that carries it. */
interface DrawingBridge {
	readonly edgeId: string;
	readonly under: readonly string[];
	readonly curve: Curve;
	/** A join on the upper line stands on this piece: the cut clears its mark too. */
	readonly join?: true;
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
	ReadingDirection,
	TextRun,
	MeasuredNode,
	MeasuredLabel,
	MeasuredArchitecture,
	MeasuredGroups,
	DrawingNode,
	DrawingRegion,
	DrawingEdge,
	ArchitectureDrawing,
	DrawingBridge,
	PaintedDrawing,
};
