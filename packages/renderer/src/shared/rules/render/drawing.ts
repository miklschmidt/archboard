// Measurement and placement meet here, in the drawing that layout answers and
// the renderer core paints unchanged (ADR 0057). The drawing is the core's
// input contract, so its types are the core's, generated from its Rust types:
// the layout holds the board's own nodes and relationships in it, and the core
// reads of them only what it paints.
import type { SemanticEdge, SemanticNode } from "@archboard/board/content";
import type * as Core from "#shared/protocol/generated/core/types.ts";

/** One measured line, positioned relative to its card or label box. */
type TextRun = Core.TextRun;

/** Text and minimum dimensions supplied to the layout engine. */
type MeasuredNode = Core.MeasuredNode<SemanticNode>;

/** A relationship label whose words and box are settled before routing. */
type MeasuredLabel = Core.MeasuredLabel;

/** How a relationship's line is drawn, as the vault's policy says, where crossings are settled. */
type LineLook = Pick<Core.LineAppearance, "dash" | "arrowhead">;

/** All measured subjects, keyed by their existing architectural identities. */
interface MeasuredArchitecture {
	readonly nodes: ReadonlyMap<string, MeasuredNode>;
	readonly labels: ReadonlyMap<string, MeasuredLabel>;
	/** How each line is drawn, by relationship id: its dash and its head, as the vault's policy says. */
	readonly lines: ReadonlyMap<string, LineLook>;
	/** The group each node is placed with, and each placing group's measured caption (TASK-347). */
	readonly groups?: MeasuredGroups | undefined;
}

/** Which group places each node, and the caption each placing group is drawn with. */
interface MeasuredGroups {
	/**
	 * A node's placing group, by node id, as regions gather it; a node with
	 * none is absent, as is one inside a container its group places, which
	 * stands in that group's region already.
	 */
	readonly placing: ReadonlyMap<string, string>;
	/** Each placing group's name, measured as its region caption. */
	readonly captions: ReadonlyMap<string, MeasuredLabel>;
}

/** One card or containing frame, in the final drawing coordinate space. */
type DrawingNode = Core.DrawingNode<SemanticNode>;

/** A final route and its optional measured label in the same coordinates. */
type DrawingEdge = Core.DrawingEdge<SemanticEdge>;

/** Which way content reads on the page: architecture diagrams read top to bottom. */
type ReadingDirection = Core.ReadingDirection;

/** The single geometry result consumed by both painting and the atlas. */
type ArchitectureDrawing = Core.ArchitectureDrawing<SemanticNode, SemanticEdge>;

/** A raised arc where one route crosses others, on the route that carries it. */
type DrawingBridge = Core.DrawingBridge;

/**
 * The drawing as the core paints it: the routes with their bridges spliced
 * in, beside the un-bridged routes that identify their corridors. The layout
 * owner returns both, so painter, atlas and interaction share one geometry.
 */
type PaintedDrawing = Core.PaintedDrawing<SemanticNode, SemanticEdge>;

export type {
	ReadingDirection,
	TextRun,
	MeasuredNode,
	MeasuredLabel,
	LineLook,
	MeasuredArchitecture,
	MeasuredGroups,
	DrawingNode,
	DrawingEdge,
	ArchitectureDrawing,
	DrawingBridge,
	PaintedDrawing,
};
